import { NextRequest, NextResponse } from 'next/server';
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
    // Limite stricte pour éviter le Rate Limit Google
    const { count, error: countError } = await supabaseAdmin
      .from('etude_cours')
      .select('id', { count: 'exact', head: true })
      .eq('statut_generation', 'en_cours');
      
    if (countError) throw new Error("Erreur de comptage");
    if ((count || 0) >= 5) {
      console.log("[Worker] Trop de jobs en cours. Retourne.");
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
      // 1. Récupérer le document ET son texte/intelligence en cache
      const { data: document, error: docError } = await supabaseAdmin
        .from('documents')
        .select('url_fichier, extracted_text, intelligence_pedagogique')
        .eq('id', job.pdf_id)
        .single();

      if (docError || !document) throw new Error("Document introuvable");

      let text = document.extracted_text;
      
      // 2. Si le texte n'est pas en cache, on le télécharge et on le parse
      if (!text) {
        console.log(`[Worker] Cache MISS pour extracted_text. Téléchargement du PDF...`);
        const response = await fetch(document.url_fichier);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Hash (déduplication)
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        await supabaseAdmin.from('etude_cours').update({ generation_hash: hash }).eq('id', job.id);

        const pdfData = await pdfParse(buffer);
        if (pdfData.numpages > 100) throw new Error("PDF trop long");

        text = pdfData.text;
        
        // Sauvegarde en cache pour la suite
        await supabaseAdmin.from('documents').update({ extracted_text: text }).eq('id', job.pdf_id);
      } else {
        console.log(`[Worker] Cache HIT pour extracted_text.`);
      }

      // Heartbeat pendant qu'on travaille
      await supabaseAdmin.from('etude_cours').update({ heartbeat: new Date().toISOString() }).eq('id', job.id);

      // 3. Importer les éléments du moteur pédagogique
      const { ENGINE_VERSION, PEDAGOGICAL_MASTER_SCHEMA, getPedagogicalMasterPrompt } = await import('@/lib/prompts/pedagogicalEngine');
      const { generateStructuredJSON } = await import('@/lib/gemini');

      // 4. Vérifier la compatibilité de l'intelligence existante
      const existingIntelligence = document.intelligence_pedagogique;
      const isIntelligenceCompatible = existingIntelligence && 
                                      existingIntelligence._metadata && 
                                      existingIntelligence._metadata.engine_version === ENGINE_VERSION;

      let generatedData: any = null;

      if (isIntelligenceCompatible) {
         // OPTIMISATION FUTURE: Si l'intelligence existe déjà, on pourrait créer un prompt plus petit qui ne génère QUE les sections.
         // Mais pour l'instant, le PEDAGOGICAL_MASTER_SCHEMA attend l'intelligence en retour.
         // On force quand même la génération complète avec le schéma master actuel pour éviter les erreurs de format.
         // On injectera l'intelligence_pedagogique_existante dans le prompt pour aider Gemini.
         console.log(`[Worker] Intelligence compatible (v${ENGINE_VERSION}) trouvée, injection dans le contexte...`);
      }

      // 5. Génération (avec retry intégré via gemini.ts)
      const promptAddon = isIntelligenceCompatible ? `\n\nIntelligence pédagogique existante à réutiliser intégralement pour générer les sections :\n${JSON.stringify(existingIntelligence)}` : "";
      
      generatedData = await generateStructuredJSON(
        "Tu es un professeur de droit expert. Génère l'intelligence pédagogique ET le découpage du cours.",
        getPedagogicalMasterPrompt(text.substring(0, 80000)) + promptAddon,
        PEDAGOGICAL_MASTER_SCHEMA,
        undefined,
        { feature: 'worker_master', documentId: job.pdf_id } // Pour saas_metrics
      );

      if (!generatedData || !generatedData.intelligence_pedagogique || !generatedData.sections) {
        throw new Error("Impossible de générer un JSON valide pour le cours.");
      }

      // 6. Sauvegarde de la super-intelligence avec le versionnement (on écrase ou met à jour)
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

      await supabaseAdmin
        .from('documents')
        .update({ intelligence_pedagogique: fullIntelligence })
        .eq('id', job.pdf_id);

      // Heartbeat 2
      await supabaseAdmin.from('etude_cours').update({ heartbeat: new Date().toISOString() }).eq('id', job.id);

      // 7. Sauvegarder les sections en DB (Pas de batch insert pour l'instant, on laisse tel quel)
      for (const section of generatedData.sections) {
        const { data: sectionData, error: secError } = await supabaseAdmin
          .from('etude_sections')
          .insert({
            cours_id: job.id,
            titre: section.titre,
            ordre: section.ordre
          })
          .select('id')
          .single();

        if (secError) throw new Error("Erreur insertion section");

        for (const theme of section.themes) {
          const { error: themeError } = await supabaseAdmin
            .from('etude_themes')
            .insert({
              section_id: sectionData.id,
              cours_id: job.id,
              titre: theme.titre,
              points_cles: theme.points_cles,
              difficulte: theme.difficulte,
              type_contenu: theme.type_contenu,
              explication_pedagogique: theme.explication_pedagogique,
              ordre: theme.ordre
            });

          if (themeError) throw new Error(`Erreur insertion thème: ${themeError.message}`);
        }
      }

      // Tout s'est bien passé
      const duration = Date.now() - startTime;
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

  const result = await runWorker(workerUrl);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
