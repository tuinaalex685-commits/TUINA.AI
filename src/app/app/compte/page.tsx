import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exactEmailPattern } from '@/lib/email';
import { isCodeCurrentlyActive } from '@/lib/plan';
import CompteManager from './CompteManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon compte | SJP' };

export default async function ComptePage({ searchParams }: { searchParams: Promise<{ motdepasse?: string }> }) {
  const { motdepasse } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  // Abonnement en cours : code actif le plus récent rattaché à cet email.
  const { data: codes } = await supabaseAdmin
    .from('access_codes').select('*').ilike('email', exactEmailPattern(user.email));
  const live = (codes || []).filter((c: any) => isCodeCurrentlyActive(c));
  const expiresAt = live
    .map((c: any) => c.expires_at as string | null)
    .filter((d): d is string => !!d)
    .sort()
    .pop() || null;

  return (
    <CompteManager
      email={user.email}
      premium={live.length > 0}
      premiumUntil={expiresAt}
      askPasswordChange={motdepasse === '1'}
    />
  );
}
