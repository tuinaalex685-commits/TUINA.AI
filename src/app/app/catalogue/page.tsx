import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CatalogueList from './CatalogueList';
import AdSlot from '@/components/ads/AdSlot';
import { isPremium } from '@/lib/plan';
import { getCurrentUser } from '@/lib/viewer';
import { getUserNiveau, catalogVisibleFor } from '@/lib/profile';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Catalogue | SJP',
};

export default async function CataloguePage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Le Catalogue est la vitrine du plan gratuit : un Premium travaille sur ses propres cours.
  if (await isPremium(supabase, user.email)) redirect('/app/dashboard');

  const [{ data: entries }, niveau] = await Promise.all([
    supabase
      .from('catalog_courses')
      .select('id, etude_cours_id, titre_affiche, matiere, ordre, niveau')
      .eq('actif', true)
      .order('ordre', { ascending: true }),
    getUserNiveau(user.id),
  ]);

  // Filtre par niveau, appliqué côté serveur (l'ouverture directe d'un cours est aussi contrôlée).
  const visibles = (entries || []).filter((e) => catalogVisibleFor(e.niveau, niveau));
  const coursIds = visibles.map((e) => e.etude_cours_id);

  const { data: progressions } = coursIds.length
    ? await supabase
        .from('etude_progression_cours')
        .select('cours_id, statut')
        .eq('user_id', user.id)
        .in('cours_id', coursIds)
    : { data: [] as { cours_id: string; statut: string }[] };

  const progressByCours: Record<string, string> = {};
  (progressions || []).forEach((p) => { progressByCours[p.cours_id] = p.statut; });

  return (
    <>
      <CatalogueList entries={visibles} progressByCours={progressByCours} niveau={niveau} />
      {/* Sous la liste : l'étudiant a vu toute l'offre pédagogique avant la publicité. */}
      <AdSlot placement="catalogue" />
    </>
  );
}
