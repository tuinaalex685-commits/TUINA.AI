import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from '@google/genai';
// @ts-ignore
import pdfParse from 'pdf-parse';
import crypto from 'crypto';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function runWorker(workerUrlStr?: string) {
  try {
    // NETTOYAGE DES JOBS ZOMBIES : Si un job est en 'en_cours' depuis + de 15 min sans heartbeat récent, on le remet en 'pending'
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: zombieJobs } = await supabaseAdmin
      .from('etude_cours')
      .select('id')
      .eq('statut_generation', 'en_cours')
      .or(`heartbeat.is.null,heartbeat.lt.${fifteenMinAgo}`);

    if (zombieJobs && zombieJobs.length > 0) {
      console.log(`[Worker] ${zombieJobs.length} job(s) zombie(s) détecté(s). Réinitialisation...`);
      for (const zombie of zombieJobs) {
        await supabaseAdmin.from('etude_cours').update({
          statut_generation: 'pending',
          started_at: null,
          heartbeat: null,
          last_error: 'Job zombie réinitialisé automatiquement',
          updated_at: new Date().toISOString()
        }).eq('id', zombie.id);
      }
    }

    // Limite élargie pour Vercel / File d'attente
    const { count, error: countError } = await supabaseAdmin
      .from('etude_cours')
      .select('id', { count: 'exact', head: true })
      .eq('statut_generation', 'en_cours');
      
    if (countError) throw new Error("Erreur de comptage");
    if ((count || 0) >= 30) {
      console.log("[Worker] File pleine (30 en cours). Retourne.");
      return { message: "File pleine" };
    }
    // Récupérer un job en attente OU en erreur (retry) si son temps de next_retry est passé
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('etude_cours')
      .select('id, pdf_id, retry_count')
      .or('statut_generation.eq.pending,and(statut_generation.eq.erreur,next_retry.lte.now())')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !job) {
      return { message: "Aucun job en attente" };
    }

    // Lock atomique du job et mise à jour des métadonnées de démarrage
    const { data: updatedJob, error: lockError } = await supabaseAdmin
      .from('etude_cours')
      .update({ 
        statut_generation: 'en_cours', 
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat: new Date().toISOString()
      })
      .eq('id', job.id)
      .in('statut_generation', ['pending', 'erreur']) // Supporte le lock depuis 'erreur' pour les retries
      .select()
      .single();

    if (lockError || !updatedJob) {
      console.log("[Worker] Job déjà pris par un autre processus.");
      return { message: "Job déjà pris" };
    }

    const startTime = Date.now();

    try {
      // 1. Récupérer le document (colonnes de base garanties d'exister)
      const { data: document, error: docError } = await supabaseAdmin
        .from('documents')
        .select('url_fichier, extracted_text')
        .eq('id', job.pdf_id)
        .single();

      if (docError || !document) {
        console.error(`[Worker] Document introuvable pour pdf_id=${job.pdf_id}. Erreur Supabase:`, docError?.message);
        throw new Error(`Document introuvable (pdf_id: ${job.pdf_id}). Vérifiez que le document existe dans la table 'documents'.`);
      }

      // 1b. Récupérer l'intelligence pédagogique séparément (la colonne peut ne pas exister en prod)
      let existingIntelligenceFromDB: any = null;
      try {
        const { data: intellDoc } = await supabaseAdmin
          .from('documents')
          .select('intelligence_pedagogique')
          .eq('id', job.pdf_id)
          .single();
        existingIntelligenceFromDB = intellDoc?.intelligence_pedagogique || null;
      } catch (intellError: any) {
        console.warn(`[Worker] Colonne intelligence_pedagogique inaccessible (probablement inexistante): ${intellError.message}. Continuation sans cache.`);
      }

      let extractTime = 0;
      let aiTime = 0;
      let dbTime = 0;

      let text = document.extracted_text;
      
      // 2. Si le texte n'est pas en cache, on le télécharge et on le parse
      if (!text) {
        console.log(`[Worker] Cache MISS pour extracted_text. Téléchargement du PDF...`);
        const tExtractStart = performance.now();
        const response = await fetch(document.url_fichier);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Hash (déduplication)
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        await supabaseAdmin.from('etude_cours').update({ generation_hash: hash }).eq('id', job.id);

        const pdfData = await pdfParse(buffer);
        if (pdfData.numpages > 50) throw new Error("PDF trop long (maximum 50 pages)");

        text = pdfData.text;
        
        // Validation : PDF scanné (image) = texte vide
        if (!text || text.trim().length < 100) {
          throw new Error("Ce PDF ne contient pas de texte exploitable (probablement un document scanné). Seuls les PDF textuels sont supportés.");
        }
        
        extractTime = performance.now() - tExtractStart;
        
        // 2b. NOUVEAU: Hash basé sur le TEXTE et non le fichier
        const textHash = crypto.createHash('sha256').update(text).digest('hex');
        await supabaseAdmin.from('documents').update({ text_hash: textHash, extracted_text: text }).eq('id', job.pdf_id);
        
        // Mettre à jour le generation_hash avec le hash TEXTUEL
        await supabaseAdmin.from('etude_cours').update({ generation_hash: textHash }).eq('id', job.id);
        // Sauvegarde en cache pour la suite
      } else {
        console.log(`[Worker] Cache HIT pour extracted_text.`);
        // S'assurer que le generation_hash textuel est bien mis à jour même si le texte était en cache
        const textHash = crypto.createHash('sha256').update(text).digest('hex');
        await supabaseAdmin.from('etude_cours').update({ generation_hash: textHash }).eq('id', job.id);
      }

      // Heartbeat pendant qu'on travaille
      await supabaseAdmin.from('etude_cours').update({ heartbeat: new Date().toISOString() }).eq('id', job.id);

      // --- DÉBUT LOGIQUE DÉDUPLICATION (CACHE GLOBAL) ---
      // On cherche un job existant avec le MÊME textHash qui est DÉJÀ terminé
      const textHash = crypto.createHash('sha256').update(text).digest('hex');
      const { data: cachedJob } = await supabaseAdmin
        .from('etude_cours')
        .select('id, pdf_id')
        .eq('generation_hash', textHash)
        .eq('statut_generation', 'pret')
        .neq('id', job.id)
        .limit(1)
        .single();

      if (cachedJob) {
        console.log(`[Worker] CACHE GLOBAL HIT (Hash: ${textHash}). Clonage depuis le job ${cachedJob.id}...`);
        
        // 1. Récupérer l'intelligence de la DB
        const { data: sourceDoc } = await supabaseAdmin
          .from('documents')
          .select('intelligence_pedagogique')
          .eq('id', cachedJob.pdf_id)
          .single();
          
        if (sourceDoc && sourceDoc.intelligence_pedagogique) {
           await supabaseAdmin.from('documents').update({ intelligence_pedagogique: sourceDoc.intelligence_pedagogique }).eq('id', job.pdf_id);
           
           // 2. Cloner les sections et les thèmes (Nouvelle architecture Étude Guidée)
           const { data: sourceSections } = await supabaseAdmin
             .from('etude_sections')
             .select('*')
             .eq('cours_id', cachedJob.id);
             
           if (sourceSections && sourceSections.length > 0) {
              for (const sec of sourceSections) {
                const { data: newSec } = await supabaseAdmin.from('etude_sections').insert({
                  cours_id: job.id,
                  titre: sec.titre,
                  synthese: sec.synthese,
                  ordre: sec.ordre,
                  questions_cloture: sec.questions_cloture
                }).select('id').single();
                
                if (newSec) {
                  const { data: sourceThemes } = await supabaseAdmin.from('etude_themes').select('*').eq('section_id', sec.id);
                  if (sourceThemes && sourceThemes.length > 0) {
                    const themesToInsert = sourceThemes.map(t => ({
                      section_id: newSec.id,
                      titre: t.titre,
                      ordre: t.ordre,
                      explication_fondamentale: t.explication_fondamentale,
                      question_forme: t.question_forme,
                      remediation_forme: t.remediation_forme,
                      cas_pratique_fond: t.cas_pratique_fond,
                      remediation_fond: t.remediation_fond
                    }));
                    await supabaseAdmin.from('etude_themes').insert(themesToInsert);
                  }
                }
              }
           }

           // Fin de traitement express
           await supabaseAdmin.from('etude_cours').update({ 
             statut_generation: 'pret',
             updated_at: new Date().toISOString()
           }).eq('id', job.id);
           
           console.log(`[Worker] Clonage terminé en 0s pour le job ${job.id}`);
           return { message: "Job complété depuis le cache global" };
        }
      }

      // 2. SINGLE FLIGHT GENERATION : Si un autre job génère déjà ce contenu, on attend.
      const { data: processingJob } = await supabaseAdmin
        .from('etude_cours')
        .select('id')
        .eq('generation_hash', textHash)
        .eq('statut_generation', 'en_cours')
        .neq('id', job.id)
        .limit(1)
        .single();
        
      if (processingJob) {
        console.log(`[Worker] SINGLE FLIGHT: Un autre job (${processingJob.id}) génère déjà l'IA pour le hash ${textHash}. Mise en attente...`);
        // On remet ce job en 'pending'. Il sera repris plus tard et profitera du cache au prochain essai !
        await supabaseAdmin.from('etude_cours').update({ 
          statut_generation: 'pending',
          updated_at: new Date().toISOString()
        }).eq('id', job.id);
        return { message: "Mise en attente (Single Flight)" };
      }
      // --- FIN LOGIQUE DÉDUPLICATION ---

      // 3. Importer les éléments du moteur pédagogique
      const { ENGINE_VERSION, PEDAGOGICAL_MASTER_SCHEMA, getPedagogicalMasterPrompt } = await import('@/lib/prompts/pedagogicalEngine');
      const { generateStructuredJSON } = await import('@/lib/gemini');

      // 4. Vérifier la compatibilité de l'intelligence existante
      const existingIntelligence = existingIntelligenceFromDB;
      const isIntelligenceCompatible = existingIntelligence && 
                                      existingIntelligence._metadata && 
                                      existingIntelligence._metadata.engine_version === ENGINE_VERSION;

      let generatedData: any = null;

      if (isIntelligenceCompatible) {
         console.log(`[Worker] Intelligence compatible (v${ENGINE_VERSION}) trouvée, injection dans le contexte...`);
      }

      // 5. Génération (avec retry intégré via gemini.ts)
      const promptAddon = isIntelligenceCompatible ? `\n\nIntelligence pédagogique existante à réutiliser intégralement pour générer les sections :\n${JSON.stringify(existingIntelligence)}` : "";
      
      const tAiStart = performance.now();
      generatedData = await generateStructuredJSON(
        "Tu es un professeur de droit expert. Génère l'intelligence pédagogique ET le découpage du cours.",
        getPedagogicalMasterPrompt(text.substring(0, 50000)) + promptAddon,
        PEDAGOGICAL_MASTER_SCHEMA,
        undefined,
        { feature: 'worker_master', documentId: job.pdf_id } // Pour saas_metrics
      );

      if (!generatedData || !generatedData.intelligence_pedagogique || !generatedData.sections) {
        throw new Error("Impossible de générer un JSON valide pour le cours.");
      }
      aiTime = performance.now() - tAiStart;

      // 6. Sauvegarde de la super-intelligence (si la colonne existe)
      const { PROMPT_VERSION, SCHEMA_VERSION } = await import('@/lib/prompts/pedagogicalEngine');
      const fullIntelligence = {
        _metadata: {
          engine_version: ENGINE_VERSION,
          prompt_version: PROMPT_VERSION,
          schema_version: SCHEMA_VERSION,
          generated_at: new Date().toISOString()
        },
        ...generatedData.intelligence_pedagogique,
        strategie_pedagogique_sur_mesure: generatedData.strategie_pedagogique_sur_mesure
      };

      // Tentative de sauvegarde (non bloquante si la colonne n'existe pas)
      try {
        await supabaseAdmin
          .from('documents')
          .update({ intelligence_pedagogique: fullIntelligence })
          .eq('id', job.pdf_id);
      } catch (saveIntelError: any) {
        console.warn(`[Worker] Impossible de sauvegarder l'intelligence pédagogique: ${saveIntelError.message}. Colonne probablement absente.`);
      }

      // Heartbeat 2
      await supabaseAdmin.from('etude_cours').update({ heartbeat: new Date().toISOString() }).eq('id', job.id);

      const tDbStart = performance.now();
      // 7. Sauvegarder les sections en DB (Pas de batch insert pour l'instant, on laisse tel quel)
      for (const section of generatedData.sections) {
        const { data: sectionData, error: secError } = await supabaseAdmin
          .from('etude_sections')
          .insert({
            cours_id: job.id,
            titre: section.titre,
            synthese: section.synthese || '',
            ordre: section.ordre,
            questions_cloture: section.questions_cloture_section || []
          })
          .select('id')
          .single();

        if (secError) {
          console.error(`[Worker] Erreur insertion section: ${secError.message} (Code: ${secError.code})`);
          throw new Error(`Erreur insertion section: ${secError.message}`);
        }

        for (const theme of section.themes) {
          const { error: themeError } = await supabaseAdmin
            .from('etude_themes')
            .insert({
              section_id: sectionData.id,
              titre: theme.titre,
              explication: theme.explication || '',
              question_forme: theme.question_forme || {},
              cas_pratique_fond: theme.cas_pratique_fond || {},
              remediation_forme: theme.branches_remediation_forme || [],
              remediation_fond: theme.branches_remediation_fond || [],
              ordre: theme.ordre
            });

          if (themeError) {
            console.error(`[Worker] Erreur insertion thème '${theme.titre}': ${themeError.message} (Code: ${themeError.code})`);
            throw new Error(`Erreur insertion thème: ${themeError.message}`);
          }
        }
      }
      dbTime = performance.now() - tDbStart;

      // Tout s'est bien passé
      const duration = Date.now() - startTime;
      console.log(`[Worker Performance] Job ${job.id} | Extract: ${extractTime.toFixed(0)}ms | AI: ${aiTime.toFixed(0)}ms | DB: ${dbTime.toFixed(0)}ms | Total: ${duration}ms`);
      
      await supabaseAdmin.from('etude_cours').update({ 
        statut_generation: 'pret',
        updated_at: new Date().toISOString(),
        last_error: null 
      }).eq('id', job.id);

      // Relancer un appel HTTP pour le job suivant (évite le timeout récursif de Vercel)
      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST' }).catch(() => {});
      }

      return { success: true, processedJob: job.id, duration };

    } catch (processError: any) {
      console.error("Worker Error:", processError);
      
      const isRetryable = (job.retry_count || 0) < 2;
      const nextStatus = isRetryable ? 'erreur' : 'erreur'; // Reste dans l'état erreur, mais avec un next_retry
      const nextRetry = isRetryable ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null; // Retry dans 5 minutes
      
      await supabaseAdmin.from('etude_cours').update({ 
        statut_generation: nextStatus,
        last_error: processError.message,
        retry_count: (job.retry_count || 0) + 1,
        next_retry: nextRetry,
        updated_at: new Date().toISOString()
      }).eq('id', job.id);
      
      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST' }).catch(() => {});
      }
      return { error: processError.message };
    }

  } catch (error: any) {
    console.error("Worker Global Error:", error);
    return { error: error.message };
  }
}

export async function POST(req: NextRequest) {
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';
  const workerUrl = `${protocol}://${host}/api/worker/process`;

  // Utilisation de after() (Next.js 15+) pour exécuter le worker APRES avoir répondu au client.
  // Cela empêche le proxy Vercel de tuer le processus à cause d'un timeout de connexion client (60s).
  after(() => {
    runWorker(workerUrl).catch(err => console.error("Worker after() error:", err));
  });

  return NextResponse.json({ message: "Worker démarré en arrière-plan avec succès" });
}
