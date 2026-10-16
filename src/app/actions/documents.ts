"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';

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
  const matiereId = input.matiereId || null;
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
    if (!m) return { error: 'Cours introuvable.' };
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
      .select('url')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !document) {
      // Le document n'existe pas ou n'appartient pas à l'utilisateur
      throw new Error("Accès refusé ou document introuvable.");
    }

    // 2. Extraire le chemin du fichier depuis l'URL de la BDD
    const urlParts = document.url.split('/public/documents/');
    if (urlParts.length === 2) {
      const filePath = urlParts[1];
      
      // 3. Supprimer du Bucket Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([filePath]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
      }
    }

    // 4. Supprimer de la base de données
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id); // Double sécurité

    if (dbError) throw new Error(dbError.message);

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
