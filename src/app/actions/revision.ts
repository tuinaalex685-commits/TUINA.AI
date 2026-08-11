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

/**
 * Ouvre une session de révision : consomme un crédit, puis renvoie les cartes dues.
 *
 * Les cartes transitent par le serveur (service role) plutôt que d'être lues
 * directement par le navigateur : pour un cours du catalogue, elles n'appartiennent
 * pas encore à l'utilisateur, la RLS les lui refuserait. C'est aussi ce qui rend le
 * quota incontournable — il n'existe pas de chemin client vers ces cartes.
 */
export async function startRevisionSession(documentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  const access = await resolveDocumentAccess(supabaseAdmin, user.id, documentId);
  if (access === 'denied') return { error: 'Contenu introuvable ou accès refusé.' };

  const quota = await consumeQuota(supabase, user.id, user.email, 'revision');
  if (!quota.allowed) {
    return { error: quota.error, quotaReached: true, used: quota.used, quota: quota.quota };
  }

  try {
    const { data: cards, error } = await supabaseAdmin
      .from('flashcards')
      .select('id, question, reponse, box, next_review')
      .eq('user_id', user.id)
      .eq('document_id', documentId)
      .lte('next_review', new Date().toISOString())
      .order('next_review', { ascending: true });

    if (error) throw new Error(error.message);

    // Aucune carte due : ce n'est pas une session, on rend le crédit. Sans cela,
    // un étudiant qui a tout révisé perdrait ses crédits en ouvrant des paquets vides.
    if (!cards || cards.length === 0) {
      if (!quota.unlimited) await refundQuota(user.id, 'revision');
      return { success: true, cards: [], empty: true, used: quota.used - 1, quota: quota.quota };
    }

    return { success: true, cards, empty: false, used: quota.used, quota: quota.quota };
  } catch (e: any) {
    if (!quota.unlimited) await refundQuota(user.id, 'revision');
    return { error: e?.message || 'Impossible de démarrer la session de révision.' };
  }
}
