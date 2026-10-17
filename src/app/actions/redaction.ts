"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium, isMissingColumn } from '@/lib/plan';
import { resolveDocumentAccess } from '@/lib/access';
import { COMPARTIMENT_BY_SLUG, LIMITS, type CompartimentSlug } from '@/lib/redaction/compartiments';

/**
 * Rédaction juridique — actions serveur.
 *
 * Règle de sécurité : le navigateur ne peut modifier QUE le texte de sa copie (droit de
 * colonne, migration 05). Création, passage en « à retravailler », suppression, versions
 * et corrections passent par le serveur, après vérification de la propriété. La correction
 * elle-même est un job IA (actions/jobs.ts → worker), jamais écrite par le client.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';

async function premiumUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' as const };
  if (!(await isPremium(supabase, user.email))) {
    return { error: 'La Rédaction est réservée aux membres Premium.' as const, premiumRequired: true };
  }
  return { supabase, user };
}

const ACTIVE_JOB = ['pending', 'queued', 'processing', 'generating', 'saving'];
const STUCK_AFTER_MS = 3 * 60 * 1000;
const MAX_COPIES = 300;

/**
 * Une copie « en_cours » sans job de correction actif depuis plus de 3 minutes est bloquée
 * (action serveur interrompue entre le verrou et la mise en file). On la repasse en « erreur »
 * pour que l'étudiant puisse la rendre à nouveau. Renvoie true si elle a été débloquée.
 */
async function releaseIfStuck(id: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('ai_jobs').select('id', { count: 'exact', head: true })
    .eq('type', 'redaction').eq('payload->>redactionId', id).in('status', ACTIVE_JOB);
  if ((count || 0) > 0) return false;
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data } = await supabaseAdmin.from('redactions')
    .update({ statut: 'erreur', last_error: 'La correction ne s’est pas lancée.', updated_at: new Date().toISOString() })
    .eq('id', id).eq('statut', 'en_cours').lt('updated_at', cutoff)
    .select('id');
  return !!data?.length;
}

/** Copie de l'utilisateur (lecture serveur), ou null. */
async function ownedRedaction(id: string, userId: string) {
  if (!UUID_RE.test(id)) return null;
  const { data } = await supabaseAdmin
    .from('redactions').select('id, user_id, statut').eq('id', id).eq('user_id', userId).maybeSingle();
  return data;
}

export async function createRedaction(input: {
  slug: CompartimentSlug;
  source: 'cours' | 'libre';
  documentId?: string | null;
  sujet: string;
  enonce?: string | null;
}) {
  const ctx = await premiumUser();
  if ('error' in ctx) return ctx;
  const { user } = ctx;

  const comp = COMPARTIMENT_BY_SLUG.get(input?.slug);
  if (!comp) return { error: 'Type d’exercice inconnu.' };

  const sujet = clean(input.sujet, LIMITS.sujet);
  const enonce = clean(input.enonce, LIMITS.enonce);
  if (sujet.length < 5) return { error: 'Écris le sujet (au moins quelques mots).' };
  if (comp.enonceRequis && enonce.length < 40) {
    return { error: comp.slug === 'commentaire' ? 'Colle le texte de la décision à commenter.' : 'Colle l’énoncé complet du cas.' };
  }

  // Source « cours » : un document que l'étudiant possède, ou un cours du catalogue de son niveau.
  let documentId: string | null = null;
  if (input.source === 'cours') {
    if (!input.documentId || !UUID_RE.test(input.documentId)) return { error: 'Choisis un cours.' };
    const access = await resolveDocumentAccess(supabaseAdmin, user.id, input.documentId);
    if (access !== 'owner' && access !== 'catalog') return { error: 'Cours introuvable ou accès refusé.' };
    documentId = input.documentId;
  }

  const { count: existing } = await supabaseAdmin
    .from('redactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if ((existing || 0) >= MAX_COPIES) return { error: `Tu as atteint ${MAX_COPIES} copies : supprime d’anciennes copies pour en créer de nouvelles.` };

  const base = { user_id: user.id, type: comp.type, titre: sujet.slice(0, 200), sujet, statut: 'brouillon', contenu: '' };
  const extended = { ...base, source: documentId ? 'cours' : 'libre', document_id: documentId, enonce: enonce || null };

  let { data, error } = await supabaseAdmin.from('redactions').insert(extended).select('id').single();
  if (isMissingColumn(error)) {
    // Migration 05 pas encore appliquée : l'énoncé est conservé dans le sujet.
    const fallback = { ...base, sujet: enonce ? `${sujet}\n\n${enonce}`.slice(0, LIMITS.enonce) : sujet };
    ({ data, error } = await supabaseAdmin.from('redactions').insert(fallback).select('id').single());
  }
  if (error || !data) {
    console.error('[redaction] création impossible:', error?.message);
    return { error: 'Création impossible. Réessaie.' };
  }

  revalidatePath('/app/redaction');
  return { success: true, id: data.id as string };
}

/** Sauvegarde du texte de la copie (client de l'étudiant : seul droit qu'il garde). */
export async function updateRedactionContent(id: string, contenu: string) {
  if (!UUID_RE.test(id)) return { error: 'Requête invalide.' };
  if (typeof contenu !== 'string' || contenu.length > LIMITS.copie) {
    return { error: `Ta copie dépasse ${LIMITS.copie.toLocaleString('fr-FR')} caractères.` };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Pas d'écriture pendant une correction ni sur une copie corrigée (« Retravailler » d'abord).
  const { data, error } = await supabase
    .from('redactions')
    .update({ contenu, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('statut', ['brouillon', 'erreur'])
    .select('id');
  if (error) return { error: 'Sauvegarde impossible. Vérifie ta connexion.' };
  if (!data?.length) return { error: 'Cette copie n’est pas modifiable pour le moment.' };
  return { success: true, savedAt: new Date().toISOString() };
}

/**
 * Rend la copie : contrôle, puis job de correction (quota journalier atomique dans
 * enqueueAiJob), puis statut « en_cours » posé par le serveur. En cas d'échec définitif,
 * le worker remet la copie en « erreur » et rend le crédit.
 */
export async function submitRedaction(id: string) {
  const ctx = await premiumUser();
  if ('error' in ctx) return ctx;
  if (!UUID_RE.test(id)) return { error: 'Requête invalide.' };

  const { data: red } = await supabaseAdmin
    .from('redactions').select('id, statut, contenu').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (!red) return { error: 'Copie introuvable.' };
  if (red.statut === 'en_cours' && !(await releaseIfStuck(id))) return { error: 'Ta copie est déjà en correction.' };
  if (red.statut === 'en_cours') red.statut = 'erreur';
  if (red.statut === 'analyse') return { error: 'Cette version est déjà corrigée : clique sur « Retravailler ma copie ».' };
  const length = String(red.contenu || '').trim().length;
  if (length < LIMITS.copieMinCorrection) {
    return { error: `Ta copie est trop courte pour être corrigée (au moins ${LIMITS.copieMinCorrection} caractères).` };
  }

  // Statut posé AVANT la mise en file (transition conditionnelle) : le worker ne peut pas
  // terminer avant, et deux clics simultanés ne lancent qu'une correction.
  const { data: locked } = await supabaseAdmin.from('redactions')
    .update({ statut: 'en_cours', last_error: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.user.id).in('statut', ['brouillon', 'erreur'])
    .select('id');
  if (!locked?.length) return { error: 'Ta copie est déjà en correction.' };

  const { enqueueAiJob } = await import('./jobs');
  const res = await enqueueAiJob('redaction', { redactionId: id });
  if ('error' in res && res.error) {
    await supabaseAdmin.from('redactions').update({ statut: red.statut }).eq('id', id).eq('statut', 'en_cours');
    return { error: res.error };
  }
  revalidatePath(`/app/redaction/${id}`);
  return { success: true, jobId: (res as { jobId?: string }).jobId ?? null };
}

/** Rouvre une copie corrigée pour en écrire une nouvelle version. */
export async function reworkRedaction(id: string) {
  const ctx = await premiumUser();
  if ('error' in ctx) return ctx;
  const red = await ownedRedaction(id, ctx.user.id);
  if (!red) return { error: 'Copie introuvable.' };
  if (red.statut === 'brouillon') return { success: true };
  if (red.statut !== 'analyse') return { error: 'La correction est en cours : patiente un instant.' };

  const { error } = await supabaseAdmin
    .from('redactions').update({ statut: 'brouillon', updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.user.id).eq('statut', 'analyse');
  if (error) return { error: 'Impossible de rouvrir la copie.' };
  revalidatePath(`/app/redaction/${id}`);
  return { success: true };
}

export async function deleteRedaction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };
  const red = await ownedRedaction(id, user.id);
  if (!red) return { success: true }; // idempotent
  // Pas de suppression pendant la correction : la correction déjà payée ne doit pas pouvoir
  // échouer « exprès » pour récupérer le crédit.
  if (red.statut === 'en_cours' && !(await releaseIfStuck(id))) {
    return { error: 'Ta copie est en correction : attends la fin pour la supprimer.' };
  }

  await supabaseAdmin.from('redaction_versions').delete().eq('redaction_id', id);
  const { error } = await supabaseAdmin.from('redactions').delete().eq('id', id).eq('user_id', user.id).neq('statut', 'en_cours');
  if (error) return { error: 'Suppression impossible.' };
  revalidatePath('/app/redaction');
  return { success: true };
}

/**
 * Sujets proposés pour un cours, s'ils sont déjà en cache (aucun appel IA ici).
 * Sinon, le client lance le job `redaction_sujets` puis rappelle cette action.
 */
export async function getSujetsProposes(documentId: string, slug: CompartimentSlug) {
  const ctx = await premiumUser();
  if ('error' in ctx) return ctx;
  const comp = COMPARTIMENT_BY_SLUG.get(slug);
  if (!comp?.sujetsDepuisCours) return { error: 'Pas de sujets proposés pour cet exercice.' };
  if (!UUID_RE.test(documentId)) return { error: 'Cours invalide.' };

  const access = await resolveDocumentAccess(supabaseAdmin, ctx.user.id, documentId);
  if (access !== 'owner' && access !== 'catalog') return { error: 'Cours introuvable ou accès refusé.' };

  const { data: doc } = await supabaseAdmin.from('documents').select('text_hash').eq('id', documentId).maybeSingle();
  if (!doc?.text_hash) return { success: true, sujets: null };
  const { data: cached, error } = await supabaseAdmin
    .from('redaction_sujets').select('sujets').eq('source_hash', doc.text_hash).eq('type', comp.type).maybeSingle();
  if (error) return { success: true, sujets: null }; // table absente avant la migration 05
  return { success: true, sujets: (cached?.sujets as unknown[]) ?? null };
}

/** Corrections utilisées aujourd'hui (même compteur que celui qui autorise la correction). */
export async function getDailyRedactionUsage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const jour = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('free_daily_usage').select('count')
    .eq('user_id', user.id).eq('jour', jour).eq('feature', 'redaction').maybeSingle();
  return data?.count || 0;
}
