"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import { revalidatePath } from 'next/cache';
import { removeOwnedFiles } from '@/lib/storage';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Enregistre un PDF déjà déposé dans le Storage (dossier de l'utilisateur).
 *
 * Avant, la ligne `documents` était insérée par le NAVIGATEUR, avec un `url_fichier` choisi par
 * le client : le serveur allait ensuite télécharger cette adresse (SSRF) et pouvait traiter un
 * texte arbitraire. Ici, le serveur part du seul CHEMIN dans le bucket, vérifie qu'il est dans
 * le dossier de l'appelant et que le fichier existe, puis construit lui-même l'URL.
 */
export async function registerDocument(input: {
  path: string;
  nom: string;
  chapitreId?: string | null;
  matiereId?: string | null;
  coursId?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Importer ses propres cours = Premium (même règle que /api/etude/generate).
  if (!(await isPremium(supabase, user.email))) {
    return { error: "L'import de tes propres cours est réservé aux membres Premium." };
  }

  const path = String(input.path || '');
  const folder = `${user.id}/`;
  if (!path.startsWith(folder) || path.includes('..') || !path.toLowerCase().endsWith('.pdf')) {
    return { error: 'Fichier refusé.' };
  }

  // Le fichier existe-t-il vraiment, et quelle est sa taille réelle (pas celle annoncée) ?
  const fileName = path.slice(folder.length);
  const { data: listed } = await supabaseAdmin.storage.from('documents').list(user.id, { search: fileName, limit: 1 });
  const stored = listed?.find((f) => f.name === fileName);
  if (!stored) return { error: 'Fichier introuvable : réessaie l’import.' };
  const taille = Number((stored.metadata as any)?.size || 0);
  if (!taille || taille > MAX_PDF_BYTES) {
    await supabaseAdmin.storage.from('documents').remove([path]).catch(() => {});
    return { error: taille ? 'Le fichier est trop volumineux (max 25 Mo).' : 'Fichier vide ou illisible.' };
  }

  // Les rattachements doivent appartenir à l'utilisateur.
  let matiereId = input.matiereId || null;
  const coursId = input.coursId || null;
  const chapitreId = input.chapitreId || null;
  if (matiereId) {
    const { data } = await supabaseAdmin.from('matieres').select('id').eq('id', matiereId).eq('user_id', user.id).maybeSingle();
    if (!data) return { error: 'Matière introuvable.' };
  }
  if (coursId) {
    const { data: c } = await supabaseAdmin.from('cours').select('matiere_id').eq('id', coursId).maybeSingle();
    const { data: m } = c
      ? await supabaseAdmin.from('matieres').select('id').eq('id', c.matiere_id).eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!m || !c) return { error: 'Cours introuvable.' };
    // La matière d'un PDF rangé dans un cours est TOUJOURS celle du cours (jamais celle envoyée
    // par le navigateur) : sinon les compteurs et le rangement de la matière seraient faux.
    matiereId = c.matiere_id;
  }
  if (chapitreId) {
    const { data: ch } = await supabaseAdmin.from('chapitres').select('cours_id').eq('id', chapitreId).maybeSingle();
    const { data: c } = ch ? await supabaseAdmin.from('cours').select('matiere_id').eq('id', ch.cours_id).maybeSingle() : { data: null };
    const { data: m } = c
      ? await supabaseAdmin.from('matieres').select('id').eq('id', c.matiere_id).eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!m) return { error: 'Chapitre introuvable.' };
  }

  // URL au format Storage (compatible avec l'existant) ; jamais affichée telle quelle : les
  // écrans la remplacent par une URL signée (lib/storage.ts).
  const url = supabaseAdmin.storage.from('documents').getPublicUrl(path).data.publicUrl;
  const nom = String(input.nom || 'Document.pdf').slice(0, 200);

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .insert({
      nom, type: 'pdf', url, url_fichier: url, taille,
      chapitre_id: chapitreId, matiere_id: matiereId, cours_id: coursId, user_id: user.id,
    })
    .select('id')
    .single();

  if (error || !doc) {
    console.error('[documents] enregistrement impossible:', error?.message);
    await supabaseAdmin.storage.from('documents').remove([path]).catch(() => {});
    return { error: "Enregistrement du document impossible. Réessaie." };
  }
  return { success: true, documentId: doc.id };
}

export async function deleteDocument(documentId: string, _clientUrl?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  try {
    // 1. VÉRIFICATION STRICTE CÔTÉ SERVEUR (Protection IDOR)
    // On ne fait JAMAIS confiance à _clientUrl envoyé par le frontend.
    // On va chercher le document correspondant à cet ID ET à cet utilisateur.
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('url, url_fichier')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    // Absent ou pas à l'utilisateur : rien à supprimer. Succès idempotent (un double clic
    // n'affiche pas d'erreur) ; on ne révèle pas si le document existe chez quelqu'un d'autre.
    if (fetchError || !document) return { success: true };

    // Un PDF publié au catalogue fait vivre le cours de TOUS les étudiants qui l'étudient (Étude
    // guidée, examens) : le supprimer cassait ce cours pour tout le monde. On le refuse tant qu'il
    // n'a pas été retiré du catalogue.
    const { data: cours } = await supabaseAdmin.from('etude_cours').select('id').eq('pdf_id', documentId).maybeSingle();
    if (cours) {
      const { data: publie } = await supabaseAdmin.from('catalog_courses').select('id').eq('etude_cours_id', cours.id).eq('actif', true).limit(1);
      if (publie?.length) return { error: 'Ce cours est publié au catalogue : retire-le d’abord du catalogue (Administration > Catalogue), puis supprime-le.' };
    }

    // 2. Supprimer la ligne d'abord, puis le fichier (voir removeOwnedFiles). Avant, le fichier
    // était retiré par le client de l'étudiant, ce que le bucket privé peut refuser en silence.
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id); // Double sécurité

    if (dbError) throw new Error(dbError.message);

    await removeOwnedFiles(user.id, [document.url_fichier, document.url]);
    revalidatePath('/app/matieres', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[documents] suppression impossible:', err instanceof Error ? err.message : err);
    return { error: 'Suppression impossible. Réessaie.' };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Range un document de l'étudiant dans un cours de la même matière.
 *
 * Sert aux PDF importés avant que le cours soit enregistré à l'import (cours_id vide) : ils
 * n'apparaissent plus dans tous les cours de la matière, l'étudiant les range lui-même.
 * Aucune policy UPDATE n'existe sur `documents` (volontaire, phase B) : l'écriture passe par
 * le service role, APRÈS avoir vérifié avec le client de l'étudiant (RLS) que le document,
 * le cours et la matière lui appartiennent.
 */
export async function assignDocumentToCours(documentId: string, coursId: string) {
  if (!UUID_RE.test(documentId) || !UUID_RE.test(coursId)) return { error: 'Requête invalide.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  const [{ data: doc }, { data: cours }] = await Promise.all([
    supabase.from('documents').select('id, matiere_id, cours_id').eq('id', documentId).eq('user_id', user.id).maybeSingle(),
    supabase.from('cours').select('id, matiere_id, matieres!inner(user_id)').eq('id', coursId).eq('matieres.user_id', user.id).maybeSingle(),
  ]);
  if (!doc || !cours) return { error: 'Document ou cours introuvable.' };
  if (doc.cours_id === cours.id) return { success: true }; // Déjà rangé : idempotent.
  if (doc.matiere_id !== cours.matiere_id) return { error: 'Ce document appartient à une autre matière.' };

  // Condition sur l'état lu : si un autre onglet l'a rangé entre-temps, rien n'est écrasé.
  const base = supabaseAdmin.from('documents').update({ cours_id: cours.id }).eq('id', doc.id).eq('user_id', user.id);
  const { data: updated, error } = await (doc.cours_id ? base.eq('cours_id', doc.cours_id) : base.is('cours_id', null)).select('id');
  if (error) return { error: 'Rangement impossible. Réessaie.' };
  if (!updated?.length) return { error: 'Ce document vient d’être déplacé ailleurs. Recharge la page.' };

  revalidatePath(`/app/matieres/${cours.matiere_id}`, 'layout');
  return { success: true };
}
