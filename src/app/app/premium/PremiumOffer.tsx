"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Info, AlertTriangle, MessageCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { startPremiumCheckout } from '@/app/actions/paiement';
import { formatDate } from '@/lib/format';
import { PREMIUM_PRICE_LABEL, whatsappUrl } from '@/lib/premiumOffer';
import type { PremiumSituation } from '@/lib/premiumPayment';
import styles from './premium.module.css';

// Même liste que l'offre de la page d'accueil (components/accueil/Accueil.tsx).
const BENEFITS = [
  'Import de PDF sans limite, bibliothèque et matières',
  'Examens illimités tirés de tes documents',
  'Rédaction sans limite : cas pratique, dissertation, commentaire',
  'Révisions sans limite',
  'Objectifs et progression détaillée',
];

const HELP_MESSAGE = "Bonjour, j'ai besoin d'aide pour mon abonnement SJP Premium.";

interface Props {
  situation: PremiumSituation | null;
  openOrder: { id: string; status: string } | null;
}

export default function PremiumOffer({ situation, openOrder }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);

  const pay = async () => {
    setLoading(true);
    setError(null);
    const res = await startPremiumCheckout();
    if ('url' in res) {
      // Redirection vers la page de paiement SasPay. Revenir ici n'active rien : seule la
      // confirmation vérifiée par le serveur le fait.
      window.location.href = res.url;
      return;
    }
    setLoading(false);
    setError({ message: res.error, reason: res.reason });
  };

  const kind = situation?.kind;
  const isRenewal = kind === 'renewal';
  const isActive = kind === 'active';

  const title = isRenewal
    ? 'Réactive ton abonnement Premium'
    : isActive ? 'Prolonge ton abonnement Premium' : 'Passe à SJP Premium';
  const cta = isRenewal || isActive ? 'Payer mon renouvellement mensuel' : 'Payer mon abonnement mensuel';

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>SJP Premium</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>
          {isRenewal
            ? 'Ton compte, tes documents et ta progression sont conservés. Après paiement, ton ancien code est réactivé automatiquement pour 30 jours.'
            : isActive
              ? 'Tu es Premium. Un renouvellement maintenant s’ajoute à tes jours restants : tu ne perds rien.'
              : 'Travaille sur tes propres cours, sans limite. Ton accès s’active automatiquement dès que ton paiement est confirmé.'}
        </p>
      </header>

      {openOrder && openOrder.status !== 'failed' && (
        <div className={`${styles.notice} ${openOrder.status === 'needs_review' ? styles.warning : styles.info}`} role="status">
          {openOrder.status === 'needs_review' ? <AlertTriangle size={18} aria-hidden /> : <Info size={18} aria-hidden />}
          <p>
            {openOrder.status === 'needs_review'
              ? <><strong>Ton dernier paiement est en cours de vérification par l’administrateur.</strong> Tu n’as rien à repayer.</>
              : <><strong>Tu as un paiement en cours.</strong> S’il est déjà fait, son état s’affiche ici.</>}
            {' '}<Link href={`/app/premium/commande/${openOrder.id}`} className={styles.whatsapp}>Voir ce paiement</Link>
          </p>
        </div>
      )}

      {situation?.kind === 'active' && (
        <div className={`${styles.notice} ${styles.success}`} role="status">
          <ShieldCheck size={18} aria-hidden />
          <p>Premium actif jusqu’au <strong>{formatDate(situation.until)}</strong>.</p>
        </div>
      )}
      {situation?.kind === 'renewal' && situation.expiredOn && (
        <div className={`${styles.notice} ${styles.warning}`} role="status">
          <AlertTriangle size={18} aria-hidden />
          <p>Ton abonnement a pris fin le <strong>{formatDate(situation.expiredOn)}</strong>. Tu es en version gratuite.</p>
        </div>
      )}

      <section className={styles.card} aria-labelledby="offre">
        <h2 id="offre" className={styles.kicker}>Abonnement mensuel</h2>
        <div className={styles.priceRow}>
          <span className={styles.price}>{PREMIUM_PRICE_LABEL.replace(' FCFA', '')}</span>
          <span className={styles.priceUnit}>FCFA · 30 jours</span>
        </div>
        <ul className={styles.benefits}>
          {BENEFITS.map((b) => <li key={b}><Check size={18} aria-hidden /> {b}</li>)}
        </ul>
      </section>

      <section className={styles.card} aria-labelledby="comment">
        <h2 id="comment" className={styles.kicker}>Comment ça se passe</h2>
        <ol className={styles.steps}>
          <li className={styles.step}><span><strong>Tu paies</strong>sur la page sécurisée SasPay (Orange Money, Moov Money ou carte).</span></li>
          <li className={styles.step}><span><strong>SJP vérifie</strong>ton paiement directement auprès de SasPay.</span></li>
          <li className={styles.step}><span><strong>Premium s’active</strong>et ton code d’accès s’affiche, prêt à être copié.</span></li>
        </ol>
        <p className={styles.fine}>
          Les frais de l’opérateur (environ 4 à 5 %) s’ajoutent au montant et sont affichés avant validation.
          Orange Money Burkina te demande de composer un code sur ton téléphone : la page de paiement t’explique comment.
        </p>
      </section>

      {error && (
        <div className={`${styles.notice} ${error.reason === 'no_stock' || error.reason === 'blocked' ? styles.warning : styles.danger}`} role="alert">
          <AlertTriangle size={18} aria-hidden />
          <p>
            <strong>{error.message}</strong>
            {(error.reason === 'no_stock' || error.reason === 'blocked' || error.reason === 'limit') && (
              <> Écris à l’administrateur, il te répondra rapidement.</>
            )}
          </p>
        </div>
      )}

      {kind === 'blocked' || kind === 'legacy' || kind === 'admin' ? (
        <div className={`${styles.notice} ${styles.info}`} role="status">
          <Info size={18} aria-hidden />
          <p>
            {kind === 'blocked' && 'Ton accès Premium a été suspendu par l’administrateur. Contacte-le pour en savoir plus.'}
            {kind === 'legacy' && 'Ton accès Premium est déjà actif sans date de fin.'}
            {kind === 'admin' && 'Ton compte administrateur a déjà tous les accès.'}
          </p>
        </div>
      ) : situation === null ? (
        <div className={`${styles.notice} ${styles.danger}`} role="alert">
          <AlertTriangle size={18} aria-hidden />
          <p>Le paiement est momentanément indisponible. Recharge la page dans un instant.</p>
        </div>
      ) : kind === 'first' && situation.kind === 'first' && situation.stock < 1 ? (
        <div className={`${styles.notice} ${styles.warning}`} role="status">
          <AlertTriangle size={18} aria-hidden />
          <p><strong>Les accès Premium sont temporairement indisponibles.</strong> Écris à l’administrateur : il t’ouvre un accès rapidement.</p>
        </div>
      ) : (
        <button type="button" className={styles.primary} onClick={pay} disabled={loading} aria-busy={loading}>
          {loading ? <><span className={styles.spinner} aria-hidden /> Ouverture du paiement…</> : <>{cta} <ArrowRight size={18} aria-hidden /></>}
        </button>
      )}

      <div className={styles.actions}>
        <a href={whatsappUrl(HELP_MESSAGE)} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}>
          <MessageCircle size={16} aria-hidden /> Une question ? Écrire à l’administrateur sur WhatsApp
        </a>
      </div>
      <p className={styles.fine}>
        Tu as reçu un code d’accès de l’administrateur ? <Link href="/app/compte" className={styles.whatsapp}>Saisis-le dans Mon compte</Link>.
      </p>
    </div>
  );
}
