"use server";

import { createClient } from '@/lib/supabase/server';

export async function deleteDocument(documentId: string, url_fichier: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  try {
    // 1. Extraire le chemin du fichier depuis l'URL publique
    // L'URL publique ressemble à : https://[projet].supabase.co/storage/v1/object/public/documents/[userId]/[filename]
    const urlParts = url_fichier.split('/public/documents/');
    if (urlParts.length !== 2) throw new Error("URL de fichier invalide");
    const filePath = urlParts[1];

    // 2. Supprimer du Bucket Storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      // On continue quand même pour supprimer l'entrée DB si le fichier physique est introuvable
    }

    // 3. Supprimer de la base de données
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id); // Sécurité supplémentaire

    if (dbError) throw new Error(dbError.message);

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
