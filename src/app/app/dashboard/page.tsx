import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import styles from './dashboard.module.css';

import DashboardManager from './DashboardManager';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Récupération des vraies données
  const [
    { count: matieresCount },
    { count: coursCount },
    { count: documentsCount },
    { count: flashcardsCount },
    { count: evaluationsCount },
    { count: redactionsCount },
    { data: objectifs }
  ] = await Promise.all([
    supabase.from('matieres').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('cours').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('redactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('objectifs').select('*').eq('user_id', user.id).limit(3)
  ]);

  const stats = {
    matieresCount: matieresCount || 0,
    coursCount: coursCount || 0,
    documentsCount: documentsCount || 0,
    evaluationsCount: evaluationsCount || 0,
    redactionsCount: redactionsCount || 0,
  };

  return (
    <DashboardManager 
      user={user} 
      stats={stats} 
      objectifs={objectifs || []} 
      flashcardsCount={flashcardsCount || 0} 
    />
  );
}

