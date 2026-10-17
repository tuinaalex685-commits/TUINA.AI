import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import { getCurrentUser } from '@/lib/viewer';
import { REDACTION_DAILY_LIMIT } from '@/lib/redaction/compartiments';
import CopyWorkspace, { type VersionItem } from './CopyWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma copie | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une copie : l'énoncé, l'espace de rédaction ou la correction, et l'historique des versions.
 * Lectures avec le client de l'étudiant (RLS) + filtre user_id explicite : une copie
 * d'un autre étudiant donne un 404, jamais un contenu.
 */
export default async function CopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createClient();
  if (!(await isPremium(supabase, user.email))) redirect('/app/redaction');

  const jour = new Date().toISOString().slice(0, 10);
  const [{ data: red }, { data: versions }, { data: usage }] = await Promise.all([
    supabase.from('redactions').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('redaction_versions').select('*').eq('redaction_id', id).order('date_soumission', { ascending: false }).limit(30),
    supabase.from('free_daily_usage').select('count').eq('user_id', user.id).eq('jour', jour).eq('feature', 'redaction').maybeSingle(),
  ]);
  if (!red) notFound();

  // Correction en cours : l'écran suit ce job (et relance le worker s'il s'est arrêté).
  let jobId: string | null = null;
  if (red.statut === 'en_cours') {
    const { data: job } = await supabaseAdmin.from('ai_jobs').select('id')
      .eq('type', 'redaction').eq('user_id', user.id).eq('payload->>redactionId', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    jobId = (job?.id as string) ?? null;
  }

  let courseName: string | null = null;
  if (red.document_id) {
    const { data: doc } = await supabase.from('documents').select('nom').eq('id', red.document_id).maybeSingle();
    courseName = doc?.nom ? String(doc.nom).replace(/\.pdf$/i, '') : 'Cours du catalogue SJP';
  }

  const items: VersionItem[] = (versions || []).map((v: any, i: number, all: any[]) => ({
    id: v.id,
    numero: v.numero ?? all.length - i,
    date: v.date_soumission,
    note: typeof v.note === 'number' ? v.note : (typeof v.score === 'number' ? v.score : null),
    rapport: v.rapport ?? null,
    contenu: v.contenu ?? '',
  }));

  return (
    <CopyWorkspace
      // Nouvelle version corrigée ou changement d'état : composant remonté, donc la version
      // affichée par défaut est bien la plus récente.
      key={`${items[0]?.id ?? 'aucune'}-${red.statut}`}
      copy={{
        id: red.id,
        type: red.type,
        sujet: red.sujet || red.titre || '',
        enonce: red.enonce ?? null,
        contenu: red.contenu ?? '',
        statut: red.statut || 'brouillon',
        rapport: red.rapport_analyse ?? null,
        courseName,
        lastError: red.last_error ?? null,
      }}
      versions={items}
      remaining={Math.max(0, REDACTION_DAILY_LIMIT - (usage?.count || 0))}
      jobId={jobId}
    />
  );
}
