// Serveur uniquement : lectures avec le service role APRÈS contrôle d'accès explicite.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveDocumentAccess } from '@/lib/access';
import { isPremium } from '@/lib/plan';
import { enqueueDedup } from '@/lib/jobs/enqueue';
import { ENGINE_VERSION, MAX_TENTATIVES, type CarteMentale, type Couverture, type PlanSequence, type Sequence, type Synthese, type Verdict } from './types';

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

/** Contenu commun (sans le texte du cours). */
export async function getAnalyse(hash: string, withSynthese = false): Promise<Analyse | null> {
  const cols = `statut, couverture, carte, plan, carte_mentale${withSynthese ? ', synthese' : ''}`;
  const { data } = await supabaseAdmin.from('etude_analyses').select(cols).eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  if (!data) return null;
  return { synthese: null, ...(data as any) } as Analyse;
}

export async function getSequence(hash: string, ordre: number): Promise<Sequence | null> {
  const { data } = await supabaseAdmin.from('etude_sequences').select('contenu')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).eq('ordre', ordre).maybeSingle();
  return (data?.contenu as Sequence) ?? null;
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

/** Notions « À revoir » non résolues, pour un cours. */
export async function notionsARevoir(userId: string, documentId: string) {
  const { data } = await supabaseAdmin.from('etude_a_revoir').select('sequence_ordre, activite_id, notion, created_at')
    .eq('user_id', userId).eq('document_id', documentId).is('resolu_at', null).order('sequence_ordre', { ascending: true });
  return data || [];
}
