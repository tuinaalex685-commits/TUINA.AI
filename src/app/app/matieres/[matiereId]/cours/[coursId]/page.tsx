import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/viewer';
import { withSignedUrls } from '@/lib/storage';
import CoursDocuments from './CoursDocuments';

export const dynamic = 'force-dynamic';

const DOC_COLUMNS = 'id, user_id, nom, taille, url_fichier, date_import, matiere_id, cours_id';

/**
 * Page d'un cours : ses PDF, et seulement les siens.
 *
 * Avant, la requête prenait aussi tous les PDF de la matière sans cours (`cours_id` vide) :
 * les anciens imports apparaissaient alors dans CHAQUE cours de la matière. Ils sont
 * désormais présentés à part (« à ranger »), avec un bouton pour les ranger ici.
 *
 * Les quatre lectures partent en parallèle (un seul aller-retour vers la base) ; le
 * contrôle d'appartenance est fait ensuite. Chaque requête est de toute façon limitée à
 * l'étudiant par la RLS et par un filtre explicite sur user_id.
 */
export default async function CoursDetailsPage({ params }: { params: Promise<{ matiereId: string; coursId: string }> }) {
  const { matiereId, coursId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createClient();

  const [{ data: matiere }, { data: cours }, { data: docs }, { data: loose }] = await Promise.all([
    supabase.from('matieres').select('id, titre').eq('id', matiereId).eq('user_id', user.id).maybeSingle(),
    supabase.from('cours').select('id, titre, matiere_id').eq('id', coursId).eq('matiere_id', matiereId).maybeSingle(),
    supabase.from('documents').select(DOC_COLUMNS).eq('cours_id', coursId).eq('user_id', user.id).order('date_import', { ascending: false }),
    supabase.from('documents').select(DOC_COLUMNS).eq('matiere_id', matiereId).is('cours_id', null).eq('user_id', user.id).order('date_import', { ascending: false }),
  ]);
  if (!matiere || !cours) notFound();

  const [documents, looseDocuments] = await Promise.all([withSignedUrls(docs || []), withSignedUrls(loose || [])]);

  return (
    <CoursDocuments
      matiere={{ id: matiere.id, titre: matiere.titre }}
      cours={{ id: cours.id, titre: cours.titre }}
      documents={documents}
      looseDocuments={looseDocuments}
    />
  );
}
