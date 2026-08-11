import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isPremium } from '@/lib/plan';
import EtudeList from './EtudeList';

export const metadata = {
  title: 'Étude Guidée | Tuina.ai',
};

export default async function EtudeListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  // 2. Récupérer la progression pour ces documents
  const { data: progressions } = await supabase
    .from('etude_progression_cours')
    .select('cours_id, statut, etude_cours(pdf_id)')
    .eq('user_id', user.id);

  const progressMapObj: Record<string, any> = {};
  if (progressions) {
    progressions.forEach((p: any) => {
      const coursData = Array.isArray(p.etude_cours) ? p.etude_cours[0] : p.etude_cours;
      if (coursData && coursData.pdf_id) {
        progressMapObj[coursData.pdf_id] = {
          statut: p.statut,
          coursId: p.cours_id
        };
      }
    });
  }

  return (
    <EtudeList 
      documents={documents || []} 
      progressByPdf={progressMapObj} 
    />
  );
}
