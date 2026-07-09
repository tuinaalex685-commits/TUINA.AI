import React from 'react';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;


import { createClient } from '@/lib/supabase/server';
import EvaluationsManager from './EvaluationsManager';

export default async function EvaluationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: evaluations } = await supabase
    .from('evaluations')
    .select('id, type, meta_type, score, total_questions, created_at, document_id, cours(titre)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: documents } = await supabase
    .from('documents')
    .select('id, nom')
    .eq('user_id', user.id);

  // On mappe pour rajouter un pseudo-titre si nécessaire
  const formattedEvaluations = (evaluations || []).map(ev => ({
    ...ev,
    titre: ev.cours ? `Évaluation : ${ev.cours.titre}` : 'Évaluation',
  }));
  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <EvaluationsManager initialQuiz={formattedEvaluations} documentList={documents || []} />
    </div>
  );
}
