"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, AlertTriangle, MessageCircle, Clock, XCircle } from 'lucide-react';
import { refreshMyOrder, type OrderView } from '@/app/actions/paiement';
import { formatDate } from '@/lib/format';
import { whatsappUrl } from '@/lib/premiumOffer';
import styles from '../../premium.module.css';

/** Vérifications automatiques : toutes les 4 s pendant 3 minutes, puis à la demande. */
const POLL_MS = 6000;   // le serveur n'interroge SasPay qu'une fois toutes les 5 s par commande
const POLL_MAX = 30;

type Step = 'commande' | 'paiement' | 'verification' | 'active';

function stepState(current: Step, step: Step): 'done' | 'current' | 'todo' {
  const order: Step[] = ['commande', 'paiement', 'verification', 'active'];
  const a = order.indexOf(current); const b = order.indexOf(step);
  return b < a ? 'done' : b === a ? 'current' : 'todo';
}

export default function OrderTracker({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [view, setView] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const polls = useRef(0);

  const check = useCallback(async () => {
    setChecking(true);
    const res = await refreshMyOrder(orderId);
    setChecking(false);
    if ('error' in res) { setError(res.error); return null; }
    setError(null);
    setView(res);
    return res;
  }, [orderId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      const res = await check();
      polls.current += 1;
      if (stopped) return;
      if (res && ['created', 'pending'].includes(res.status) && polls.current < POLL_MAX) {
        timer = setTimeout(loop, POLL_MS);
      } else if (res?.status === 'fulfilled') {
        router.refresh(); // menu, encarts et publicités passent en Premium
      }
    };
    loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, [check, router]);

  const copy = async () => {
    if (!view?.code) return;
    try {
      await navigator.clipboard.writeText(view.code);
      toast.success('Code copié');
    } catch {
      toast.error('Copie impossible : sélectionne le code à la main.');
    }
  };

  const help = whatsappUrl(
    `Bonjour, j'ai besoin d'aide pour mon paiement SJP Premium (commande ${orderId.slice(0, 8)}${view?.reference ? `, référence ${view.reference}` : ''}).`,
  );

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Paiement introuvable</h1>
        <div className={`${styles.notice} ${styles.danger}`} role="alert">
          <AlertTriangle size={18} aria-hidden />
          <p>Ce paiement n’est pas lié à ton compte. Vérifie que tu es connecté avec la bonne adresse e-mail.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/app/premium" className={styles.secondary}>Retour à l’offre Premium</Link>
          <a href={help} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}><MessageCircle size={16} aria-hidden /> Contacter l’administrateur</a>
        </div>
      </div>
    );
  }

  const status = view?.status;
  const current: Step = status === 'fulfilled' ? 'active' : status === 'pending' ? 'verification' : 'paiement';
  const renewal = view?.codeAction === 'reactivated' || view?.codeAction === 'extended';

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>{view?.kind === 'renewal' ? 'Renouvellement Premium' : 'Abonnement Premium'}</p>
        <h1 className={styles.title}>
          {status === 'fulfilled' ? (renewal ? 'Ton abonnement est renouvelé' : 'Bienvenue dans SJP Premium')
            : status === 'failed' ? 'Le paiement n’a pas abouti'
              : status === 'expired' ? 'Paiement non effectué'
                : status === 'needs_review' ? 'Paiement reçu, vérification en cours'
                  : 'Vérification de ton paiement'}
        </h1>
      </header>

      {status !== 'failed' && status !== 'expired' && status !== 'needs_review' && (
        <section className={styles.card} aria-label="Étapes">
          <ol className={styles.timeline}>
            <li data-state={stepState(current, 'commande')}><span className={styles.dot} />Commande créée</li>
            <li data-state={stepState(current, 'paiement')}><span className={styles.dot} />Paiement sur SasPay</li>
            <li data-state={stepState(current, 'verification')}><span className={styles.dot} />Confirmation par SJP</li>
            <li data-state={stepState(current, 'active')}><span className={styles.dot} />Premium activé</li>
          </ol>
        </section>
      )}

      {!view && (
        <div className={`${styles.notice} ${styles.info}`} role="status">
          <span className={styles.spinner} aria-hidden />
          <p>Vérification auprès de SasPay…</p>
        </div>
      )}

      {(status === 'created' || status === 'pending') && (
        <div className={`${styles.notice} ${styles.info}`} role="status">
          <Clock size={18} aria-hidden />
          <p>
            <strong>{status === 'pending' ? 'Paiement en attente de confirmation.' : 'Nous n’avons pas encore reçu ton paiement.'}</strong>{' '}
            {status === 'pending'
              ? 'Valide la demande sur ton téléphone si ce n’est pas encore fait. Cette page se met à jour toute seule.'
              : 'Si tu viens de payer, patiente quelques instants : cette page se met à jour toute seule. Tant que le paiement n’est pas confirmé, ton compte reste en version gratuite.'}
          </p>
        </div>
      )}

      {status === 'fulfilled' && (
        <section className={styles.card} aria-labelledby="code">
          <div className={`${styles.notice} ${styles.success}`} role="status">
            <CheckCircle2 size={18} aria-hidden />
            <p>
              <strong>Paiement confirmé. Premium est actif{view?.premiumUntil ? ` jusqu’au ${formatDate(view.premiumUntil)}` : ''}.</strong>
              {view?.codeAction === 'extended' && ' Tes jours restants ont été conservés.'}
              {view?.codeAction === 'reactivated' && ' Ton ancien code a été réactivé.'}
            </p>
          </div>
          {view?.code && (
            <>
              <h2 id="code" className={styles.kicker}>Ton code d’accès personnel</h2>
              <div className={styles.codeBox}>
                <span className={styles.code}>{view.code}</span>
                <button type="button" className={styles.secondary} onClick={copy}><Copy size={16} aria-hidden /> Copier</button>
              </div>
              <p className={styles.fine}>
                Ton code est déjà activé sur ton compte : tu n’as rien à saisir. Garde-le : c’est le même qui sera réactivé à ton prochain renouvellement.
              </p>
            </>
          )}
          <Link href="/app/dashboard" className={styles.primary}>Revenir à SJP</Link>
        </section>
      )}

      {status === 'needs_review' && (
        <div className={`${styles.notice} ${styles.warning}`} role="status">
          <AlertTriangle size={18} aria-hidden />
          <p>
            <strong>Ton paiement est bien enregistré.</strong> Ton accès demande une vérification de l’administrateur.
            Tu n’as rien à repayer : écris-lui sur WhatsApp, il finalise ton accès.
          </p>
        </div>
      )}

      {status === 'failed' && (
        <div className={`${styles.notice} ${styles.danger}`} role="alert">
          <XCircle size={18} aria-hidden />
          <p><strong>Ton opérateur a refusé ou annulé le paiement.</strong> Aucun montant n’a été pris. Ton compte reste en version gratuite. Tu peux réessayer.</p>
        </div>
      )}

      {status === 'expired' && (
        <div className={`${styles.notice} ${styles.info}`} role="status">
          <Clock size={18} aria-hidden />
          <p><strong>Ce paiement n’a pas été effectué.</strong> Ton compte reste en version gratuite. Tu peux recommencer quand tu veux.</p>
        </div>
      )}

      <div className={styles.actions}>
        {(status === 'created' || status === 'pending' || status === 'failed') && (
          <button type="button" className={styles.secondary} onClick={check} disabled={checking}>
            {checking ? 'Vérification…' : 'Vérifier maintenant'}
          </button>
        )}
        {(status === 'failed' || status === 'expired') && (
          <Link href="/app/premium" className={styles.secondary}>Réessayer le paiement</Link>
        )}
        {status !== 'fulfilled' && <Link href="/app/dashboard" className={styles.secondary}>Revenir à SJP</Link>}
        <a href={help} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}>
          <MessageCircle size={16} aria-hidden /> Aide sur WhatsApp
        </a>
      </div>
    </div>
  );
}
