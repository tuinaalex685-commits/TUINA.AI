import React from 'react';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import PremiumLock from '@/components/premium/PremiumLock';
import BibliothequeManager from './BibliothequeManager';
import { getCurrentUser } from '@/lib/viewer';
import { withSignedUrls } from '@/lib/storage';

export default async function BibliothequePage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  // La Bibliothèque est la vitrine des documents importés. Sans import personnel,
  // elle serait toujours vide : autant présenter ce qu'elle apporte.
  if (!(await isPremium(supabase, user.email))) {
    return (
      <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
        <PremiumLock
          titre="Ta Bibliothèque"
          description="Importe tes propres PDF — polycopiés, prises de notes, annales — et retrouve-les analysés, découpés en thèmes et prêts à travailler."
          benefices={[
            'Tes propres documents importés dans SJP',
            "Une Étude Guidée générée à partir de TON cours, pas d'un cours générique",
            'Examens et flashcards produits sur ton contenu réel',
          ]}
        />
      </div>
    );
  }

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
      />
    </div>
  );
}
