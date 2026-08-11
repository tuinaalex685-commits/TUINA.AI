import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CatalogueList from './CatalogueList';
import AdSlot from '@/components/ads/AdSlot';
import { isPremium } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Catalogue | Tuina.ai',
};

export default async function CataloguePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Le Catalogue est réservé aux comptes Free. Le retirer du menu ne suffit pas :
  // l'URL reste devinable et pourrait être partagée. La redirection ferme la porte
  // côté serveur, sans rien changer aux droits de lecture du catalogue lui-même
  // (un Premium garde l'accès aux cours qu'il aurait déjà commencés).
  if (await isPremium(supabase, user.email)) redirect('/app/dashboard');

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
    <>
      <CatalogueList
        entries={entries || []}
        progressByCours={progressByCours}
      />
      {/* Sous la liste des cours : l'étudiant a vu toute l'offre pédagogique avant la publicité. */}
      <AdSlot placement="catalogue" />
    </>
  );
}
