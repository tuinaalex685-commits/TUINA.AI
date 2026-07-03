import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import EtudeEngine from '@/components/etude/EtudeEngine';

export const metadata = {
  title: 'Étude en cours | Tuina.ai',
};

export default async function EtudeCoursePage({ params }: { params: { pdfId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if course exists in Couche 1
  const { data: cours } = await supabase
    .from('etude_cours')
    .select('*')
    .eq('pdf_id', params.pdfId)
    .single();

  if (!cours || cours.statut_generation !== 'pret') {
    // Pass generating flag
    return <EtudeEngine pdfId={params.pdfId} isGenerating={true} />;
  }

  // Fetch all sections
  const { data: sections } = await supabase
    .from('etude_sections')
    .select('*')
    .eq('cours_id', cours.id)
    .order('ordre', { ascending: true });

  // Fetch all themes for these sections
  const sectionIds = sections?.map(s => s.id) || [];
  const { data: themes } = await supabase
    .from('etude_themes')
    .select('*')
    .in('section_id', sectionIds)
    .order('ordre', { ascending: true });

  // Fetch user progression to resume (Couche 2)
  // For the MVP, we pass the data to EtudeEngine which will manage state.
  // In a full implementation, we'd find exactly the last unfinished theme.

  return (
    <EtudeEngine 
      pdfId={params.pdfId} 
      coursId={cours.id} 
      sections={sections} 
      themes={themes} 
    />
  );
}
