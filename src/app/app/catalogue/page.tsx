import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CatalogueList from './CatalogueList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Catalogue | Tuina.ai',
};

export default async function CataloguePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Lecture publique du catalogue (RLS : authenticated + actif=true) — client normal, pas besoin
  // du service role ici, la policy de catalog_courses gère déjà exactement cet accès.
  const { data: entries } = await supabase
    .from('catalog_courses')
    .select('id, etude_cours_id, titre_affiche, matiere, ordre')
    .eq('actif', true)
    .order('ordre', { ascending: true });

  const coursIds = (entries || []).map(e => e.etude_cours_id);

  // Progression de CET utilisateur sur les cours catalogue (ses propres lignes uniquement,
  // RLS owner-only inchangée) — pour afficher "Nouveau / En cours / Terminé" comme sur Étude Guidée.
  const { data: progressions } = coursIds.length
    ? await supabase
        .from('etude_progression_cours')
        .select('cours_id, statut')
        .eq('user_id', user.id)
        .in('cours_id', coursIds)
    : { data: [] as any[] };

  const progressByCours: Record<string, string> = {};
  (progressions || []).forEach((p: any) => { progressByCours[p.cours_id] = p.statut; });

  return (
    <CatalogueList
      entries={entries || []}
      progressByCours={progressByCours}
    />
  );
}
