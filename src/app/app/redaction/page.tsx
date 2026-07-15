import React from 'react';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;


import { createClient } from '@/lib/supabase/server';
import { getCoursMasteryBreakdown } from '@/lib/etude/mastery';
import RedactionManager from './RedactionManager';

export default async function RedactionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: redactions }, coursMastery] = await Promise.all([
    supabase
      .from('redactions')
      .select('*, redaction_versions(*)')
      .eq('user_id', user.id)
      .order('date_creation', { ascending: false }),
    // Soft-gate INC.3 : maîtrise par cours Étude déjà travaillé (lecture seule,
    // vue theme_mastery). Sert le sélecteur facultatif + la bannière de reco.
    // Dégrade en [] si la migration/les vues ne sont pas encore en prod.
    getCoursMasteryBreakdown(supabase, user.id).catch(() => []),
  ]);

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <RedactionManager initialRedactions={redactions || []} coursMastery={coursMastery} />
    </div>
  );
}
