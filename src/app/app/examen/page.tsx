import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExamDashboard } from '@/app/actions/examen';
import ExamenManager from './ExamenManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Examen | Tuina.ai' };

export default async function ExamenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const res = await getExamDashboard();
  const items = ('items' in res && res.items ? res.items : []) as React.ComponentProps<typeof ExamenManager>['initialItems'];

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <ExamenManager initialItems={items} />
    </div>
  );
}
