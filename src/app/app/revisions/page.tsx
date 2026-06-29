import React from 'react';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;


import { createClient } from '@/lib/supabase/server';
import RevisionsManager from './RevisionsManager';

export default async function RevisionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // On récupère uniquement la liste des cours et documents de l'utilisateur
  const { data: cours } = await supabase
    .from('cours')
    .select('id, titre')
    .order('created_at', { ascending: false });

  const { data: documents } = await supabase
    .from('documents')
    .select('id, nom')
    .eq('user_id', user.id)
    .order('date_import', { ascending: false });

  return (
    <div style={{ padding: 'var(--spacing-large) 0', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <RevisionsManager 
        coursList={cours || []} 
        documentsList={documents || []} 
      />
    </div>
  );
}
