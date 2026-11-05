"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { recheckOpenPremiumOrders, recheckPremiumOrder, resolvePremiumOrder, type AdminOrderRow } from '@/app/actions/adminPaiement';
import { formatDate } from '@/lib/format';
import styles from './paiements.module.css';

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'warn' | 'bad' | 'mute' }> = {
  created: { label: 'Commande créée', tone: 'mute' },
  pending: { label: 'Paiement en attente', tone: 'wait' },
  fulfilled: { label: 'Paiement confirmé', tone: 'ok' },
  failed: { label: 'Paiement échoué', tone: 'bad' },
  expired: { label: 'Abandonné', tone: 'mute' },
  needs_review: { label: 'Intervention nécessaire', tone: 'warn' },
  resolved: { label: 'Traité à la main', tone: 'ok' },
};
const ACTION: Record<string, string> = { assigned: 'Code attribué', reactivated: 'Code réactivé', extended: 'Abonnement prolongé' };

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'needs_review', label: 'À traiter' },
  { key: 'fulfilled', label: 'Confirmés' },
  { key: 'open', label: 'En attente' },
  { key: 'failed', label: 'Échoués / abandonnés' },
] as const;

export default function PaiementsManager({ orders }: { orders: AdminOrderRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'open') return o.status === 'created' || o.status === 'pending';
    if (filter === 'failed') return o.status === 'failed' || o.status === 'expired';
    if (filter === 'fulfilled') return o.status === 'fulfilled' || o.status === 'resolved';
    return o.status === filter;
  }), [orders, filter]);

  const toReview = orders.filter((o) => o.status === 'needs_review').length;
  const paidTotal = orders.filter((o) => o.status === 'fulfilled').reduce((s, o) => s + Number(o.amount), 0);

  const recheck = async (id: string) => {
    setBusy(id);
    const res = await recheckPremiumOrder(id);
    setBusy(null);
    if (res.error) toast.error(res.error); else toast.success('Commande revérifiée');
    router.refresh();
  };
  const recheckAll = async () => {
    setBusy('all');
    const res = await recheckOpenPremiumOrders();
    setBusy(null);
    if (res.error) toast.error(res.error); else toast.success(`${res.count} commande(s) revérifiée(s)`);
    router.refresh();
  };
  const resolve = async (id: string) => {
    const note = window.prompt('Qu’as-tu fait pour cet étudiant ? (ex. code réactivé à la main)');
    if (!note) return;
    setBusy(id);
    const res = await resolvePremiumOrder(id, note);
    setBusy(null);
    if (res.error) toast.error(res.error); else toast.success('Commande clôturée');
    router.refresh();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <p><strong>{toReview}</strong> à traiter</p>
        <p><strong>{paidTotal.toLocaleString('fr-FR')} FCFA</strong> confirmés (affichés)</p>
        <button type="button" className={styles.btn} onClick={recheckAll} disabled={busy !== null}>
          <RefreshCw size={16} aria-hidden /> {busy === 'all' ? 'Vérification…' : 'Revérifier les paiements en attente'}
        </button>
      </div>

      <div className={styles.filters} role="tablist" aria-label="Filtrer">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
            className={`${styles.filter} ${filter === f.key ? styles.filterOn : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className={styles.empty}>Aucun paiement dans cette catégorie.</p>
      ) : (
        <ul className={styles.list}>
          {list.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, tone: 'mute' as const };
            return (
              <li key={o.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.email}>{o.email}</span>
                  <span className={`${styles.pill} ${styles[st.tone]}`}>{st.label}</span>
                </div>
                <p className={styles.meta}>
                  {o.kind === 'renewal' ? 'Renouvellement' : 'Premier achat'} · {Number(o.amount).toLocaleString('fr-FR')} {o.currency} · {formatDate(o.created_at)}
                  {o.transaction_reference && <> · réf. <code>{o.transaction_reference}</code></>}
                </p>
                {(o.code_action || o.code) && (
                  <p className={styles.meta}>
                    {o.code_action ? ACTION[o.code_action] : ''}{o.code && <> : <code>{o.code}</code></>}
                    {o.premium_until && <> · jusqu’au {formatDate(o.premium_until)}</>}
                  </p>
                )}
                {o.review_reason && <p className={styles.reason}>{o.review_reason}</p>}
                {['created', 'pending', 'failed', 'needs_review'].includes(o.status) && (
                  <div className={styles.actions}>
                    <button type="button" className={styles.btn} onClick={() => recheck(o.id)} disabled={busy !== null}>
                      {busy === o.id ? 'Vérification…' : o.status === 'needs_review' ? 'Réessayer l’attribution' : 'Revérifier'}
                    </button>
                    {o.status === 'needs_review' && (
                      <button type="button" className={styles.btnGhost} onClick={() => resolve(o.id)} disabled={busy !== null}>
                        Marquer comme traité
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
