import React from 'react';
import { createClient } from '@/lib/supabase/server';
import DashboardManager from './DashboardManager';

export default async function DashboardData({ user }: { user: any }) {
  const supabase = await createClient();

  // On lance toutes les requêtes en parallèle, mais on utilise estimated count si possible
  // ou du moins on les regroupe dans ce Server Component qui est wrappé dans Suspense
  const [
    { count: matieresCount },
    { count: coursCount },
    { count: documentsCount },
    { count: flashcardsCount },
    { count: examensCount },
    { count: redactionsCount },
    { data: objectifs }
  ] = await Promise.all([
    supabase.from('matieres').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('cours').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('examen_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'submitted'),
    supabase.from('redactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('objectifs').select('*').eq('user_id', user.id).limit(3)
  ]);

  const stats = {
    matieresCount: matieresCount || 0,
    coursCount: coursCount || 0,
    documentsCount: documentsCount || 0,
    examensCount: examensCount || 0,
    redactionsCount: redactionsCount || 0,
  };

  // Onboarding : on n'affiche le guide QUE si on lit explicitement onboarding_vu = false.
  // (colonne absente / erreur / pas de ligne → on considère "déjà vu" pour ne rien casser).
  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles').select('onboarding_vu').eq('user_id', user.id).maybeSingle();
  const onboardingSeen = roleErr ? true : (roleRow?.onboarding_vu ?? true);

  return (
    <DashboardManager
      user={user}
      stats={stats}
      objectifs={objectifs || []}
      flashcardsCount={flashcardsCount || 0}
      onboardingSeen={onboardingSeen}
    />
  );
}
