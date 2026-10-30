import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ENGINE_VERSION } from '@/lib/etude3/types';
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

  // État réel de l'Étude guidée (parcours v4, enregistré par le serveur), retrouvé par document.
  const { data: cours } = coursIds.length
    ? await supabaseAdmin.from('etude_cours').select('id, pdf_id').in('id', coursIds)
    : { data: [] as { id: string; pdf_id: string }[] };
  const pdfIds = (cours || []).map((c) => c.pdf_id).filter(Boolean);
  const { data: parcours } = pdfIds.length
    ? await supabase.from('etude_parcours').select('document_id, statut, engine_version').eq('user_id', user.id).in('document_id', pdfIds)
    : { data: [] as { document_id: string; statut: string; engine_version: string }[] };
  const statutParPdf = new Map((parcours || []).filter((p) => p.engine_version === ENGINE_VERSION).map((p) => [p.document_id, p.statut]));

  const progressByCours: Record<string, string> = {};
  (cours || []).forEach((c) => { const st = statutParPdf.get(c.pdf_id); if (st) progressByCours[c.id] = st; });

  return (
    <>
      <CatalogueList entries={visibles} progressByCours={progressByCours} niveau={niveau} />
      {/* Sous la liste : l'étudiant a vu toute l'offre pédagogique avant la publicité. */}
      <AdSlot placement="catalogue" />
    </>
  );
}
