/**
 * PAIEMENT PREMIUM — logique serveur (commandes SasPay ↔ codes d'accès existants).
 *
 * Règle absolue : Premium n'est accordé QUE par fulfill_premium_order (migration 13), appelée
 * après une vérification SERVEUR auprès de SasPay (statut SUCCESS, montant et devise exacts).
 * Un clic, une redirection, un retour sur la page de succès ou une URL modifiée ne déclenchent
 * qu'une revérification : jamais une activation.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exactEmailPattern, normalizeEmail } from '@/lib/email';
import { PREMIUM_DURATION_DAYS, isCodeCurrentlyActive } from '@/lib/plan';
import { PREMIUM_CURRENCY, PREMIUM_PRICE_XOF } from '@/lib/premiumOffer';
import { getCheckoutStatus, verifyPayment, listCheckoutSessions, SaspayError, isSaspayPaused } from '@/lib/saspay';
import { decidePayment, parseAmount } from '@/lib/saspayCore';

export type OrderStatus = 'created' | 'pending' | 'fulfilled' | 'failed' | 'expired' | 'needs_review' | 'resolved';

export interface PremiumOrder {
  id: string;
  user_id: string | null;
  email: string;
  kind: 'first' | 'renewal';
  amount: number;
  currency: string;
  status: OrderStatus;
  checkout_session_id: string | null;
  checkout_url: string | null;
  transaction_id: string | null;
  transaction_reference: string | null;
  code_id: string | null;
  code_action: 'assigned' | 'reactivated' | 'extended' | null;
  premium_until: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Statuts revérifiés automatiquement (un paiement échoué peut être retenté sur la même page SasPay). */
const SYNCABLE: OrderStatus[] = ['created', 'pending', 'failed'];
/** Revérification forcée (webhook signé, admin) : une commande classée abandonnée peut encore être payée. */
const SYNCABLE_FORCED: OrderStatus[] = [...SYNCABLE, 'expired'];
/** Au-delà, une session non payée n'est plus suivie (la session SasPay expire bien avant). */
const SYNC_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function logOrderEvent(orderId: string | null, event: string, detail: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from('premium_order_events').insert({ order_id: orderId, event, detail });
  if (error) console.error('[premium] journal:', error.message);
}

// ---------------------------------------------------------------------------------------------
// Situation de l'étudiant : nouvel achat, renouvellement, ou cas à traiter à la main.
// ---------------------------------------------------------------------------------------------
export type PremiumSituation =
  | { kind: 'admin' }
  | { kind: 'blocked' }                                       // bloqué par l'administrateur
  | { kind: 'legacy' }                                        // code historique sans date : Premium sans fin
  | { kind: 'active'; until: string; code: string }           // Premium en cours : renouvellement anticipé possible
  | { kind: 'renewal'; expiredOn: string | null; code: string } // ancien étudiant : code expiré ou désactivé
  | { kind: 'first'; stock: number };                         // nouvel étudiant (stock : 1 = disponible, 0 = épuisé)

export async function getPremiumSituation(email: string): Promise<PremiumSituation> {
  const pattern = exactEmailPattern(email);
  const [{ data: role }, { data: codes, error }] = await Promise.all([
    supabaseAdmin.from('user_roles').select('role').ilike('email', pattern).maybeSingle(),
    supabaseAdmin.from('access_codes').select('code, status, expires_at').ilike('email', pattern),
  ]);
  if (error) throw new Error(`lecture des codes impossible : ${error.message}`);
  if (role?.role === 'admin') return { kind: 'admin' };

  const c = codes?.[0];
  if (c) {
    if (c.status === 'blocked') return { kind: 'blocked' };
    // Même règle que tout le reste de l'application (src/lib/accessCode.ts).
    if (isCodeCurrentlyActive(c)) {
      return c.expires_at ? { kind: 'active', until: c.expires_at, code: c.code } : { kind: 'legacy' };
    }
    return { kind: 'renewal', expiredOn: c.expires_at, code: c.code };
  }
  let res = await supabaseAdmin
    .from('access_codes').select('id', { count: 'exact', head: true })
    .is('email', null).eq('status', 'active').eq('reserve_manuel', false);
  if (res.error) {
    // Colonne reserve_manuel absente (migration 13 partielle) : même règle sans le filtre.
    res = await supabaseAdmin.from('access_codes').select('id', { count: 'exact', head: true })
      .is('email', null).eq('status', 'active');
  }
  // Disponible / indisponible seulement : le nombre exact de codes ne quitte pas le serveur.
  return { kind: 'first', stock: (res.count ?? 0) > 0 ? 1 : 0 };
}

// ---------------------------------------------------------------------------------------------
// Revérification d'une commande auprès de SasPay → attribution éventuelle (idempotente).
// ---------------------------------------------------------------------------------------------
async function setStatus(order: PremiumOrder, status: OrderStatus, from: OrderStatus[], extra: Record<string, unknown> = {}) {
  if (order.status === status && Object.keys(extra).length === 0) return;
  // Garde : on ne fait jamais régresser une commande attribuée, clôturée ou en intervention.
  await supabaseAdmin.from('premium_orders')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', order.id).in('status', from);
  await logOrderEvent(order.id, `statut_${status}`, extra);
}

export async function getOrder(id: string): Promise<PremiumOrder | null> {
  const { data } = await supabaseAdmin.from('premium_orders').select('*').eq('id', id).maybeSingle();
  return (data as PremiumOrder) ?? null;
}

/** Intervalle minimal entre deux interrogations de SasPay pour une même commande. */
const CHECK_INTERVAL_MS = 5000;

/**
 * Réserve le droit d'interroger SasPay pour cette commande (mise à jour CONDITIONNELLE, atomique) :
 * une seule vérification toutes les 5 s, quel que soit le nombre d'onglets, d'appels en boucle
 * ou de notifications simultanées. Protège le quota SasPay commun à tous les étudiants.
 */
async function claimCheck(orderId: string): Promise<boolean> {
  const limit = new Date(Date.now() - CHECK_INTERVAL_MS).toISOString();
  const { data, error } = await supabaseAdmin.from('premium_orders')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', orderId)
    .or(`last_checked_at.is.null,last_checked_at.lt.${limit}`)
    .select('id').maybeSingle();
  if (error) {
    console.error('[premium] réservation de vérification:', error.message);
    return false;
  }
  return !!data;
}

/**
 * `force` : webhook SIGNÉ ou action admin. Ils ne peuvent pas être déclenchés en boucle par un
 * étudiant, et un webhook ne doit jamais être ignoré parce qu'un onglet a vérifié juste avant.
 */
export async function syncOrder(order: PremiumOrder, opts: { force?: boolean } = {}): Promise<PremiumOrder> {
  const allowed = opts.force ? SYNCABLE_FORCED : SYNCABLE;
  if (!allowed.includes(order.status) || !order.checkout_session_id) return order;
  if (isSaspayPaused()) return order; // SasPay a répondu 429 : on espace les appels
  if (!opts.force && !(await claimCheck(order.id))) return order; // vérifiée il y a moins de 5 s
  const tooOld = Date.now() - new Date(order.created_at).getTime() > SYNC_WINDOW_MS;

  let st;
  try {
    st = await getCheckoutStatus(order.checkout_session_id);
  } catch (e) {
    // Jamais de conclusion sur une erreur (404 passager compris) : on réessaiera plus tard.
    console.error('[premium] statut de session indisponible:', (e as Error).message);
    return order;
  }
  if (st.id && st.id !== order.checkout_session_id) return order; // réponse incohérente : on ne touche à rien

  const sessionStatus = String(st.status || '').toUpperCase();
  if (st.transaction_id) {
    let payment;
    try {
      payment = await verifyPayment(st.transaction_id);
    } catch (e) {
      console.error('[premium] vérification du paiement indisponible:', (e as Error).message);
      return order;
    }
    const decision = decidePayment(payment, { amount: Number(order.amount), currency: order.currency });
    if (decision === 'success' || decision === 'mismatch') {
      // Montant inattendu : la fonction SQL place la commande en intervention en gardant la preuve.
      const { data, error } = await supabaseAdmin.rpc('fulfill_premium_order', {
        p_order_id: order.id,
        p_transaction_id: payment.id,
        p_transaction_reference: payment.reference ?? st.transaction_reference ?? null,
        p_paid_amount: parseAmount(payment.requested_amount),
        p_paid_currency: payment.currency ?? '',
        p_days: PREMIUM_DURATION_DAYS,
      });
      if (error) console.error('[premium] attribution:', error.message);
      else await logOrderEvent(order.id, 'verification_serveur', { decision, resultat: (data as any)?.status ?? null });
    } else if (decision === 'failed') {
      await setStatus(order, 'failed', allowed);
    } else if (order.status === 'created') {
      await setStatus(order, 'pending', allowed);
    }
  } else if (sessionStatus === 'EXPIRED' || sessionStatus === 'CANCELLED' || (tooOld && order.status !== 'failed')) {
    // Abandon constaté APRÈS une vérification chez SasPay : jamais sur la seule ancienneté.
    await setStatus(order, 'expired', allowed);
  }
  return (await getOrder(order.id)) ?? order;
}

/**
 * Webhook transaction.success : retrouve LA commande payée par cette transaction, sans balayer
 * toutes les commandes (1 à 3 appels SasPay au lieu de dizaines). Les sessions PAYÉES récentes de
 * SasPay sont confrontées à nos sessions ; seule une session créée par SJP pour une commande est
 * retenue. Renvoie null si la transaction ne vient pas de ce parcours (ex. ancien lien fixe).
 */
export async function findOrderForTransaction(transactionId: string): Promise<PremiumOrder | null> {
  const { data: linked } = await supabaseAdmin.from('premium_orders').select('*')
    .eq('transaction_id', transactionId).maybeSingle();
  if (linked) return linked as PremiumOrder;

  for (let page = 1; page <= 3; page++) {
    // Une erreur SasPay remonte : le webhook répond 503 et SasPay le renverra plus tard.
    const res = await listCheckoutSessions({ status: 'PAID', page, page_size: 50 });
    const match = res.results.find((s) => {
      const tx = typeof s.transaction === 'string' ? s.transaction : s.transaction?.id;
      return tx === transactionId;
    });
    if (match) {
      const { data } = await supabaseAdmin.from('premium_orders').select('*')
        .eq('checkout_session_id', match.id).maybeSingle();
      return (data as PremiumOrder) ?? null;
    }
    if (!res.next) break;
  }
  return null;
}

/** Revérification groupée (bouton admin) : commandes ouvertes des dernières 48 h. */
export async function syncOpenOrders(limit = 60): Promise<number> {
  const since = new Date(Date.now() - SYNC_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin.from('premium_orders').select('*')
    .in('status', ['created', 'pending']).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(limit);
  const orders = (data as PremiumOrder[]) ?? [];
  let done = 0;
  // 5 à la fois, arrêt immédiat si SasPay demande d'espacer les appels (429).
  for (let i = 0; i < orders.length && !isSaspayPaused(); i += 5) {
    await Promise.all(orders.slice(i, i + 5).map((o) => syncOrder(o, { force: true }).catch((e) => {
      console.error('[premium] synchronisation:', (e as Error).message);
    })));
    done += Math.min(5, orders.length - i);
  }
  return done;
}

/** Dernière commande de l'étudiant (pour l'afficher et la revérifier à chaque visite). */
export async function latestOrderFor(userId: string): Promise<PremiumOrder | null> {
  const { data } = await supabaseAdmin.from('premium_orders').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as PremiumOrder) ?? null;
}

export const ORDER_AMOUNT = PREMIUM_PRICE_XOF;
export const ORDER_CURRENCY = PREMIUM_CURRENCY;
export { normalizeEmail, SaspayError };
