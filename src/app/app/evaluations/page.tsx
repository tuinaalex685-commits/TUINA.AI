import React from 'react';
import { createClient } from '@/lib/supabase/server';
import EvaluationsManager from './EvaluationsManager';

export default async function EvaluationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: evaluations } = await supabase
    .from('evaluations')
    .select('*, cours(titre)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: cours } = await supabase
    .from('cours')
    .select('*');

  // On mappe pour rajouter un pseudo-titre si nécessaire (ou utiliser le cours.titre)
  const formattedEvaluations = (evaluations || []).map(ev => ({
    ...ev,
    titre: ev.cours ? `Évaluation : ${ev.cours.titre}` : 'Évaluation',
  }));

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <EvaluationsManager initialQuiz={formattedEvaluations} coursList={cours || []} />
    </div>
  );
}
