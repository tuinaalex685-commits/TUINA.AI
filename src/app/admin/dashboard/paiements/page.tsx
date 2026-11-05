import React from 'react';
import { listPremiumOrders } from '@/app/actions/adminPaiement';
import PaiementsManager from './PaiementsManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paiements | Administration SJP' };

export default async function AdminPaiementsPage() {
  const { orders, error } = await listPremiumOrders();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Paiements Premium</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Achats et renouvellements payés en ligne (SasPay). Les codes restent gérés dans « Codes d’accès ».
        </p>
      </header>
      {error ? <p style={{ color: 'var(--color-error)' }}>{error}</p> : <PaiementsManager orders={orders ?? []} />}
    </div>
  );
}
