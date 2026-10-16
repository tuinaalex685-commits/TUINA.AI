import React from 'react';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import CoursManager from './CoursManager';
import { getCurrentUser } from '@/lib/viewer';
import { withSignedUrls } from '@/lib/storage';

export default async function MatiereDetailsPage({ params }: { params: { matiereId: string } }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  // 1. Récupérer la matière
  const { data: matiere, error: matiereError } = await supabase
    .from('matieres')
    .select('*')
    .eq('id', resolvedParams.matiereId)
    .eq('user_id', user.id)
    .single();

  if (matiereError || !matiere) {
    console.error("ERREUR DE RÉCUPÉRATION MATIÈRE :", { matiereId: resolvedParams.matiereId, userId: user.id, error: matiereError });
    notFound();
  }

  // 2. Récupérer les cours de cette matière
  // 2 et 3. Cours et documents de la matière : lectures indépendantes, faites en parallèle.
  // Colonnes ciblées : '*' sur documents embarquait le texte intégral de chaque PDF (C-16).
  const [{ data: cours }, { data: rawDocuments }] = await Promise.all([
    supabase.from('cours').select('*').eq('matiere_id', matiere.id).order('created_at', { ascending: true }),
    supabase.from('documents').select('id, nom, taille, url_fichier, date_import, matiere_id, cours_id, chapitre_id').eq('matiere_id', matiere.id).order('date_import', { ascending: false }),
  ]);
  const documents = await withSignedUrls(rawDocuments || []);

  return (
    <div style={{ padding: 'var(--spacing-large) 0' }}>
      <CoursManager matiere={matiere} initialCours={cours || []} initialDocuments={documents || []} />
    </div>
  );
}
