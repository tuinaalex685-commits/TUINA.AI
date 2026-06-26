import React from 'react';
import { createClient } from '@/lib/supabase/server';
import RedactionManager from './RedactionManager';

export default async function RedactionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: redactions } = await supabase
    .from('redactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <RedactionManager initialRedactions={redactions || []} />
    </div>
  );
}
