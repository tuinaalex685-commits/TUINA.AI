"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeEmail } from '@/lib/email';
import { appBaseUrl } from '@/lib/jobs/workerUrl';
import { createCheckoutSession } from '@/lib/saspay';
import { formatAmount } from '@/lib/saspayCore';
import {
  getPremiumSituation, getOrder, syncOrder, logOrderEvent, latestOrderFor,
  ORDER_AMOUNT, ORDER_CURRENCY, type PremiumOrder,
} from '@/lib/premiumPayment';

/** Démarrages de paiement par jour et par compte (anti-abus : chaque démarrage crée une session SasPay). */
const CHECKOUTS_PER_DAY = 10;
/** Une session non payée reste réutilisable pendant ce délai (double clic, retour arrière). */
const REUSE_MS = 20 * 60 * 1000;
/** Durée de validité de la page de paiement SasPay. */
const SESSION_TTL_MS = 60 * 60 * 1000;

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: normalizeEmail(user.email) };
}

export type StartResult =
  | { url: string }
  | { error: string; reason?: 'auth' | 'blocked' | 'legacy' | 'admin' | 'no_stock' | 'limit' | 'unavailable' };

/**
 * « Payer mon abonnement mensuel » / « Payer mon renouvellement mensuel ».
 * Crée une commande liée au compte CONNECTÉ, puis une session SasPay individuelle.
 * Ne donne AUCUN accès : seule la vérification serveur après paiement le fait.
 */
export async function startPremiumCheckout(): Promise<StartResult> {
  const user = await currentUser();
  if (!user) return { error: 'Connecte-toi pour souscrire.', reason: 'auth' };

  let situation;
  try {
    situation = await getPremiumSituation(user.email);
  } catch (e) {
    console.error('[paiement] situation:', (e as Error).message);
    return { error: 'Le paiement est momentanément indisponible. Réessaie dans un instant.', reason: 'unavailable' };
  }
  if (situation.kind === 'admin') return { error: 'Ton compte administrateur a déjà tous les accès.', reason: 'admin' };
  if (situation.kind === 'legacy') return { error: 'Ton accès Premium est déjà illimité.', reason: 'legacy' };
  if (situation.kind === 'blocked') {
    return { error: "Ton accès a été suspendu par l'administrateur. Contacte-le sur WhatsApp.", reason: 'blocked' };
  }
  if (situation.kind === 'first' && situation.stock < 1) {
    // Pas de code disponible : on n'envoie pas l'étudiant payer.
    return { error: 'Les accès Premium sont temporairement indisponibles.', reason: 'no_stock' };
  }

  // Session encore ouverte et récente : on la réutilise (pas de seconde commande sur un double clic).
  const last = await latestOrderFor(user.id);
  if (last && ['created', 'pending'].includes(last.status) && last.checkout_url
      && Date.now() - new Date(last.created_at).getTime() < REUSE_MS) {
    return { url: last.checkout_url };
  }

  const { data: attempt, error: attemptErr } = await supabaseAdmin.rpc('consume_free_quota', {
    p_user_id: user.id, p_feature: 'premium_checkout', p_limit: CHECKOUTS_PER_DAY,
  });
  const attemptRow = Array.isArray(attempt) ? attempt[0] : attempt;
  if (attemptErr || attemptRow?.allowed !== true) {
    if (attemptErr) console.error('[paiement] compteur:', attemptErr.message);
    return { error: "Trop de tentatives de paiement aujourd'hui. Réessaie demain ou contacte l'administrateur.", reason: 'limit' };
  }

  const base = appBaseUrl();
  if (!base) return { error: 'Le paiement est momentanément indisponible.', reason: 'unavailable' };

  const kind = situation.kind === 'first' ? 'first' : 'renewal';
  const { data: order, error: orderErr } = await supabaseAdmin.from('premium_orders')
    .insert({ user_id: user.id, email: user.email, kind, amount: ORDER_AMOUNT, currency: ORDER_CURRENCY })
    .select('*').single();
  if (orderErr || !order) {
    console.error('[paiement] création de commande:', orderErr?.message);
    return { error: 'Le paiement est momentanément indisponible. Réessaie dans un instant.', reason: 'unavailable' };
  }

  try {
    const session = await createCheckoutSession({
      amount: formatAmount(ORDER_AMOUNT),
      currency: ORDER_CURRENCY,
      description: kind === 'first' ? 'SJP Premium — abonnement 30 jours' : 'SJP Premium — renouvellement 30 jours',
      customer_email: user.email,
      customer_name: user.email.split('@')[0].slice(0, 60) || 'Étudiant SJP',
      return_url: `${base}/app/premium/commande/${order.id}`,
      metadata: { order_id: order.id, user_id: user.id, kind },
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      country: 'BF',
    });
    if (!session?.id || !session?.checkout_url) throw new Error('réponse SasPay incomplète');
    await supabaseAdmin.from('premium_orders')
      .update({ checkout_session_id: session.id, checkout_url: session.checkout_url, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    await logOrderEvent(order.id, 'commande_creee', { kind, session_id: session.id });
    return { url: session.checkout_url };
  } catch (e) {
    console.error('[paiement] création de session SasPay:', (e as Error).message);
    await supabaseAdmin.from('premium_orders')
      .update({ status: 'expired', review_reason: 'Session SasPay non créée', updated_at: new Date().toISOString() })
      .eq('id', order.id);
    await logOrderEvent(order.id, 'session_non_creee', { message: (e as Error).message.slice(0, 200) });
    return { error: 'Le paiement est momentanément indisponible. Réessaie dans un instant.', reason: 'unavailable' };
  }
}

export interface OrderView {
  id: string;
  status: PremiumOrder['status'];
  kind: PremiumOrder['kind'];
  codeAction: PremiumOrder['code_action'];
  premiumUntil: string | null;
  code: string | null;
  reference: string | null;
  createdAt: string;
}

/**
 * Revérifie la commande de l'étudiant CONNECTÉ auprès de SasPay (côté serveur) et renvoie son état.
 * Appelée à l'arrivée sur la page de retour et périodiquement : elle n'active rien elle-même,
 * elle déclenche seulement la vérification serveur, idempotente.
 */
export async function refreshMyOrder(orderId: string): Promise<OrderView | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { error: 'Commande introuvable' };

  let order = await getOrder(orderId);
  // Une commande n'est visible que par son propre compte (jamais par l'id seul).
  if (!order || order.user_id !== user.id) return { error: 'Commande introuvable' };

  const before = order.status;
  order = await syncOrder(order);
  if (order.status !== before && order.status === 'fulfilled') revalidatePath('/app', 'layout');

  let code: string | null = null;
  if (order.status === 'fulfilled' && order.code_id) {
    const { data } = await supabaseAdmin.from('access_codes').select('code').eq('id', order.code_id).maybeSingle();
    code = data?.code ?? null;
  }
  return {
    id: order.id,
    status: order.status,
    kind: order.kind,
    codeAction: order.code_action,
    premiumUntil: order.premium_until,
    code,
    reference: order.transaction_reference,
    createdAt: order.created_at,
  };
}
