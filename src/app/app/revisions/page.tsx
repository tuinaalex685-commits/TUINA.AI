import React from 'react';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;


import { createClient } from '@/lib/supabase/server';
import { getRevisionSources } from '@/app/actions/revision';
import { getDailyUsage } from '@/lib/quota';
import { FREE_LIMITS } from '@/lib/quota';
import RevisionsManager from './RevisionsManager';

export default async function RevisionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Cours "classiques" (matières saisies à la main) : inchangé, RLS owner-only.
  const { data: cours } = await supabase
    .from('cours')
    .select('id, titre')
    .order('created_at', { ascending: false });

  // Documents personnels + cours du catalogue. C'est ce second groupe qui permet à un
  // compte Free de réviser alors qu'il ne possède aucun document depuis que l'import
  // est passé en Premium.
  const sourcesRes = await getRevisionSources();
  const documentSources = 'sources' in sourcesRes ? sourcesRes.sources : [];
  const premium = 'premium' in sourcesRes ? sourcesRes.premium : false;

  const usage = premium ? null : await getDailyUsage(user.id);

  return (
    <div style={{ padding: 'var(--spacing-large) 0', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <RevisionsManager
        coursList={cours || []}
        documentSources={documentSources}
        premium={premium}
        revisionsUsed={usage?.revision ?? 0}
        revisionsQuota={FREE_LIMITS.revision}
      />
    </div>
  );
}
