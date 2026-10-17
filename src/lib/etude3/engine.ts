import { supabaseAdmin } from '@/lib/supabase/admin';
import { downloadDocumentPdf } from '@/lib/storage';
import {
  SEGMENT_SYSTEM, SEGMENT_SCHEMA, CONSOLIDATION_SYSTEM, CONSOLIDATION_SCHEMA,
  SYNTHESE_SYSTEM, SYNTHESE_SCHEMA, SEQUENCE_SYSTEM, SEQUENCE_SCHEMA, neutralize,
} from '@/lib/prompts/etude/prompts';
import { extractPages, segmenter, extraitPages, NonRetryableError } from './extract';
import { normalizeCarteMentale, normalizePlan, normalizeSequence, normalizeSynthese } from './validate';
import { ENGINE_VERSION, type Couverture } from './types';

/**
 * MOTEUR ÉTUDES GUIDÉES v3 — traitements exécutés par le worker (/api/worker/ai).
 *
 * Coûts maîtrisés :
 *  - contenus COMMUNS mis en cache par (empreinte du texte normalisé, ENGINE_VERSION) : un cours
 *    étudié par 1 000 étudiants n'est analysé qu'UNE fois ;
 *  - single-flight : verrou de contenu, les demandes simultanées attendent le premier calcul ;
 *  - reprise : chaque étape réussie est enregistrée dans job.result, une panne ne refait pas
 *    payer ce qui est déjà fait ;
 *  - séquences générées à la demande (E-01), une par une.
 */

export interface EngineDeps {
  ctx: { mark: (status: string, progress: number, phase: string) => Promise<void> };
  patchJob: (id: string, patch: Record<string, any>) => Promise<void>;
  withLeaseHeartbeat: <T>(jobId: string, fn: () => Promise<T>, lockHash?: string) => Promise<T>;
  acquireContentLock: (hash: string) => Promise<boolean>;
  releaseContentLock: (hash: string) => Promise<void>;
  generate: (system: string, prompt: string, schema: any, tracking: { userId?: string; feature: string; documentId?: string }, temperature?: number, thinkingBudget?: number) => Promise<any>;
}

const MAX_SEGMENTS = 30;          // ≈ 420 000 caractères (environ 150 pages denses) ; au-delà : couverture partielle déclarée
const SEGMENT_PARALLEL = 3;       // appels simultanés par analyse (limite la pression sur Gemini)
const CARTE_MAX_CHARS = 120000;   // taille maximale des cartes partielles transmises à la consolidation

/**
 * Budget de « réflexion » Gemini par étape (tokens facturés au tarif de sortie, et lents).
 * Mesuré en production : une synthèse sans borne a pris 280 s. L'extraction n'en a pas besoin ;
 * la consolidation et la rédaction gardent un budget modéré pour la qualité du plan.
 */
const THINK = { segment: 0, consolidation: 1024, synthese: 1024, sequence: 1024 };

const lockKeyAnalyse = (hash: string) => `etude3:${ENGINE_VERSION}:${hash}`;
const lockKeySequence = (hash: string, ordre: number) => `etude3seq:${ENGINE_VERSION}:${hash}:${ordre}`;

async function loadAnalyse(hash: string) {
  const { data } = await supabaseAdmin
    .from('etude_analyses').select('statut, plan, pages_texte, carte, couverture')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  return data as { statut: string; plan: any; pages_texte: string[] | null; carte: any; couverture: Couverture } | null;
}

/** Rattache l'empreinte aux parcours du document (tous les étudiants qui l'étudient). */
async function linkParcours(documentId: string, hash: string) {
  await supabaseAdmin.from('etude_parcours')
    .update({ source_hash: hash, updated_at: new Date().toISOString() })
    .eq('document_id', documentId).eq('engine_version', ENGINE_VERSION).is('source_hash', null);
}

// ---------------------------------------------------------------------------
// Job « etude3_analyse » : extraction → segments → consolidation → synthèse
// ---------------------------------------------------------------------------
export async function processEtudeAnalyse(job: any, deps: EngineDeps): Promise<any> {
  const documentId: string = job.payload?.documentId;
  if (!documentId) throw new NonRetryableError('Document manquant.');
  const { ctx } = deps;
  let result: any = job.result || {};

  // 1. Texte page par page. Aux étapes suivantes, il est relu en base (pas de nouveau téléchargement).
  let pages: string[];
  let hash: string;
  let couverture: Couverture;
  if (result.hash) {
    const saved = await loadAnalyse(result.hash);
    if (saved?.statut === 'pret') { await linkParcours(documentId, result.hash); return { hash: result.hash, reused: true }; }
    if (!saved?.pages_texte) { await deps.patchJob(job.id, { result: {} }); return { __requeueMs: 100 }; } // état incohérent : on repart proprement
    pages = saved.pages_texte; hash = result.hash; couverture = saved.couverture;
  } else {
    // Extraction gratuite (aucune IA). PDF scanné → arrêt immédiat et définitif (E-03).
    await ctx.mark('processing', 10, 'Lecture du PDF, page par page…');
    const { data: doc } = await supabaseAdmin.from('documents').select('id, user_id, url_fichier').eq('id', documentId).maybeSingle();
    if (!doc) throw new NonRetryableError('Document introuvable.');
    const extracted = await extractPages(await downloadDocumentPdf(doc));
    pages = extracted.pages; hash = extracted.hash; couverture = extracted.couverture;

    // 2. Déjà analysé (par n'importe quel étudiant, même texte, même version du moteur) ? Rien à payer.
    const existing = await loadAnalyse(hash);
    if (existing?.statut === 'pret') { await linkParcours(documentId, hash); return { hash, reused: true }; }
  }

  // 3. Single-flight : un seul calcul par contenu. Le verrou est GARDÉ entre les étapes
  //    (result.lockHeld) pour qu'aucune autre demande ne recommence le même travail.
  const lock = lockKeyAnalyse(hash);
  if (!result.lockHeld) {
    if (!(await deps.acquireContentLock(lock))) {
      await ctx.mark('processing', 15, 'Un autre étudiant fait analyser ce même cours : on attend son résultat…');
      return { __requeueMs: 6000 };
    }
    result = { ...result, hash, lockHeld: true };
    await deps.patchJob(job.id, { result });
  }

  // Une étape = au plus un lot d'appels IA, puis on enregistre et on rend la main (le worker
  // repart aussitôt). Chaque invocation reste courte : compatible avec une limite de durée
  // serverless basse, et une coupure ne fait perdre que l'étape en cours.
  const yieldStep = async () => { await deps.patchJob(job.id, { result }); return { __requeueMs: 50 }; };
  let finished = false;
  try {
    const segments = segmenter(pages);
    const lus = segments.slice(0, MAX_SEGMENTS);
    const tronque = segments.length > MAX_SEGMENTS;
    const pagesLues = new Set(lus.flatMap((s) => s.pages));
    const couv: Couverture = { ...couverture, pages_lues: pagesLues.size, tronque };

    if (!result.rowSaved) {
      await supabaseAdmin.from('etude_analyses').upsert(
        { source_hash: hash, engine_version: ENGINE_VERSION, statut: 'en_cours', couverture: couv, pages_texte: pages, updated_at: new Date().toISOString() },
        { onConflict: 'source_hash,engine_version' },
      );
      result = { ...result, rowSaved: true };
    }

    // 4. Analyse segment par segment (mémoire de travail : cartes partielles conservées).
    const cartes: any[] = Array.isArray(result.cartes) ? result.cartes : [];
    const fait = cartes.filter(Boolean).length;
    if (fait < lus.length) {
      const batch = lus.slice(fait, fait + SEGMENT_PARALLEL);
      await ctx.mark('generating', 20 + Math.round((40 * fait) / lus.length), `Analyse du cours : partie ${fait + 1} sur ${lus.length}…`);
      const out = await deps.withLeaseHeartbeat(job.id, () => Promise.all(batch.map((seg) =>
        deps.generate(SEGMENT_SYSTEM, `<SEGMENT pages="${seg.pages[0]}-${seg.pages[seg.pages.length - 1]}">\n${neutralize(seg.texte)}\n</SEGMENT>`, SEGMENT_SCHEMA,
          { userId: job.user_id, feature: 'etude3_segment', documentId }, 0.2, THINK.segment))), lock);
      out.forEach((c, k) => { cartes[fait + k] = { pages: batch[k].pages, ...c }; });
      result = { ...result, cartes };
      return await yieldStep();
    }

    // 5. Consolidation : compréhension globale, regard d'examinateur, plan du parcours, carte mentale.
    if (!result.consolidation) {
      await ctx.mark('generating', 65, 'Construction de la vue d’ensemble du cours…');
      const carteTxt = neutralize(JSON.stringify(cartes)).slice(0, CARTE_MAX_CHARS);
      const consolidation = await deps.withLeaseHeartbeat(job.id, () => deps.generate(
        CONSOLIDATION_SYSTEM, `Pages du cours : ${couv.pages_total}.\n<CARTE>\n${carteTxt}\n</CARTE>`, CONSOLIDATION_SCHEMA,
        { userId: job.user_id, feature: 'etude3_consolidation', documentId }, 0.2, THINK.consolidation), lock);
      result = { ...result, consolidation };
      return await yieldStep();
    }

    // 6. Synthèse pédagogique (avant le parcours).
    if (!result.synthese) {
      await ctx.mark('generating', 80, 'Rédaction de ta synthèse pédagogique…');
      const c = result.consolidation;
      const contexte = neutralize(JSON.stringify({ titre: c.titre, idee_centrale: c.idee_centrale, plan: c.plan, examinateur: c.examinateur, cartes })).slice(0, CARTE_MAX_CHARS);
      const synthese = await deps.withLeaseHeartbeat(job.id, () => deps.generate(
        SYNTHESE_SYSTEM, `<CARTE>\n${contexte}\n</CARTE>`, SYNTHESE_SCHEMA,
        { userId: job.user_id, feature: 'etude3_synthese', documentId }, 0.4, THINK.synthese), lock);
      result = { ...result, synthese };
      await deps.patchJob(job.id, { result });
    }

    // 7. Validation puis enregistrement du contenu commun.
    await ctx.mark('saving', 92, 'Enregistrement…');
    const maxPage = couv.pages_total || 9999;
    const synthese = normalizeSynthese(result.synthese, maxPage);
    const plan = normalizePlan(result.consolidation.sequences, maxPage);
    const carteMentale = normalizeCarteMentale(result.consolidation.carte_mentale);
    const c = result.consolidation;
    const { error } = await supabaseAdmin.from('etude_analyses').update({
      statut: 'pret', synthese, plan, carte_mentale: carteMentale, couverture: couv,
      carte: { titre: String(c.titre || ''), discipline: String(c.discipline || ''), idee_centrale: String(c.idee_centrale || ''), examinateur: c.examinateur || null },
      erreur: null, updated_at: new Date().toISOString(),
    }).eq('source_hash', hash).eq('engine_version', ENGINE_VERSION);
    if (error) throw new Error(`Enregistrement de l’analyse : ${error.message}`);
    await linkParcours(documentId, hash);
    finished = true;
    return { hash, sequences: plan.length, pages: couv.pages_lues };
  } catch (err) {
    finished = true; // échec : on libère le verrou pour qu'une nouvelle tentative puisse reprendre
    throw err;
  } finally {
    if (finished) await deps.releaseContentLock(lock);
  }
}

// ---------------------------------------------------------------------------
// Job « etude3_sequence » : une séquence du parcours, à la demande
// ---------------------------------------------------------------------------
export async function processEtudeSequence(job: any, deps: EngineDeps): Promise<any> {
  const documentId: string = job.payload?.documentId;
  const ordre = Number(job.payload?.ordre);
  const hash: string = job.payload?.hash;
  if (!documentId || !hash || !Number.isInteger(ordre) || ordre < 1) throw new NonRetryableError('Paramètres de séquence invalides.');

  const { data: done } = await supabaseAdmin.from('etude_sequences').select('ordre')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).eq('ordre', ordre).maybeSingle();
  if (done) return { hash, ordre, reused: true };

  const analyse = await loadAnalyse(hash);
  if (!analyse || analyse.statut !== 'pret') throw new NonRetryableError('Analyse du cours indisponible.');
  const plan = Array.isArray(analyse.plan) ? analyse.plan : [];
  const item = plan.find((p: any) => p.ordre === ordre);
  if (!item) throw new NonRetryableError('Cette séquence n’existe pas dans le parcours.');

  const lock = lockKeySequence(hash, ordre);
  const leader = await deps.acquireContentLock(lock);
  if (!leader) {
    await deps.ctx.mark('processing', 20, 'Cette séquence est déjà en préparation…');
    return { __requeueMs: 4000 };
  }
  try {
    await deps.ctx.mark('generating', 40, `Préparation de la séquence ${ordre}…`);
    const pages = analyse.pages_texte || [];
    const numeros = item.pages?.length ? item.pages : pages.map((_, i) => i + 1);
    const cours = neutralize(extraitPages(pages, numeros));
    const autres = plan.map((p: any) => `${p.ordre}. ${p.titre}`).join('\n');
    const prompt = [
      `COURS : ${analyse.carte?.titre || ''} — ${analyse.carte?.idee_centrale || ''}`,
      `PARCOURS COMPLET :\n${autres}`,
      `SÉQUENCE ${ordre} : ${item.titre}\nObjectif : ${item.objectif}\nNotions : ${(item.notions || []).join(', ')}`,
      `REGARD D'EXAMINATEUR (interne) : ${neutralize(JSON.stringify(analyse.carte?.examinateur || {})).slice(0, 4000)}`,
      `<COURS>\n${cours}\n</COURS>`,
    ].join('\n\n');
    const raw = await deps.withLeaseHeartbeat(job.id, () => deps.generate(
      SEQUENCE_SYSTEM, prompt, SEQUENCE_SCHEMA, { userId: job.user_id, feature: 'etude3_sequence', documentId }, 0.4, THINK.sequence), lock);
    const sequence = normalizeSequence(raw, ordre, pages.length || 9999);

    await deps.ctx.mark('saving', 90, 'Enregistrement…');
    const { error } = await supabaseAdmin.from('etude_sequences')
      .upsert({ source_hash: hash, engine_version: ENGINE_VERSION, ordre, contenu: sequence }, { onConflict: 'source_hash,engine_version,ordre', ignoreDuplicates: true });
    if (error) throw new Error(`Enregistrement de la séquence : ${error.message}`);
    return { hash, ordre };
  } finally {
    await deps.releaseContentLock(lock);
  }
}
