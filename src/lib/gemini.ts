import { GoogleGenAI, Type } from '@google/genai';
import { supabaseAdmin } from './supabase/admin';

// Interface pour le tracking des coûts et de l'usage
export interface GeminiTrackingContext {
  userId?: string;
  feature: string;      // 'flashcards', 'evaluate_qcm', 'worker_master', etc.
  documentId?: string;
}

// Définition d'une erreur IA personnalisée
export class AIError extends Error {
  code: string;
  constructor(message: string, code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

// Fonction de log d'usage asynchrone (non bloquante)
function trackSaaSUsage(
  context: GeminiTrackingContext | undefined,
  durationMs: number,
  promptTokens: number,
  completionTokens: number
) {
  if (!context) return;
  
  // Prix public Gemini 2.5 Flash: ~0.075$ / 1M prompt tokens et 0.30$ / 1M completion tokens
  const costUsd = (promptTokens / 1_000_000) * 0.075 + (completionTokens / 1_000_000) * 0.30;
  
  console.log(`[SaaS METRICS] ${context.feature} | Tokens: ${promptTokens}+${completionTokens} | Coût: $${costUsd.toFixed(6)} | Temps: ${durationMs}ms`);
  
  // Insertion DB asynchrone (fire and forget)
  supabaseAdmin.from('saas_metrics').insert({
    user_id: context.userId || null,
    feature: context.feature,
    document_id: context.documentId || null,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: costUsd,
    duration_ms: durationMs
  }).then(({ error }) => {
    if (error) console.error("[SaaS METRICS ERROR] Impossible d'insérer les métriques:", error.message);
  });
}

// Fonction utilitaire pour instancier le SDK
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === 'VOTRE_CLE_API_ICI') {
    throw new AIError("Clé API Gemini non configurée ou manquante.", "MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
}

// Détecte si une erreur Gemini est transitoire et mérite un retry
function isRetryableError(error: any): boolean {
  const message = (error.message || '').toLowerCase();
  const status = error.status || error.httpStatusCode || 0;
  // 429 = Rate limit, 500 = Internal error, 503 = Overloaded
  if ([429, 500, 503].includes(status)) return true;
  if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) return true;
  if (message.includes('500') || message.includes('internal')) return true;
  if (message.includes('503') || message.includes('overloaded') || message.includes('unavailable')) return true;
  if (message.includes('econnreset') || message.includes('etimedout') || message.includes('fetch failed')) return true;
  return false;
}

// Extrait le délai suggéré par Gemini (RESOURCE_EXHAUSTED renvoie souvent "retryDelay": "12s")
function extractServerRetryMs(error: any): number | null {
  try {
    const raw = (error.message || '') + ' ' + JSON.stringify(error.details || error.error || {});
    const m = raw.match(/retry(?:Delay|-after)["':\s]*"?(\d+(?:\.\d+)?)(m?s)?/i);
    if (m) {
      const val = parseFloat(m[1]);
      return m[2] === 's' || !m[2] ? Math.round(val * 1000) : Math.round(val);
    }
  } catch {}
  return null;
}

// Retry avec backoff exponentiel + FULL JITTER (anti thundering herd sous burst 429).
// Le jitter désynchronise les retries de centaines de requêtes qui 429 en même temps.
async function retryWithBackoff<T>(fn: () => Promise<T>, caller: string, maxRetries: number = 5): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries - 1 && isRetryableError(error)) {
        // Base exponentielle (1s, 2s, 4s, 8s...) plafonnée à 20s, puis FULL JITTER [0, base].
        const expBase = Math.min(20000, 1000 * Math.pow(2, attempt));
        const jittered = Math.floor(Math.random() * expBase);
        // Si le serveur suggère un délai (429), on prend le plus prudent des deux.
        const serverMs = extractServerRetryMs(error);
        const delay = Math.max(jittered, serverMs ? Math.min(serverMs, 30000) : 0) || 500;
        console.warn(`[IA_RETRY] ${caller} | Tentative ${attempt + 1}/${maxRetries} échouée (${error.message}). Retry dans ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Erreur non-retryable ou dernière tentative
      }
    }
  }
  throw lastError;
}

// Nettoyage JSON robuste (pour éviter les erreurs de parsing si l'IA ajoute des backticks)
function parseAndValidateJSON(rawResponse: string, caller: string): any {
  let cleanedText = rawResponse.trim();
  if (cleanedText.startsWith('```json')) cleanedText = cleanedText.slice(7);
  else if (cleanedText.startsWith('```')) cleanedText = cleanedText.slice(3);
  
  if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);
  cleanedText = cleanedText.trim();

  try {
    return JSON.parse(cleanedText);
  } catch (parseError: any) {
    console.error(`[${caller}] JSON parsing failed:`, parseError);
    console.error(`[${caller}] Raw response was:`, rawResponse);
    throw new AIError(`L'IA a renvoyé un format illisible. Détail: ${parseError.message}`, "INVALID_JSON");
  }
}

/**
 * 1. GÉNÉRATION DE JSON (Pour les Server Actions comme les Flashcards)
 */
export async function generateStructuredJSON(systemInstruction: string, prompt: string, schema: any, pdfBase64?: string, trackingContext?: GeminiTrackingContext, temperature?: number) {
  const startTime = Date.now();
  console.log(`\n[IA_START] Action: generateStructuredJSON | Model: gemini-2.5-flash`);
  console.log(`[IA_PROMPT] ${prompt.substring(0, 200)}...`);

  try {
    const ai = getAIClient();
    
    // Construction des contenus
    const contents: any[] = [];
    if (pdfBase64) {
      contents.push({
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBase64
        }
      });
    }
    contents.push({ text: prompt });

    // Appel à l'API avec retry automatique sur erreurs transitoires
    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(temperature !== undefined ? { temperature } : {})
      }
    }), 'generateStructuredJSON');

    const rawText = response.text || "";
    console.log(`[IA_RAW] Response length: ${rawText.length}`);
    
    const parsedJSON = parseAndValidateJSON(rawText, 'generateStructuredJSON');
    
    const duration = Date.now() - startTime;
    console.log(`[IA_PERF] Success | Duration: ${duration}ms`);
    console.log(`[IA_JSON_PARSED] Sample: ${JSON.stringify(parsedJSON).substring(0, 100)}...`);
    
    // -- SaaS TRACKING --
    if (response.usageMetadata) {
      trackSaaSUsage(
        trackingContext,
        duration,
        response.usageMetadata.promptTokenCount || 0,
        response.usageMetadata.candidatesTokenCount || 0
      );
    }
    
    return parsedJSON;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`[IA_PERF] Failed | Duration: ${duration}ms`);
    console.error(`[IA_ERROR] ${error.message}`);
    
    if (error instanceof AIError) throw error;
    
    // Standardisation des erreurs réseau / timeout
    throw new AIError(`Erreur lors de la communication avec Gemini: ${error.message}`, "API_ERROR");
  }
}

/**
 * 2. STREAMING DE JSON (Pour les API Routes comme QCM et Rédaction)
 */
export async function streamStructuredJSON(systemInstruction: string, prompt: string, schema: any, pdfBase64?: string, signal?: AbortSignal, trackingContext?: GeminiTrackingContext) {
  const startTime = Date.now();
  console.log(`\n[IA_START] Action: streamStructuredJSON | Model: gemini-2.5-flash`);
  console.log(`[IA_PROMPT] ${prompt.substring(0, 200)}...`);

  const ai = getAIClient();
  
  const contents: any[] = [];
  if (pdfBase64) {
    contents.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }
  contents.push({ text: prompt });

  try {
    // Retry sur l'initialisation du stream (les erreurs 429/503 surviennent ici)
    const stream = await retryWithBackoff(() => ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    }), 'streamStructuredJSON');

    // On retourne un ReadableStream pour l'API Route.
    // Protocole "buffer + heartbeat" : on accumule le JSON du modèle côté serveur et on n'émet que
    // des espaces (keep-alive anti-timeout proxy) tant que la génération n'est pas terminée. On flushe
    // le JSON complet en une seule fois à la fin (succès) OU un objet d'erreur PROPRE (échec).
    // Cela empêche de corrompre le flux en collant un {error} à un JSON partiel non refermé.
    const readableStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let chunkCount = 0;
        let finalUsageMetadata: any = null;
        let aborted = false;
        try {
          for await (const chunk of stream) {
            // Capturer les métadonnées de consommation (généralement sur le dernier chunk)
            if (chunk.usageMetadata) {
              finalUsageMetadata = chunk.usageMetadata;
            }

            // Memory leak prevention: if the client aborted the request, stop reading from the stream
            if (signal?.aborted) {
              console.log(`[IA_STREAM] Client aborted request. Breaking stream loop.`);
              aborted = true;
              break;
            }
            if (chunk.text) {
              buffer += chunk.text;
              chunkCount++;
              // Heartbeat : un espace maintient la connexion ouverte sans polluer le JSON final
              // (JSON.parse tolère les espaces de tête et le client fait un .trim()).
              controller.enqueue(" ");
            }
          }

          if (!aborted) {
            const duration = Date.now() - startTime;
            console.log(`[IA_PERF] Stream Success | Duration: ${duration}ms | Chunks: ${chunkCount}`);

            // Flush du JSON complet en une seule fois → toujours parsable côté client.
            controller.enqueue(buffer);

            // -- SaaS TRACKING --
            if (finalUsageMetadata) {
              trackSaaSUsage(
                trackingContext,
                duration,
                finalUsageMetadata.promptTokenCount || 0,
                finalUsageMetadata.candidatesTokenCount || 0
              );
            }
          }

        } catch (streamError: any) {
          console.error(`[IA_ERROR] Erreur pendant le stream:`, streamError);
          // Seuls des espaces ont été émis jusqu'ici → on peut envoyer un JSON d'erreur PROPRE
          // que le frontend saura parser (il détecte la clé .error).
          const errorJson = JSON.stringify({ error: `Stream interruption: ${streamError.message}`, code: "STREAM_ERROR" });
          controller.enqueue(errorJson);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`[IA_PERF] Stream Init Failed | Duration: ${duration}ms`);
    console.error(`[IA_ERROR] ${error.message}`);
    
    // Si l'initialisation du stream échoue (ex: mauvaise clé API), on renvoie une réponse HTTP d'erreur JSON
    const errorResponse = {
      error: `Impossible de démarrer l'IA: ${error.message}`,
      code: "INIT_ERROR"
    };
    return new Response(JSON.stringify(errorResponse), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
