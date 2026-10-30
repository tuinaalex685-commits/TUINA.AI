import { supabaseAdmin } from '@/lib/supabase/admin';
import { downloadDocumentPdf } from '@/lib/storage';
import { MODULE_SYSTEM, MODULE_SCHEMA, SYNTHESE_SYSTEM, SYNTHESE_SCHEMA, LECON_SYSTEM, LECON_SCHEMA, neutralize } from '@/lib/prompts/etude/prompts';
import { extractPages, extraitPages, NonRetryableError } from './extract';
import { construireModules, repartirLecons, type Module } from './structure';
import { normalizeModule, normalizeSequence, normalizeSynthese, planDepuisModules, type AnalyseModule } from './validate';
import { ENGINE_VERSION, type Couverture, type ModuleCours, type PlanSequence, type Synthese } from './types';

/**
 * MOTEUR ÉTUDES GUIDÉES v4 — traitements exécutés par le worker (/api/worker/ai).
 *
 * Chaîne : texte page par page → MODULES (plan réel de l'auteur, par le code, gratuit) →
 * compréhension de chaque module (un appel par module : notions, distinctions, leçons, carte) →
 * SYNTHÈSE (introduction pédagogique + carte générale) → LEÇONS générées à la demande.
 *
 * Coûts maîtrisés :
 *  - contenus COMMUNS mis en cache par (empreinte du texte normalisé, ENGINE_VERSION) : un cours
 *    étudié par 1 000 étudiants n'est analysé qu'UNE fois ;
 *  - single-flight : verrou de contenu, les demandes simultanées attendent le premier calcul ;
 *  - reprise : chaque étape réussie est enregistrée dans job.result, une panne ne refait pas
 *    payer ce qui est déjà fait ;
 *  - leçons générées à la demande (E-01), une par une : rien n'est payé pour un parcours abandonné.
 */

export interface EngineDeps {
  ctx: { mark: (status: string, progress: number, phase: string) => Promise<void> };
  patchJob: (id: string, patch: Record<string, any>) => Promise<void>;
  withLeaseHeartbeat: <T>(jobId: string, fn: () => Promise<T>, lockHash?: string) => Promise<T>;
  acquireContentLock: (hash: string) => Promise<boolean>;
  releaseContentLock: (hash: string) => Promise<void>;
  generate: (system: string, prompt: string, schema: any, tracking: { userId?: string; feature: string; documentId?: string }, temperature?: number, thinkingBudget?: number) => Promise<any>;
}

const MAX_MODULES = 40;           // un appel d'analyse par module ; un précis de 450 pages tient en 40
const MAX_LECONS = 60;            // borne de la table etude_sequences (ordre ≤ 60)
const MODULE_PARALLEL = 3;        // appels simultanés par analyse (limite la pression sur Gemini)
const MODULE_MAX_CHARS = 90000;   // texte d'un module transmis à l'analyse
const LECON_MAX_CHARS = 32000;    // pages du cours transmises pour rédiger une leçon
const SYNTHESE_MAX_CHARS = 110000;

/**
 * Budget de « réflexion » Gemini par étape (tokens facturés au tarif de sortie, et lents).
 * Comprendre un module et rédiger une leçon sont les deux étapes où la qualité se joue.
 */
const THINK = { module: 1024, synthese: 1024, lecon: 1024 };

const lockKeyAnalyse = (hash: string) => `etude3:${ENGINE_VERSION}:${hash}`;
const lockKeySequence = (hash: string, ordre: number) => `etude3seq:${ENGINE_VERSION}:${hash}:${ordre}`;

/** Analyse détaillée d'un module, lue SEULEMENT par la rédaction des leçons (colonne « analyses »). */
type AnalyseDetaillee = Omit<AnalyseModule, 'lecons' | 'carte'>;

async function loadAnalyse(hash: string) {
  const { data } = await supabaseAdmin
    .from('etude_analyses').select('statut, plan, pages_texte, couverture, titre, modules, analyses')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  return data as {
    statut: string; plan: PlanSequence[] | null; pages_texte: string[] | null; couverture: Couverture; titre: string | null;
    modules: Omit<ModuleCours, 'carte'>[] | null; analyses: Record<string, AnalyseDetaillee> | null;
  } | null;
}

/** Rattache l'empreinte aux parcours du document (tous les étudiants qui l'étudient). */
async function linkParcours(documentId: string, hash: string) {
  await supabaseAdmin.from('etude_parcours')
    .update({ source_hash: hash, updated_at: new Date().toISOString() })
    .eq('document_id', documentId).eq('engine_version', ENGINE_VERSION).is('source_hash', null);
}

const planDuCours = (modules: Module[]) =>
  modules.map((m) => `${m.id}. ${[...m.chemin, m.titre].join(' > ')} (p. ${m.pages[0]}-${m.pages[m.pages.length - 1]})`).join('\n');

// ---------------------------------------------------------------------------
// Job « etude3_analyse » : extraction → modules → compréhension → synthèse
// ---------------------------------------------------------------------------

/** Avancement d'une analyse, conservé dans la ligne etude_analyses (colonne « carte ») tant
 *  qu'elle n'est pas prête : un nouveau job sur le même contenu reprend là où l'autre s'est
 *  arrêté, sans repayer les modules déjà compris. Remplacé par le contenu final à la fin. */
interface Avancement {
  en_cours: true;
  modules: Module[];
  analyses: (AnalyseModule | null)[];
  synthese?: Synthese;
}

async function statutAnalyse(hash: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('etude_analyses').select('statut')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  return (data?.statut as string) ?? null;
}

async function lireAvancement(hash: string) {
  const { data } = await supabaseAdmin.from('etude_analyses').select('pages_texte, couverture, carte')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  if (!data?.pages_texte) return null;
  const av = (data.carte as any)?.en_cours ? (data.carte as Avancement) : null;
  return { pages: data.pages_texte as string[], couverture: data.couverture as Couverture, avancement: av };
}

async function enregistrerAvancement(hash: string, av: Avancement) {
  const { error } = await supabaseAdmin.from('etude_analyses').update({ carte: av, updated_at: new Date().toISOString() })
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).neq('statut', 'pret');
  if (error) throw new Error(`Avancement de l’analyse : ${error.message}`);
}

/** Le verrou de contenu est prolongé à chaque étape (une analyse de 40 modules dure plus de 5 min). */
async function prolongerVerrou(lock: string) {
  await supabaseAdmin.from('ai_content_locks').update({ expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() }).eq('hash', lock);
}

export async function processEtudeAnalyse(job: any, deps: EngineDeps): Promise<any> {
  const documentId: string = job.payload?.documentId;
  if (!documentId) throw new NonRetryableError('Document manquant.');
  const { ctx } = deps;
  let result: any = job.result || {};

  // 1. Empreinte du texte. Le PDF n'est lu qu'une fois par job : l'empreinte est ensuite gardée.
  let hash: string | undefined = result.hash;
  let pages: string[] | undefined;
  let couverture: Couverture | undefined;
  const extraire = async () => {
    // Extraction gratuite (aucune IA). PDF scanné → arrêt immédiat et définitif (E-03).
    await ctx.mark('processing', 8, 'Lecture du PDF, page par page…');
    const { data: doc } = await supabaseAdmin.from('documents').select('id, user_id, url_fichier').eq('id', documentId).maybeSingle();
    if (!doc) throw new NonRetryableError('Document introuvable.');
    return extractPages(await downloadDocumentPdf(doc));
  };
  if (!hash) {
    const ex = await extraire();
    hash = ex.hash; pages = ex.pages; couverture = ex.couverture;
    result = { ...result, hash };
  }

  // 2. Déjà analysé (par n'importe quel étudiant, même texte, même version du moteur) ? Rien à payer.
  if ((await statutAnalyse(hash)) === 'pret') { await linkParcours(documentId, hash); return { hash, reused: true }; }

  // 3. Single-flight : un seul calcul par contenu. Celui qui attend ne relit plus le PDF (empreinte
  //    gardée) et ne lit que le statut, une colonne légère.
  const lock = lockKeyAnalyse(hash);
  if (!result.lockHeld) {
    if (!(await deps.acquireContentLock(lock))) {
      await deps.patchJob(job.id, { result });
      await ctx.mark('processing', 10, 'Un autre étudiant fait analyser ce même cours : on attend son résultat…');
      return { __requeueMs: 6000 };
    }
    result = { ...result, lockHeld: true };
    await deps.patchJob(job.id, { result });
    // Le précédent détenteur a peut-être terminé entre-temps.
    if ((await statutAnalyse(hash)) === 'pret') {
      await deps.releaseContentLock(lock);
      await linkParcours(documentId, hash);
      return { hash, reused: true };
    }
  }

  // Une étape = au plus un lot d'appels IA, puis on enregistre et on rend la main (le worker
  // repart aussitôt). Chaque invocation reste courte : compatible avec une limite de durée
  // serverless basse, et une coupure ne fait perdre que l'étape en cours.
  const yieldStep = async () => { await deps.patchJob(job.id, { result }); return { __requeueMs: 50 }; };
  let finished = false;
  try {
    await prolongerVerrou(lock);

    // 4. Texte et avancement : relus en base (ou extraits si la ligne n'existe pas encore).
    let lu = pages ? null : await lireAvancement(hash);
    if (!pages && !lu) {
      const ex = await extraire();
      if (ex.hash !== hash) throw new NonRetryableError('Le document a changé pendant l’analyse. Relance l’étude.');
      pages = ex.pages; couverture = ex.couverture;
    } else if (lu) { pages = lu.pages; couverture = lu.couverture; }
    if (!lu) lu = await lireAvancement(hash);

    let av: Avancement;
    if (lu?.avancement) av = lu.avancement;
    else {
      // Structure : modules tirés du plan de l'auteur (code seul, gratuit, déterministe).
      const modules = construireModules(pages!, { maxModules: MAX_MODULES });
      if (modules.length === 0) throw new NonRetryableError('Ce PDF ne contient pas de texte exploitable.');
      const pagesLues = new Set(modules.flatMap((m) => m.pages));
      const couv: Couverture = { ...couverture!, pages_lues: Math.min(couverture!.pages_lues, pagesLues.size), tronque: false };
      av = { en_cours: true, modules, analyses: modules.map(() => null) };
      const { error } = await supabaseAdmin.from('etude_analyses').upsert(
        { source_hash: hash, engine_version: ENGINE_VERSION, statut: 'en_cours', couverture: couv, pages_texte: pages, carte: av, updated_at: new Date().toISOString() },
        { onConflict: 'source_hash,engine_version' },
      );
      if (error) throw new Error(`Création de l’analyse : ${error.message}`);
      return await yieldStep();
    }
    const modules = av.modules;
    const budgets = repartirLecons(modules, MAX_LECONS);

    // 5. Compréhension, module par module (lots parallèles bornés). Les réussites d'un lot sont
    //    gardées même si un autre appel du lot échoue : rien de payé n'est perdu.
    const manquants = modules.map((_, i) => i).filter((i) => !av.analyses[i]);
    if (manquants.length > 0) {
      const lot = manquants.slice(0, MODULE_PARALLEL);
      const faits = modules.length - manquants.length;
      await ctx.mark('generating', 12 + Math.round((68 * faits) / modules.length), `Compréhension du cours : partie ${faits + 1} sur ${modules.length}…`);
      const plan = planDuCours(modules);
      const sorties = await deps.withLeaseHeartbeat(job.id, () => Promise.allSettled(lot.map((i) => {
        const m = modules[i];
        const prompt = [
          `PLAN DU COURS (modules) :\n${plan}`,
          `MODULE À ANALYSER : ${m.id}. ${[...m.chemin, m.titre].join(' > ')}`,
          `NOMBRE DE LEÇONS À PRÉVOIR POUR CE MODULE : ${budgets[i]}`,
          `<MODULE pages="${m.pages[0]}-${m.pages[m.pages.length - 1]}">\n${neutralize(extraitPages(pages!, m.pages, MODULE_MAX_CHARS))}\n</MODULE>`,
        ].join('\n\n');
        return deps.generate(MODULE_SYSTEM, prompt, MODULE_SCHEMA, { userId: job.user_id, feature: 'etude3_module', documentId }, 0.2, THINK.module)
          .then((raw) => normalizeModule(raw, m, budgets[i]));
      })), lock);
      sorties.forEach((s, k) => { if (s.status === 'fulfilled') av.analyses[lot[k]] = s.value; });
      await enregistrerAvancement(hash, av);
      const echec = sorties.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (echec) throw echec.reason;
      return await yieldStep();
    }

    // 6. Synthèse : l'introduction pédagogique à tout le cours. Validée AVANT d'être gardée :
    //    une sortie inexploitable est régénérée à la tentative suivante, jamais reprise telle quelle.
    const analysesOk = av.analyses as AnalyseModule[];
    if (!av.synthese) {
      await ctx.mark('generating', 84, 'Rédaction de ton introduction au cours et de sa carte…');
      const vue = modules.map((m, i) => ({
        id: m.id, place: m.chemin, titre: analysesOk[i].titre, pages: `${m.pages[0]}-${m.pages[m.pages.length - 1]}`,
        idee_centrale: analysesOk[i].idee_centrale,
        notions: analysesOk[i].notions.filter((n) => n.niveau === 'indispensable' || n.niveau === 'importante').slice(0, 8).map((n) => `${n.nom} : ${n.sens.slice(0, 220)}`),
        distinctions: analysesOk[i].distinctions.slice(0, 4).map((d) => `${d.a} / ${d.b} : ${d.critere.slice(0, 160)}`),
      }));
      const contexte = neutralize(JSON.stringify({ pages: pages!.length, modules: vue })).slice(0, SYNTHESE_MAX_CHARS);
      const raw = await deps.withLeaseHeartbeat(job.id, () => deps.generate(
        SYNTHESE_SYSTEM, `<CARTE>\n${contexte}\n</CARTE>`, SYNTHESE_SCHEMA,
        { userId: job.user_id, feature: 'etude3_synthese', documentId }, 0.4, THINK.synthese), lock);
      av.synthese = normalizeSynthese(raw, modules.map((m) => m.id));
      await enregistrerAvancement(hash, av);
      return await yieldStep();
    }

    // 7. Enregistrement du contenu commun, rangé par usage : léger pour les pages (titre,
    //    modules), cartes pour Introduction et Carte, détail des notions pour le worker seulement.
    await ctx.mark('saving', 94, 'Enregistrement…');
    const synthese = av.synthese;
    const plan = planDepuisModules(analysesOk, MAX_LECONS);
    const modulesLegers = modules.map((m, i) => ({ id: m.id, titre: analysesOk[i].titre, chemin: m.chemin, pages: m.pages, idee_centrale: analysesOk[i].idee_centrale }));
    const carte = { modules: modules.map((m, i) => ({ ...modulesLegers[i], carte: analysesOk[i].carte.noeuds.length ? analysesOk[i].carte : null })) };
    const analysesDetaillees: Record<string, AnalyseDetaillee> = Object.fromEntries(modules.map((m, i) => {
      const { lecons: _l, carte: _c, ...reste } = analysesOk[i];
      return [m.id, reste];
    }));
    const { error } = await supabaseAdmin.from('etude_analyses').update({
      statut: 'pret', synthese, plan, carte, carte_mentale: synthese.carte,
      titre: synthese.titre, idee_centrale: synthese.presentation.split(/(?<=[.!?])\s/)[0]?.slice(0, 600) || null,
      modules: modulesLegers, analyses: analysesDetaillees,
      erreur: null, updated_at: new Date().toISOString(),
    }).eq('source_hash', hash).eq('engine_version', ENGINE_VERSION);
    if (error) throw new Error(`Enregistrement de l’analyse : ${error.message}`);
    await linkParcours(documentId, hash);
    finished = true;
    return { hash, modules: modules.length, lecons: plan.length, pages: pages!.length };
  } catch (err) {
    // Échec : verrou libéré ET marqué comme non détenu, pour que la tentative suivante le reprenne
    // proprement (sinon elle tournerait sans verrou et pourrait libérer celui d'un autre job).
    finished = true;
    result = { ...result, lockHeld: false };
    await deps.patchJob(job.id, { result }).catch(() => {});
    throw err;
  } finally {
    if (finished) await deps.releaseContentLock(lock);
  }
}

const cle = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Job « etude3_sequence » : une leçon du parcours, à la demande
// ---------------------------------------------------------------------------
export async function processEtudeSequence(job: any, deps: EngineDeps): Promise<any> {
  const documentId: string = job.payload?.documentId;
  const ordre = Number(job.payload?.ordre);
  const hash: string = job.payload?.hash;
  if (!documentId || !hash || !Number.isInteger(ordre) || ordre < 1) throw new NonRetryableError('Paramètres de leçon invalides.');

  const { data: done } = await supabaseAdmin.from('etude_sequences').select('ordre')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).eq('ordre', ordre).maybeSingle();
  if (done) return { hash, ordre, reused: true };

  const analyse = await loadAnalyse(hash);
  if (!analyse || analyse.statut !== 'pret') throw new NonRetryableError('Analyse du cours indisponible.');
  const plan = Array.isArray(analyse.plan) ? analyse.plan : [];
  const item = plan.find((p) => p.ordre === ordre);
  if (!item) throw new NonRetryableError('Cette leçon n’existe pas dans le parcours.');

  const lock = lockKeySequence(hash, ordre);
  const leader = await deps.acquireContentLock(lock);
  if (!leader) {
    await deps.ctx.mark('processing', 20, 'Cette leçon est déjà en préparation…');
    return { __requeueMs: 4000 };
  }
  try {
    await deps.ctx.mark('generating', 40, `Préparation de la leçon ${ordre}…`);
    const pages = analyse.pages_texte || [];
    const numeros = item.pages?.length ? item.pages : pages.map((_, i) => i + 1);
    const cours = neutralize(extraitPages(pages, numeros, LECON_MAX_CHARS));
    const mod = analyse.modules?.find((m) => m.id === item.module);
    const compris = item.module ? analyse.analyses?.[item.module] : undefined;

    // Comprendre avant d'expliquer : l'analyse des notions de CETTE leçon accompagne ses pages.
    const visees = new Set(item.notions.map(cle));
    const notions = (compris?.notions || []).filter((n) => [...visees].some((v) => cle(n.nom).includes(v) || v.includes(cle(n.nom))));
    const analyseLecon = {
      notions: (notions.length ? notions : (compris?.notions || []).slice(0, 6)),
      distinctions: compris?.distinctions || [],
      pieges: compris?.pieges || [],
      ambiguites: compris?.ambiguites || [],
    };
    const precedente = plan.find((p) => p.ordre === ordre - 1);
    const suivante = plan.find((p) => p.ordre === ordre + 1);
    const prompt = [
      `COURS : ${analyse.titre || ''}`,
      mod ? `MODULE : ${[...mod.chemin, mod.titre].join(' > ')} — ${mod.idee_centrale}` : '',
      precedente ? `LEÇON PRÉCÉDENTE (déjà étudiée) : ${precedente.titre}` : 'C’est la PREMIÈRE leçon du parcours.',
      `LEÇON ${ordre} sur ${plan.length} : ${item.titre}\nObjectif : ${item.objectif}\nNotions : ${item.notions.join(', ')}${item.accroche ? `\nAccroche prévue : ${item.accroche}` : ''}`,
      suivante ? `LEÇON SUIVANTE (à annoncer dans « suite ») : ${suivante.titre} — ${suivante.objectif}` : 'C’est la DERNIÈRE leçon : « suite » vide.',
      `<CARTE>\n${neutralize(JSON.stringify(analyseLecon)).slice(0, 14000)}\n</CARTE>`,
      `<COURS>\n${cours}\n</COURS>`,
    ].filter(Boolean).join('\n\n');
    const raw = await deps.withLeaseHeartbeat(job.id, () => deps.generate(
      LECON_SYSTEM, prompt, LECON_SCHEMA, { userId: job.user_id, feature: 'etude3_sequence', documentId }, 0.4, THINK.lecon), lock);
    const sequence = normalizeSequence(raw, ordre, pages.length || 9999);

    await deps.ctx.mark('saving', 90, 'Enregistrement…');
    const { error } = await supabaseAdmin.from('etude_sequences')
      .upsert({ source_hash: hash, engine_version: ENGINE_VERSION, ordre, contenu: sequence }, { onConflict: 'source_hash,engine_version,ordre', ignoreDuplicates: true });
    if (error) throw new Error(`Enregistrement de la leçon : ${error.message}`);
    return { hash, ordre };
  } finally {
    await deps.releaseContentLock(lock);
  }
}
