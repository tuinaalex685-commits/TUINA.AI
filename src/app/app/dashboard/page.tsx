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

  // Récupération des vraies données (Matières, Cours, Chapitres)
  const [{ count: matieresCount }, { count: coursCount }, { count: chapitresCount }, { count: documentsCount }] = await Promise.all([
    supabase.from('matieres').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('cours').select('*', { count: 'exact', head: true }), // Pas de user_id direct
    supabase.from('chapitres').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  // Récupération des objectifs, flashcards, etc (Nécessite les nouvelles tables)
  let objectifs = [];
  let flashcardsCount = 0;
  
  try {
    const objRes = await supabase.from('objectifs').select('*').eq('user_id', user.id).limit(3);
    if (objRes.data) objectifs = objRes.data;

    const flashRes = await supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('statut', 'validated');
    if (flashRes.count) flashcardsCount = flashRes.count;
  } catch (e) {
    // Tables not created yet
  }

  const stats = {
    matieresCount,
    coursCount,
    chapitresCount,
    documentsCount
  };

  return (
    <DashboardManager 
      user={user} 
      stats={stats} 
      objectifs={objectifs} 
      flashcardsCount={flashcardsCount} 
    />
  );
}
