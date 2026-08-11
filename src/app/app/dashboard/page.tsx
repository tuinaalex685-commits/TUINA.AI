import React, { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import DashboardSkeleton from './DashboardSkeleton';
import DashboardData from './DashboardData';
import AdSlot from '@/components/ads/AdSlot';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData user={user} />
      </Suspense>
      {/* En bas de page, après le contenu utile : jamais entre l'étudiant et son travail. */}
      <AdSlot placement="dashboard" />
    </>
  );
}

