import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ChapitreManager from './ChapitreManager';

export default async function CoursDetailsPage({ params }: { params: { matiereId: string, coursId: string } }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  // 3. Récupérer les chapitres
  const { data: chapitres } = await supabase
    .from('chapitres')
    .select('*')
    .eq('cours_id', cours.id)
    .order('created_at', { ascending: true });

  // 4. Récupérer les documents liés à cette matière
  const { data: docs } = await supabase
    .from('documents')
    .select('*')
    .eq('matiere_id', matiere.id);
  const documents = docs || [];

  return (
    <div style={{ padding: 'var(--spacing-large) 0', height: '100%' }}>
      <ChapitreManager matiere={matiere} cours={cours} initialChapitres={chapitres || []} initialDocuments={documents} />
    </div>
  );
}
