import React from 'react';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import BibliothequeManager from './BibliothequeManager';
import { getCurrentUser } from '@/lib/viewer';
import { withSignedUrls } from '@/lib/storage';
import { isPremium } from '@/lib/plan';
import { FREE_MAX_DOCUMENTS } from '@/lib/quota';

export default async function BibliothequePage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;


  const { data: documents, error: docsError } = await supabase
    .from('documents')
    // Colonnes affichées uniquement : '*' embarquait le texte intégral de chaque PDF
    // (extracted_text) et l'analyse IA, envoyés au navigateur pour rien (latence C-16).
    .select('id, user_id, nom, taille, url_fichier, date_import, matiere_id, cours_id, chapitre_id')
    .eq('user_id', user.id)
    .order('date_import', { ascending: false });

  if (docsError) {
    console.error("Erreur chargement documents:", docsError);
  }

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <BibliothequeManager 
        initialDocuments={await withSignedUrls(documents || [])}
        limite={(await isPremium(supabase, user.email)) ? null : FREE_MAX_DOCUMENTS}
      />
    </div>
  );
}
