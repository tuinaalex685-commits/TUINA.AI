import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import EtudeEngine from '@/components/etude/EtudeEngine';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Étude en cours | Tuina.ai',
};

export default async function EtudeCatalogueCoursePage({ params }: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // SÉCURITÉ : contrôle explicite équivalent à celui de /app/etude/[pdfId]/page.tsx, mais sur la
  // publication catalogue plutôt que sur la propriété du document (documents.user_id reste inchangé
  // et n'est jamais utilisé ici — un cours catalogue appartient toujours à son créateur d'origine,
  // jamais à l'utilisateur qui le consulte).
  const { data: entry } = await supabaseAdmin
    .from('catalog_courses')
    .select('id, etude_cours_id, titre_affiche')
    .eq('id', catalogId)
    .eq('actif', true)
    .maybeSingle();

  if (!entry) redirect('/app/catalogue');

  const { data: cours } = await supabaseAdmin
    .from('etude_cours')
    .select('*')
    .eq('id', entry.etude_cours_id)
    .maybeSingle();

  // Un cours catalogue est TOUJOURS publié déjà 'pret' (publishToCatalog le garantit) — s'il ne
  // l'était plus (anomalie), on ne déclenche jamais de génération : on renvoie au catalogue plutôt
  // que d'appeler /api/etude/generate, qui rejetterait de toute façon (l'utilisateur n'est pas
  // propriétaire du document source).
  if (!cours || cours.statut_generation !== 'pret') {
    redirect('/app/catalogue');
  }

  // etude_cours.pdf_id n'est pas une vraie clé étrangère PostgREST : requête séparée, pas de
  // jointure imbriquée (cf. commentaire identique dans actions/catalog.ts).
  const { data: sourceDoc } = await supabaseAdmin
    .from('documents')
    .select('intelligence_pedagogique')
    .eq('id', cours.pdf_id)
    .maybeSingle();

  const { data: sections } = await supabaseAdmin
    .from('etude_sections')
    .select('*')
    .eq('cours_id', cours.id)
    .order('ordre', { ascending: true });

  // Ne devrait jamais arriver (publishToCatalog vérifie la présence de sections avant publication) —
  // filet de sécurité anti-écran-blanc. Pas de bouton d'action ici : contrairement à /app/etude/[pdfId],
  // le visiteur catalogue n'est pas propriétaire du document et ne peut pas déclencher sa régénération.
  if (!sections || sections.length === 0) {
    redirect('/app/catalogue');
  }

  const sectionIds = sections.map(s => s.id);
  const { data: themes } = await supabaseAdmin
    .from('etude_themes')
    .select('*')
    .in('section_id', sectionIds)
    .order('ordre', { ascending: true });

  // Progression propre à CET utilisateur sur ce cours partagé (RLS owner-only inchangée, filtre
  // user_id explicite en plus par cohérence avec le reste du code).
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

  // Reprise — logique identique à /app/etude/[pdfId]/page.tsx.
  let startSectionIdx = 0;
  let startThemeIdx = 0;
  let startStep = 'synthese';

  if (progSections && progSections.length > 0) {
    for (let i = 0; i < sections.length; i++) {
      const pSec = progSections.find(p => p.section_id === sections[i].id);
      if (!pSec || pSec.etat === 'non_commencee') {
        startSectionIdx = i;
        startStep = 'synthese';
        break;
      }

      if (pSec.etat !== 'cloture_reussie') {
        startSectionIdx = i;
        startStep = pSec.etat;

        const secThemes = themes?.filter(t => t.section_id === sections[i].id) || [];
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
            startStep = 'cloture';
          }
        }
        break;
      }

      if (i === sections.length - 1 && pSec.etat === 'cloture_reussie') {
        startSectionIdx = i;
        startStep = 'fin_cours';
      }
    }
  }

  return (
    <EtudeEngine
      pdfId={cours.pdf_id}
      coursId={cours.id}
      sections={sections}
      themes={themes}
      intelligence={(cours as any)?.documents?.intelligence_pedagogique || null}
      initialState={{
        sectionIdx: startSectionIdx,
        themeIdx: startThemeIdx,
        step: startStep === 'synthese_vue' ? 'explication' : startStep === 'themes_en_cours' ? 'explication' : startStep
      }}
    />
  );
}
