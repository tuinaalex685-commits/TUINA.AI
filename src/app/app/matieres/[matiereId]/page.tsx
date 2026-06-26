import React from 'react';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import CoursManager from './CoursManager';

export default async function MatiereDetailsPage({ params }: { params: { matiereId: string } }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
  const { data: cours } = await supabase
    .from('cours')
    .select('*')
    .eq('matiere_id', matiere.id)
    .order('created_at', { ascending: true });

  // 3. Récupérer les documents de cette matière
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('matiere_id', matiere.id)
    .order('created_at', { ascending: false });

  return (
    <div style={{ padding: 'var(--spacing-large) 0' }}>
      <CoursManager matiere={matiere} initialCours={cours || []} initialDocuments={documents || []} />
    </div>
  );
}
