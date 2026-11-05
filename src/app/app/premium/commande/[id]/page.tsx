import React from 'react';
import OrderTracker from './OrderTracker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon paiement Premium | SJP' };

/**
 * Page de retour après SasPay. Y arriver ne prouve rien : l'état affiché vient
 * exclusivement de la vérification serveur (refreshMyOrder → SasPay).
 */
export default async function CommandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderTracker orderId={id} />;
}
