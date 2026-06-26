import React from 'react';
import { createClient } from '@/lib/supabase/server';
import ObjectifsManager from './ObjectifsManager';

export default async function ObjectifsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

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
