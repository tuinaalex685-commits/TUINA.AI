import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
// @ts-ignore
import pdfParse from 'pdf-parse';
import crypto from 'crypto';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function runWorker(workerUrlStr?: string) {
  try {
    // NETTOYAGE DES JOBS ZOMBIES : un job 'en_cours' dont le heartbeat date de + de 3 min est
    // considéré mort (worker tué par déconnexion client ou crash) et remis en 'pending'.
    // 3 min > durée max entre deux heartbeats d'un worker vivant (l'appel Gemini ~90-120s),
    // donc aucun job vivant n'est réinitialisé à tort.
    const fifteenMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
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
      .or('and(statut_generation.eq.pending,next_retry.is.null),and(statut_generation.eq.pending,next_retry.lte.now()),and(statut_generation.eq.erreur,next_retry.lte.now())')
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
    let genLockHash: string | null = null; // hash détenu par ce job (à libérer en fin de génération)

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

        // Garde mémoire : un PDF trop lourd ferait OOM/timeout la fonction serverless.
        if (buffer.length > 25 * 1024 * 1024) {
          throw new Error("PDF trop volumineux (max 25 Mo).");
        }

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

      // 2. SINGLE FLIGHT ATOMIQUE : garantit UN SEUL appel Gemini par contenu (hash).
      //    Le job qui insère le hash (clé primaire) devient le générateur unique ; les autres
      //    sont reportés (avec délai) et cloneront le résultat via le cache global au prochain essai.
      const nowIsoSF = new Date().toISOString();
      await supabaseAdmin.from('etude_generation_locks').delete().eq('hash', textHash).lt('expires_at', nowIsoSF);
      const { error: genLockError } = await supabaseAdmin
        .from('etude_generation_locks')
        .insert({ hash: textHash, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

      if (genLockError) {
        console.log(`[Worker] SINGLE FLIGHT ATOMIQUE: génération déjà en cours pour ${textHash}. Report du job ${job.id}.`);
        // Report de 6s (via next_retry) : évite le busy-loop et laisse le cache global se remplir.
        await supabaseAdmin.from('etude_cours').update({
          statut_generation: 'pending',
          next_retry: new Date(Date.now() + 6000).toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', job.id);
        return { message: "Report (single flight atomique)" };
      }
      genLockHash = textHash; // ce job détient le verrou → il devra le libérer
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
      // 7. Sauvegarde en DB par BATCH (au lieu de N aller-retours séquentiels lents/fragiles).
      // Idempotent : on purge d'abord les sections existantes de ce job (retry après kill partiel
      // = pas de doublon). ON DELETE CASCADE nettoie les thèmes liés.
      await supabaseAdmin.from('etude_sections').delete().eq('cours_id', job.id);

      // 7a. Insertion de TOUTES les sections en un seul appel, avec récupération des ids par ordre.
      const sectionsPayload = generatedData.sections.map((section: any) => ({
        cours_id: job.id,
        titre: section.titre,
        synthese: section.synthese || '',
        ordre: section.ordre,
        questions_cloture: section.questions_cloture_section || []
      }));

      const { data: insertedSections, error: secError } = await supabaseAdmin
        .from('etude_sections')
        .insert(sectionsPayload)
        .select('id, ordre');

      if (secError || !insertedSections) {
        throw new Error(`Erreur insertion sections (batch): ${secError?.message}`);
      }

      // 7b. Construction de TOUS les thèmes, puis insertion en un seul appel.
      const ordreToId = new Map<number, string>();
      for (const s of insertedSections) ordreToId.set(s.ordre, s.id);

      const themesPayload: any[] = [];
      for (const section of generatedData.sections) {
        const sectionId = ordreToId.get(section.ordre);
        if (!sectionId) continue;
        for (const theme of section.themes || []) {
          themesPayload.push({
            section_id: sectionId,
            titre: theme.titre,
            explication: theme.explication || '',
            question_forme: theme.question_forme || {},
            cas_pratique_fond: theme.cas_pratique_fond || {},
            remediation_forme: theme.branches_remediation_forme || [],
            remediation_fond: theme.branches_remediation_fond || [],
            ordre: theme.ordre
          });
        }
      }

      if (themesPayload.length > 0) {
        const { error: themeError } = await supabaseAdmin.from('etude_themes').insert(themesPayload);
        if (themeError) {
          throw new Error(`Erreur insertion thèmes (batch): ${themeError.message}`);
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

      // Libération du verrou de génération → les jobs identiques reportés cloneront via le cache.
      if (genLockHash) {
        await supabaseAdmin.from('etude_generation_locks').delete().eq('hash', genLockHash);
      }

      // Relancer un appel HTTP pour le job suivant (évite le timeout récursif de Vercel)
      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST', headers: { 'x-worker-secret': process.env.CRON_SECRET || '' } }).catch(() => {});
      }

      return { success: true, processedJob: job.id, duration };

    } catch (processError: any) {
      console.error("Worker Error:", processError);

      // Distinction erreur TRANSITOIRE (Gemini 503 surchargé / 429 / réseau) vs PERMANENTE (PDF illisible,
      // JSON invalide, document introuvable). C'est la cause n°1 des écrans figés à 95% : un simple 503
      // Gemini renvoyait le job en 'erreur' + next_retry à +5 min → l'utilisateur voyait un écran bloqué
      // pendant des minutes. Désormais une erreur transitoire repasse le job en 'pending' (le frontend
      // continue d'afficher la progression, PAS d'écran d'erreur) avec un backoff COURT et croissant
      // (15s→90s) et davantage de tentatives → auto-guérison en 1-2 min dès que Gemini se libère.
      const msg = (processError.message || '').toLowerCase();
      const isTransient = /(503|overloaded|unavailable|429|rate limit|quota|internal error|econnreset|etimedout|fetch failed|timeout|socket hang)/.test(msg);
      const rc = job.retry_count || 0;
      const maxRetries = isTransient ? 8 : 2; // une erreur permanente ne s'auto-guérit pas → abandon rapide
      const isRetryable = rc < maxRetries;

      let nextStatus: string;
      let nextRetry: string | null;
      if (isRetryable) {
        // Transitoire → 'pending' : l'UI garde sa barre de progression (le status endpoint relance le
        // worker sur 'pending'). Permanent → 'erreur' (message immédiat) mais avec un court next_retry.
        nextStatus = isTransient ? 'pending' : 'erreur';
        const delayMs = isTransient ? Math.min(90000, 15000 * (rc + 1)) : 30000 * (rc + 1);
        nextRetry = new Date(Date.now() + delayMs).toISOString();
      } else {
        nextStatus = 'erreur'; // abandon définitif
        nextRetry = null;
      }
      console.log(`[Worker] Job ${job.id} échec ${isTransient ? 'TRANSITOIRE' : 'PERMANENT'} (tentative ${rc + 1}/${maxRetries}) → statut=${nextStatus}, next_retry=${nextRetry ? new Date(nextRetry).toISOString() : 'abandon'} | ${processError.message?.slice(0, 120)}`);

      await supabaseAdmin.from('etude_cours').update({
        statut_generation: nextStatus,
        last_error: processError.message,
        retry_count: rc + 1,
        next_retry: nextRetry,
        updated_at: new Date().toISOString()
      }).eq('id', job.id);

      // Libération du verrou en cas d'échec (sinon les jobs identiques attendraient jusqu'au TTL).
      if (genLockHash) {
        await supabaseAdmin.from('etude_generation_locks').delete().eq('hash', genLockHash).then(() => {}, () => {});
      }

      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST', headers: { 'x-worker-secret': process.env.CRON_SECRET || '' } }).catch(() => {});
      }
      return { error: processError.message };
    }

  } catch (error: any) {
    console.error("Worker Global Error:", error);
    return { error: error.message };
  }
}

// SÉCURITÉ : n'autoriser que Vercel Cron (Authorization) ou nos appels internes (x-worker-secret).
// Permissif tant que CRON_SECRET n'est pas configuré (aucune rupture avant que le secret soit posé).
function workerAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') || '';
  const custom = req.headers.get('x-worker-secret') || '';
  return auth === `Bearer ${secret}` || custom === secret;
}

export async function POST(req: NextRequest) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';
  const workerUrl = `${protocol}://${host}/api/worker/process`;
  const result = await runWorker(workerUrl);
  return NextResponse.json(result ?? { message: "Worker terminé" });
}

// Déclenché par Vercel Cron (toutes les minutes) : traitement serveur GARANTI, jamais lié à un
// client (donc jamais tué par un rechargement de page). C'est le filet de sécurité qui vide la file.
export async function GET(req: NextRequest) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || 'localhost:3000';
  const workerUrl = `${protocol}://${host}/api/worker/process`;
  const result = await runWorker(workerUrl);
  return NextResponse.json(result ?? { message: "Worker terminé" });
}
