import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ChapitreManager from './ChapitreManager';
import { getCurrentUser } from '@/lib/viewer';
import { withSignedUrls } from '@/lib/storage';

export default async function CoursDetailsPage({ params }: { params: { matiereId: string, coursId: string } }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  // 1. Récupérer la matière
  const { data: matiere } = await supabase
    .from('matieres')
    .select('*')
    .eq('id', resolvedParams.matiereId)
    .eq('user_id', user.id)
    .single();

  if (!matiere) notFound();

  // 2. Récupérer le cours
  const { data: cours } = await supabase
    .from('cours')
    .select('*')
    .eq('id', resolvedParams.coursId)
    .eq('matiere_id', matiere.id)
    .single();

  if (!cours) notFound();

  // 3 et 4. Chapitres et documents DU COURS, en parallèle. Avant, la page chargeait les
  // documents de toute la MATIÈRE : un PDF importé dans un cours apparaissait dans tous les
  // autres cours de la même matière (et la mise à jour temps réel, elle, filtrait par cours).
  const [{ data: chapitres }, { data: docs }] = await Promise.all([
    supabase.from('chapitres').select('*').eq('cours_id', cours.id).order('created_at', { ascending: true }),
    supabase.from('documents').select('id, nom, taille, url_fichier, date_import, matiere_id, cours_id, chapitre_id').eq('matiere_id', matiere.id)
      // Documents de CE cours, plus les anciens imports faits depuis cette page avant que le
      // cours soit enregistré (cours_id vide). Les PDF d'un autre cours n'apparaissent plus.
      .or(`cours_id.eq.${cours.id},cours_id.is.null`)
      .order('date_import', { ascending: false }),
  ]);
  const documents = await withSignedUrls(docs || []);

  return (
    <div style={{ padding: 'var(--spacing-large) 0', height: '100%' }}>
      <ChapitreManager matiere={matiere} cours={cours} initialChapitres={chapitres || []} initialDocuments={documents} />
    </div>
  );
}
