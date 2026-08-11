"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import { consumeQuota, refundQuota } from '@/lib/quota';
import { listCatalogDocuments, resolveDocumentAccess } from '@/lib/access';

/**
 * SECTION RÉVISION — sources disponibles et ouverture d'une session.
 *
 * Le quota Free porte sur la SESSION (ouvrir un paquet et le réviser), pas sur la
 * carte : cinq paquets par jour est lisible pour l'étudiant, et le coût réel est de
 * toute façon nul (les flashcards sont clonées par source_hash — seul le tout premier
 * utilisateur d'un contenu déclenche un appel Gemini, tous les suivants copient).
 *
 * Le comptage vit ici, côté serveur, et non dans RevisionsManager : un compteur
 * client se remet à zéro d'un simple rechargement de page.
 */

export interface RevisionSource {
  documentId: string;
  titre: string;
  source: 'perso' | 'catalogue';
  matiere: string | null;
}

/** Documents personnels (Premium) + cours du catalogue (tout le monde). */
export async function getRevisionSources(): Promise<
  { success: true; sources: RevisionSource[]; premium: boolean } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  const premium = await isPremium(supabase, user.email);

  const { data: docs } = await supabaseAdmin
    .from('documents').select('id, nom').eq('user_id', user.id)
    .order('date_import', { ascending: false });

  const catalog = await listCatalogDocuments(supabaseAdmin);
  const ownedIds = new Set((docs || []).map((d: any) => d.id));

  const sources: RevisionSource[] = [
    ...(docs || []).map((d: any) => ({
      documentId: d.id, titre: d.nom, source: 'perso' as const, matiere: null,
    })),
    ...catalog
      .filter((c) => !ownedIds.has(c.documentId))
      .map((c) => ({
        documentId: c.documentId, titre: c.titre, source: 'catalogue' as const, matiere: c.matiere,
      })),
  ];

  return { success: true, sources, premium };
}

export type RevisionSourceRef = { type: 'document' | 'cours'; id: string };

/**
 * Autorise une source de révision. Les cours "classiques" (matières créées à la main)
 * restent strictement personnels ; seuls les documents peuvent venir du catalogue.
 */
async function authorizeSource(userId: string, ref: RevisionSourceRef): Promise<boolean> {
  if (ref.type === 'document') {
    return (await resolveDocumentAccess(supabaseAdmin, userId, ref.id)) !== 'denied';
  }
  const { data: cours } = await supabaseAdmin
    .from('cours').select('matiere_id').eq('id', ref.id).maybeSingle();
  if (!cours) return false;
  const { data: matiere } = await supabaseAdmin
    .from('matieres').select('id').eq('id', cours.matiere_id).eq('user_id', userId).maybeSingle();
  return !!matiere;
}

function dueCardsQuery(userId: string, ref: RevisionSourceRef) {
  const q = supabaseAdmin
    .from('flashcards')
    .select('id, question, reponse, box, next_review')
    .eq('user_id', userId)
    .eq('statut', 'validated')
    .lte('next_review', new Date().toISOString());
  return ref.type === 'document' ? q.eq('document_id', ref.id) : q.eq('cours_id', ref.id);
}

/**
 * Combien de cartes sont prêtes, SANS consommer de crédit.
 * Sert uniquement à afficher "12 cartes prêtes" avant que l'étudiant décide de
 * démarrer : compter n'est pas réviser, et facturer un simple coup d'œil serait
 * incompréhensible pour lui.
 */
export async function countDueCards(ref: RevisionSourceRef) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };
  if (!(await authorizeSource(user.id, ref))) return { error: 'Accès refusé.' };

  const { data, error } = await dueCardsQuery(user.id, ref);
  if (error) return { error: error.message };
  return { success: true, count: (data || []).length };
}

/**
 * Ouvre une session de révision : consomme un crédit, puis renvoie les cartes dues.
 *
 * Les cartes transitent par le serveur plutôt que d'être lues directement par le
 * navigateur : c'est ce qui rend le quota incontournable. Tant que la lecture se
 * faisait côté client, il suffisait de ne pas appeler cette action pour réviser
 * sans limite.
 *
 * Un crédit = une session ouverte. Retourner une carte, s'auto-évaluer et
 * enchaîner ne consomme plus rien ensuite.
 */
export async function startRevisionSession(ref: RevisionSourceRef) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  if (!(await authorizeSource(user.id, ref))) {
    return { error: 'Contenu introuvable ou accès refusé.' };
  }

  const quota = await consumeQuota(supabase, user.id, user.email, 'revision');
  if (!quota.allowed) {
    return { error: quota.error, quotaReached: true, used: quota.used, quota: quota.quota };
  }

  try {
    const { data: cards, error } = await dueCardsQuery(user.id, ref)
      .order('next_review', { ascending: true });
    if (error) throw new Error(error.message);

    // Aucune carte due : il n'y a pas eu de session, on rend le crédit. Sans cela,
    // un étudiant qui a déjà tout révisé perdrait ses crédits en ouvrant des paquets vides.
    if (!cards || cards.length === 0) {
      if (!quota.unlimited) await refundQuota(user.id, 'revision');
      return { success: true, cards: [], empty: true, used: Math.max(quota.used - 1, 0), quota: quota.quota };
    }

    return { success: true, cards, empty: false, used: quota.used, quota: quota.quota };
  } catch (e: any) {
    if (!quota.unlimited) await refundQuota(user.id, 'revision');
    return { error: e?.message || 'Impossible de démarrer la session de révision.' };
  }
}
