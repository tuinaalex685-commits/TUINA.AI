import React from 'react';
import { createClient } from '@/lib/supabase/server';
import MatiereManager from './MatiereManager';

export default async function MatieresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
