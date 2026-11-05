import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listCatalogDocuments } from '@/lib/access';
import { getCurrentUser } from '@/lib/viewer';
import { COMPARTIMENT_BY_SLUG, COMPARTIMENTS, type CompartimentSlug } from '@/lib/redaction/compartiments';
import RedactionHome, { type CopyItem, type CourseOption } from './RedactionHome';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rédaction | SJP' };

/**
 * Accueil de la Rédaction : trois compartiments, les copies de l'étudiant, et les cours
 * disponibles comme source de sujets. Trois lectures en parallèle, colonnes ciblées
 * (jamais le texte des copies ni des PDF), au plus 200 copies.
 */
export default async function RedactionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createClient();


  const { type } = await searchParams;
  const active: CompartimentSlug = COMPARTIMENT_BY_SLUG.has(type as CompartimentSlug) ? (type as CompartimentSlug) : 'cas-pratique';

  const [{ data: copies }, { data: ownDocs }, catalog] = await Promise.all([
    supabase
      .from('redactions')
      .select('id, type, titre, sujet, statut, date_creation, updated_at, note:rapport_analyse->note, redaction_versions(count)')
      .eq('user_id', user.id)
      .order('date_creation', { ascending: false })
      .limit(200),
    supabase.from('documents').select('id, nom').eq('user_id', user.id).order('date_import', { ascending: false }).limit(200),
    listCatalogDocuments(supabaseAdmin, user.id).catch(() => []),
  ]);

  const items: CopyItem[] = (copies || []).map((c: any) => ({
    id: c.id,
    type: c.type,
    sujet: c.titre || c.sujet || 'Sans titre',
    statut: c.statut || 'brouillon',
    date: c.updated_at || c.date_creation,
    note: typeof c.note === 'number' ? c.note : null,
    versions: c.redaction_versions?.[0]?.count ?? 0,
  }));

  const courses: CourseOption[] = [
    ...(ownDocs || []).map((d) => ({ id: d.id as string, label: String(d.nom).replace(/\.pdf$/i, ''), groupe: 'Mes cours' as const })),
    ...catalog.map((c) => ({ id: c.documentId, label: c.titre, groupe: 'Catalogue SJP' as const })),
  ];

  return <RedactionHome active={active} copies={items} courses={courses} compartiments={COMPARTIMENTS.map((c) => c.slug)} />;
}
