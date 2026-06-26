import React from 'react';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import BibliothequeManager from './BibliothequeManager';

export default async function BibliothequePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('date_import', { ascending: false });

  if (docsError) {
    console.error("Erreur chargement documents:", docsError);
  }

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <BibliothequeManager 
        initialDocuments={documents || []} 
      />
    </div>
  );
}
