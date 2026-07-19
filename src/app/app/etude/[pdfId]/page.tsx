import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import EtudeEngine from '@/components/etude/EtudeEngine';
import UpgradeCourseUI from './UpgradeCourseUI';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Étude en cours | Tuina.ai',
};

export default async function EtudeCoursePage({ params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // SÉCURITÉ : on vérifie que le document appartient bien à l'utilisateur (filtre explicite user_id,
  // indépendant de la RLS). C'est ce qui autorise ensuite la lecture du contenu du cours via le
  // service role — la RLS sur etude_cours/sections/themes bloque les étudiants en lecture, ce qui
  // laissait la page bloquée sur l'écran de génération à 95%.
  const { data: ownedDoc } = await supabaseAdmin
    .from('documents')
    .select('id, intelligence_pedagogique')
    .eq('id', pdfId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ownedDoc) redirect('/app/etude');

  // Lecture du cours via service role (contenu partagé non sensible ; appartenance déjà vérifiée).
  const { data: cours } = await supabaseAdmin
    .from('etude_cours')
    .select('*')
    .eq('pdf_id', pdfId)
    .single();

  if (!cours || cours.statut_generation !== 'pret') {
    // Pass generating flag
    return <EtudeEngine pdfId={pdfId} isGenerating={true} />;
  }

  // Fetch all sections
  const { data: sections } = await supabaseAdmin
    .from('etude_sections')
    .select('*')
    .eq('cours_id', cours.id)
    .order('ordre', { ascending: true });

  // Sécurité anti-écran blanc : si le cours est "prêt" mais n'a aucune section (bug zombie cache ou V1), on l'intercepte.
  if (!sections || sections.length === 0) {
    return <UpgradeCourseUI pdfId={pdfId} />;
  }

  // Fetch all themes for these sections
  const sectionIds = sections?.map(s => s.id) || [];
  const { data: themes } = await supabaseAdmin
    .from('etude_themes')
    .select('*')
    .in('section_id', sectionIds)
    .order('ordre', { ascending: true });

  // 9. Progression persistante : récupérer l'état exact (Couche 2). Filtre user_id explicite.
  const { data: progSections } = await supabaseAdmin
    .from('etude_progression_sections')
    .select('*')
    .eq('user_id', user.id)
    .in('section_id', sectionIds);

  const { data: progThemes } = await supabaseAdmin
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
      pdfId={pdfId}
      coursId={cours.id}
      sections={sections}
      themes={themes}
      intelligence={(ownedDoc as any)?.intelligence_pedagogique || null}
      initialState={{
        sectionIdx: startSectionIdx,
        themeIdx: startThemeIdx,
        step: startStep === 'synthese_vue' ? 'explication' : startStep === 'themes_en_cours' ? 'explication' : startStep
      }}
    />
  );
}
