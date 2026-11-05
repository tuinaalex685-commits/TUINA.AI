import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeEmail } from '@/lib/email';
import { getPremiumSituation, latestOrderFor, syncOrder, type PremiumSituation } from '@/lib/premiumPayment';
import PremiumOffer from './PremiumOffer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SJP Premium | SJP' };

export default async function PremiumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  // Une commande en cours est revérifiée côté serveur à chaque visite (filet de sécurité du webhook).
  let order = await latestOrderFor(user.id);
  if (order) order = await syncOrder(order).catch(() => order);

  let situation: PremiumSituation | null = null;
  try {
    situation = await getPremiumSituation(normalizeEmail(user.email));
  } catch (e) {
    console.error('[premium] situation:', (e as Error).message);
  }

  const openOrder = order && ['created', 'pending', 'failed', 'needs_review'].includes(order.status)
    ? { id: order.id, status: order.status }
    : null;

  return <PremiumOffer situation={situation} openOrder={openOrder} />;
}
