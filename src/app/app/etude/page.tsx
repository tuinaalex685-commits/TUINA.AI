import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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
