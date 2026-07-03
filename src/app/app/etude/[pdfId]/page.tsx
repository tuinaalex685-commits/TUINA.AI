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

  // 9. Progression persistante : récupérer l'état exact (Couche 2)
  const { data: progSections } = await supabase
    .from('etude_progression_sections')
    .select('*')
    .eq('user_id', user.id)
    .in('section_id', sectionIds);

  const { data: progThemes } = await supabase
    .from('etude_progression_themes')
    .select('*')
    .eq('user_id', user.id)
    .in('theme_id', themes?.map(t => t.id) || []);

  // Compute resume point
  let startSectionIdx = 0;
  let startThemeIdx = 0;
  let startStep = 'synthese';

  if (progSections && progSections.length > 0) {
    // Find the furthest section that is not fully completed
    const safeSections = sections || [];
    for (let i = 0; i < safeSections.length; i++) {
      const pSec = progSections.find(p => p.section_id === safeSections[i].id);
      if (!pSec || pSec.etat === 'non_commencee') {
        startSectionIdx = i;
        startStep = 'synthese';
        break;
      }
      
      if (pSec.etat !== 'cloture_reussie') {
        startSectionIdx = i;
        startStep = pSec.etat; // e.g. 'synthese_vue', 'themes_en_cours'
        
        // Find which theme in this section
        const secThemes = themes?.filter(t => t.section_id === safeSections[i].id) || [];
        for (let j = 0; j < secThemes.length; j++) {
          const pTheme = progThemes?.find(p => p.theme_id === secThemes[j].id);
          if (!pTheme || (!pTheme.forme_validee && !pTheme.fond_valide)) {
            startThemeIdx = j;
            startStep = 'explication';
            break;
          } else if (pTheme.forme_validee && !pTheme.fond_valide) {
            startThemeIdx = j;
            startStep = 'cas_pratique';
            break;
          } else if (pTheme.forme_validee && pTheme.fond_valide && j === secThemes.length - 1) {
            // all themes valid -> go to cloture
            startStep = 'cloture';
          }
        }
        break;
      }
      
      // If we reach the last section and it's successful, we show fin_cours
      if (i === safeSections.length - 1 && pSec.etat === 'cloture_reussie') {
        startSectionIdx = i;
        startStep = 'fin_cours';
      }
    }
  }

  return (
    <EtudeEngine 
      pdfId={params.pdfId} 
      coursId={cours.id} 
      sections={sections} 
      themes={themes}
      initialState={{
        sectionIdx: startSectionIdx,
        themeIdx: startThemeIdx,
        step: startStep === 'synthese_vue' ? 'explication' : startStep === 'themes_en_cours' ? 'explication' : startStep
      }}
    />
  );
}
