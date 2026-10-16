import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/viewer';
import CoursManager from './CoursManager';

export const dynamic = 'force-dynamic';

/**
 * Une matière : ses cours (intercalaires) avec leur nombre de PDF.
 * Trois lectures en parallèle ; le nombre de PDF vient d'un comptage côté base
 * (`documents(count)`), pas du chargement des documents eux-mêmes.
 */
export default async function MatiereDetailsPage({ params }: { params: Promise<{ matiereId: string }> }) {
  const { matiereId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createClient();

  const [{ data: matiere }, { data: cours }, { count: looseCount }] = await Promise.all([
    supabase.from('matieres').select('id, titre, description').eq('id', matiereId).eq('user_id', user.id).maybeSingle(),
    supabase.from('cours').select('id, titre, created_at, documents(count)').eq('matiere_id', matiereId).order('created_at', { ascending: true }),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('matiere_id', matiereId).is('cours_id', null).eq('user_id', user.id),
  ]);
  if (!matiere) notFound();

  const coursList = (cours || []).map((c) => ({
    id: c.id as string,
    titre: c.titre as string,
    created_at: c.created_at as string,
    nbDocuments: (c.documents as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return <CoursManager matiere={matiere} initialCours={coursList} looseCount={looseCount ?? 0} />;
}
