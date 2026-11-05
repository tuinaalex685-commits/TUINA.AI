import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidWebhookSignature } from '@/lib/saspayCore';
import { logOrderEvent, syncOpenOrders, syncOrder, type PremiumOrder } from '@/lib/premiumPayment';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * WEBHOOK SASPAY — simple SIGNAL, jamais une preuve.
 *
 * 1. Authenticité : signature HMAC-SHA256 sur le corps BRUT + horodatage de moins de 5 minutes.
 * 2. Le contenu n'est pas cru sur parole : on revérifie chaque commande ouverte auprès de l'API
 *    SasPay (statut de session puis verify du paiement). C'est cette vérification serveur, et elle
 *    seule, qui peut attribuer un code (fulfill_premium_order, idempotente).
 * 3. Toute notification valide est journalisée, même sans commande reconnue (ex. un paiement fait
 *    via l'ancien lien fixe) : la preuve n'est jamais perdue.
 */
export async function POST(request: Request) {
  const secret = process.env.SASPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook saspay] SASPAY_WEBHOOK_SECRET manquant');
    return new Response('configuration manquante', { status: 503 });
  }

  const raw = await request.text();
  const ok = isValidWebhookSignature(
    raw,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
    secret,
  );
  if (!ok) return new Response('signature invalide', { status: 403 });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('corps invalide', { status: 400 });
  }
  const event = String(payload?.event || request.headers.get('x-webhook-event') || '');
  const data = payload?.data ?? {};
  const txId = typeof data.id === 'string' ? data.id : null;

  if (event === 'webhook.test') return Response.json({ received: true });

  await logOrderEvent(null, `webhook_${event || 'inconnu'}`, {
    transaction_id: txId,
    reference: data.reference ?? null,
    status: data.status ?? null,
    amount: data.amount ?? null,
    charged: data.charged ?? null,
    currency: data.currency ?? null,
  });

  if (event.startsWith('transaction.')) {
    // Commande déjà liée à cette transaction ? Sinon, revérification des commandes ouvertes.
    const { data: linked } = txId
      ? await supabaseAdmin.from('premium_orders').select('*').eq('transaction_id', txId).maybeSingle()
      : { data: null };
    if (linked) await syncOrder(linked as PremiumOrder);
    else await syncOpenOrders();
  }
  return Response.json({ received: true });
}
