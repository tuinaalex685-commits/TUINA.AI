import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isPremium } from '@/lib/plan';
import EtudeList from './EtudeList';
import { getCurrentUser } from '@/lib/viewer';

export const metadata = {
  title: 'Étude Guidée | SJP',
};

export default async function EtudeListPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Pour un compte Free, le Catalogue EST l'Étude Guidée : mêmes fonctionnalités
  // pédagogiques, appliquées aux cours que SJP publie au lieu des siens. On redirige
  // plutôt que d'afficher un verrou — sinon l'étudiant croirait qu'il lui manque une
  // fonctionnalité qu'il possède déjà, sous un autre nom.
  if (!(await isPremium(supabase, user.email))) {
    redirect('/app/catalogue');
  }

  // 1. Récupérer tous les documents de l'étudiant
  const { data: documents } = await supabase
    .from('documents')
    .select('id, nom, date_import')
    .eq('user_id', user.id)
    .order('date_import', { ascending: false });

  // 2. Parcours v3 de l'étudiant (statut fiable, enregistré par le serveur).
  const { data: parcours } = await supabase
    .from('etude_parcours')
    .select('document_id, statut')
    .eq('user_id', user.id);

  const progressMapObj: Record<string, { statut: string }> = {};
  for (const p of parcours || []) progressMapObj[p.document_id as string] = { statut: p.statut as string };

  return (
    <EtudeList 
      documents={documents || []} 
      progressByPdf={progressMapObj} 
    />
  );
}
