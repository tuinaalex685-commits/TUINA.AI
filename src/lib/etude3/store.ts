// Serveur uniquement : lectures avec le service role APRÈS contrôle d'accès explicite.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveDocumentAccess } from '@/lib/access';
import { isPremium } from '@/lib/plan';
import { enqueueDedup } from '@/lib/jobs/enqueue';
import { ACTIVITE_PREFIXE, ENGINE_VERSION, MAX_TENTATIVES, type CarteMentale, type Couverture, type ModuleCours, type PlanSequence, type Sequence, type Synthese, type Verdict } from './types';

export type AccesEtude = { ok: true; via: 'owner' | 'catalog'; nom: string } | { ok: false; raison: 'introuvable' | 'premium' };

/**
 * Qui peut étudier ce document ?
 *  - son propriétaire s'il est Premium (import personnel = Premium) ;
 *  - tout étudiant pour un cours publié au catalogue de son niveau.
 */
export async function accesEtude(userId: string, email: string | null | undefined, documentId: string): Promise<AccesEtude> {
  const access = await resolveDocumentAccess(supabaseAdmin, userId, documentId);
  if (access !== 'owner' && access !== 'catalog') return { ok: false, raison: 'introuvable' };
  if (access === 'owner') {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    if (!(await isPremium(supabase, email))) return { ok: false, raison: 'premium' };
  }
  const { data: doc } = await supabaseAdmin.from('documents').select('nom').eq('id', documentId).maybeSingle();
  return { ok: true, via: access, nom: String(doc?.nom || 'Cours').replace(/\.pdf$/i, '') };
}

export interface Parcours {
  user_id: string;
  document_id: string;
  source_hash: string | null;
  engine_version: string;
  started_at: string;
  sequence_courante: number;
  sequence_max: number;
  synthese_vue_at: string | null;
  statut: 'en_cours' | 'termine';
}

export async function getParcours(userId: string, documentId: string): Promise<Parcours | null> {
  const { data } = await supabaseAdmin.from('etude_parcours').select('*').eq('user_id', userId).eq('document_id', documentId).maybeSingle();
  return (data as Parcours) ?? null;
}

/** Le parcours a été commencé avec une version précédente du moteur (son plan n'existe plus). */
export const parcoursAncien = (p: Parcours | null) => !!p && p.engine_version !== ENGINE_VERSION;

/**
 * Passage d'un parcours à la version actuelle du moteur, à la demande de l'étudiant (E-05).
 * Le plan de leçons change : la progression repart du début. Les réponses de l'ancien parcours
 * restent en base (leurs identifiants d'activité n'ont pas le préfixe de la version actuelle).
 */
export async function passerVersionActuelle(userId: string, documentId: string) {
  return supabaseAdmin.from('etude_parcours').update({
    // source_hash remis à zéro : l'empreinte de la nouvelle version est rattachée par l'analyse.
    engine_version: ENGINE_VERSION, source_hash: null, sequence_courante: 0, sequence_max: 1, synthese_vue_at: null,
    statut: 'en_cours', termine_at: null, updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('document_id', documentId).neq('engine_version', ENGINE_VERSION);
}

/** Empreinte du cours si un autre parcours (même document) l'a déjà obtenue : évite de relire le PDF. */
export async function knownHash(documentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('etude_parcours').select('source_hash')
    .eq('document_id', documentId).eq('engine_version', ENGINE_VERSION).not('source_hash', 'is', null).limit(1);
  return (data?.[0]?.source_hash as string) ?? null;
}

export interface Analyse {
  statut: 'en_cours' | 'pret' | 'echec';
  couverture: Couverture | null;
  carte: { titre: string; discipline: string; idee_centrale: string } | null;
  plan: PlanSequence[] | null;
  synthese: Synthese | null;
  carte_mentale: CarteMentale | null;
}

/**
 * Cache mémoire des contenus COMMUNS prêts. Une analyse, une leçon ou une carte à l'état « prêt »
 * ne change plus jamais pour une (empreinte, version) donnée : on peut la garder en mémoire de
 * l'instance serveur sans risque d'incohérence. À des milliers d'étudiants sur le même cours,
 * la base ne sert plus qu'une lecture par instance au lieu d'une par page vue.
 * Rien de personnel n'y entre (parcours, réponses : toujours relus en base).
 */
const CACHE_MAX = 300;
const CACHE_TTL_MS = 15 * 60_000;
const cache = new Map<string, { exp: number; val: unknown }>();
async function memo<T>(cle: string, charger: () => Promise<T | null>, garder: (v: T) => boolean): Promise<T | null> {
  const hit = cache.get(cle);
  if (hit && hit.exp > Date.now()) { cache.delete(cle); cache.set(cle, hit); return hit.val as T; } // LRU : remis en tête
  const val = await charger();
  if (val !== null && garder(val)) {
    cache.set(cle, { exp: Date.now() + CACHE_TTL_MS, val });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }
  return val;
}

/**
 * Contenu commun léger : jamais le texte du cours, jamais l'analyse détaillée des notions
 * (réservée au worker). La synthèse n'est lue que par la page Introduction.
 */
export async function getAnalyse(hash: string, withSynthese = false): Promise<Analyse | null> {
  return memo(`analyse:${ENGINE_VERSION}:${hash}:${withSynthese ? 1 : 0}`, async () => {
    const cols = `statut, couverture, plan, carte_mentale, titre, idee_centrale${withSynthese ? ', synthese' : ''}`;
    const { data } = await supabaseAdmin.from('etude_analyses').select(cols).eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
    if (!data) return null;
    const d = data as any;
    return {
      statut: d.statut, couverture: d.couverture, plan: d.plan, carte_mentale: d.carte_mentale, synthese: d.synthese ?? null,
      carte: d.titre ? { titre: d.titre, discipline: '', idee_centrale: d.idee_centrale || '' } : null,
    } as Analyse;
  }, (a) => a.statut === 'pret');
}

/** Plan léger des modules (titres, place dans le cours, pages) : pour l'accueil d'une étude. */
export async function getModules(hash: string): Promise<ModuleCours[]> {
  const res = await memo(`modules:${ENGINE_VERSION}:${hash}`, async () => {
    const { data } = await supabaseAdmin.from('etude_analyses').select('statut, modules')
      .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
    if (!data || (data as any).statut !== 'pret') return null;
    return (Array.isArray((data as any).modules) ? (data as any).modules : []).map((m: any) => ({ ...m, carte: null })) as ModuleCours[];
  }, () => true);
  return res ?? [];
}

/** Modules AVEC leurs cartes mentales : pour les pages Introduction et Carte. */
export async function getCartesModules(hash: string): Promise<ModuleCours[]> {
  const res = await memo(`cartes:${ENGINE_VERSION}:${hash}`, async () => {
    const { data } = await supabaseAdmin.from('etude_analyses').select('statut, carte')
      .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
    if (!data || (data as any).statut !== 'pret') return null;
    const mods = (data as any).carte?.modules;
    return Array.isArray(mods) ? mods as ModuleCours[] : [];
  }, () => true);
  return res ?? [];
}

export async function getSequence(hash: string, ordre: number): Promise<Sequence | null> {
  return memo(`seq:${ENGINE_VERSION}:${hash}:${ordre}`, async () => {
    const { data } = await supabaseAdmin.from('etude_sequences').select('contenu')
      .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).eq('ordre', ordre).maybeSingle();
    return (data?.contenu as Sequence) ?? null;
  }, () => true); // une leçon enregistrée est définitive (upsert ignoreDuplicates)
}

/** Lance (ou rejoint) la génération d'une séquence. Idempotent. */
export async function ensureSequenceJob(userId: string, documentId: string, hash: string, ordre: number) {
  return enqueueDedup({
    userId, type: 'etude3_sequence',
    payload: { documentId, hash, ordre },
    dedupKey: `${ENGINE_VERSION}:${hash}:${ordre}`,
  });
}

export interface EtatActivite {
  tentatives: number;
  dernier: Verdict | null;
  reussie: boolean;
  aRevoir: boolean;
  termine: boolean;
  retours: { numero: number; verdict: Verdict; reponse: string; retour: any }[];
}

/** État de chaque activité d'une séquence pour un étudiant (tentatives conservées, E-04). */
export async function etatActivites(userId: string, documentId: string, ordre: number): Promise<Record<string, EtatActivite>> {
  const [{ data: tentatives }, { data: revoir }] = await Promise.all([
    supabaseAdmin.from('etude_tentatives').select('activite_id, numero, verdict, reponse, retour')
      .eq('user_id', userId).eq('document_id', documentId).eq('sequence_ordre', ordre).order('numero', { ascending: true }),
    supabaseAdmin.from('etude_a_revoir').select('activite_id').eq('user_id', userId).eq('document_id', documentId).eq('sequence_ordre', ordre),
  ]);
  const aRevoir = new Set((revoir || []).map((r) => r.activite_id as string));
  const out: Record<string, EtatActivite> = {};
  for (const t of tentatives || []) {
    const e = (out[t.activite_id] ??= { tentatives: 0, dernier: null, reussie: false, aRevoir: false, termine: false, retours: [] });
    e.tentatives = Math.max(e.tentatives, t.numero);
    e.dernier = t.verdict as Verdict;
    if (t.verdict === 'juste') e.reussie = true;
    e.retours.push({ numero: t.numero, verdict: t.verdict as Verdict, reponse: t.reponse, retour: t.retour });
  }
  for (const [id, e] of Object.entries(out)) {
    e.aRevoir = aRevoir.has(id);
    e.termine = e.reussie || e.tentatives >= MAX_TENTATIVES;
  }
  return out;
}

/** Notions « À revoir » non résolues, pour un cours (parcours de la version actuelle seulement). */
export async function notionsARevoir(userId: string, documentId: string) {
  const { data } = await supabaseAdmin.from('etude_a_revoir').select('sequence_ordre, activite_id, notion, created_at')
    .eq('user_id', userId).eq('document_id', documentId).is('resolu_at', null).like('activite_id', `${ACTIVITE_PREFIXE}%`)
    .order('sequence_ordre', { ascending: true });
  return data || [];
}
