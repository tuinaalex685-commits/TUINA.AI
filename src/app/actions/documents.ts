"use server";

import { createClient } from '@/lib/supabase/server';

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
