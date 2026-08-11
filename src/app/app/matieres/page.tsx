import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import PremiumLock from '@/components/premium/PremiumLock';
import MatiereManager from './MatiereManager';

export default async function MatieresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Organiser ses propres matières n'a de sens qu'avec ses propres cours : c'est le
  // prolongement direct de l'import personnel, donc du Premium.
  if (user && !(await isPremium(supabase, user.email))) {
    return (
      <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
        <PremiumLock
          titre="Tes Matières"
          description="Organise tes cours comme ton année universitaire : une matière par enseignement, tes chapitres à l'intérieur, et tout ton travail rangé au même endroit."
          benefices={[
            'Tes propres matières et chapitres, structurés à ta façon',
            'Tes documents rattachés au bon enseignement',
            'Une vue claire de ce qui te reste à travailler',
          ]}
        />
      </div>
    );
  }

  let matieres = [];
  if (user) {
    const { data } = await supabase
      .from('matieres')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (data) matieres = data;
  }

  return <MatiereManager initialMatieres={matieres} />;
}
