import { GoogleGenAI, Type } from '@google/genai';

// Définition d'une erreur IA personnalisée
export class AIError extends Error {
  code: string;
  constructor(message: string, code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

// Fonction utilitaire pour instancier le SDK
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === 'VOTRE_CLE_API_ICI') {
    throw new AIError("Clé API Gemini non configurée ou manquante.", "MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
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
export async function generateStructuredJSON(systemInstruction: string, prompt: string, schema: any, pdfBase64?: string) {
  const startTime = Date.now();
  console.log(`\n[IA_START] Action: generateStructuredJSON | Model: gemini-2.0-flash`);
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

    // Appel à l'API via le nouveau SDK
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        // schema est un objet SchemaType du nouveau SDK
        responseSchema: schema
      }
    });

    const rawText = response.text || "";
    console.log(`[IA_RAW] Response length: ${rawText.length}`);
    
    const parsedJSON = parseAndValidateJSON(rawText, 'generateStructuredJSON');
    
    const duration = Date.now() - startTime;
    console.log(`[IA_PERF] Success | Duration: ${duration}ms`);
    console.log(`[IA_JSON_PARSED] Sample: ${JSON.stringify(parsedJSON).substring(0, 100)}...`);
    
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
export async function streamStructuredJSON(systemInstruction: string, prompt: string, schema: any, pdfBase64?: string) {
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
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    // On retourne un ReadableStream pour l'API Route
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let chunkCount = 0;
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(chunk.text);
              chunkCount++;
            }
          }
          const duration = Date.now() - startTime;
          console.log(`[IA_PERF] Stream Success | Duration: ${duration}ms | Chunks: ${chunkCount}`);
        } catch (streamError: any) {
          console.error(`[IA_ERROR] Erreur pendant le stream:`, streamError);
          // On s'assure d'envoyer un JSON d'erreur STRICT que le frontend captera
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
