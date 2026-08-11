import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import PremiumLock from '@/components/premium/PremiumLock';
import ObjectifsManager from './ObjectifsManager';

export default async function ObjectifsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  if (!(await isPremium(supabase, user.email))) {
    return (
      <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
        <PremiumLock
          titre="Les Objectifs"
          description="Fixe-toi des buts précis — chapitres à maîtriser, notes à atteindre, échéances de partiels — et suis ta progression réelle vers chacun d'eux."
          benefices={[
            'Des objectifs chiffrés reliés à ton travail réel dans SJP',
            'Une progression qui se met à jour toute seule',
            'De quoi savoir exactement où tu en es avant les partiels',
          ]}
        />
      </div>
    );
  }

  const { data: objectifs } = await supabase
    .from('objectifs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div style={{ padding: 'var(--spacing-large) 0', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <ObjectifsManager initialObjectifs={objectifs || []} />
    </div>
  );
}
