import { isValidWebhookSignature } from '@/lib/saspayCore';
import { findOrderForTransaction, logOrderEvent, syncOrder } from '@/lib/premiumPayment';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * WEBHOOK SASPAY — simple SIGNAL, jamais une preuve.
 *
 * 1. Authenticité : signature HMAC-SHA256 sur le corps BRUT + horodatage de moins de 5 minutes.
 * 2. Le contenu n'est pas cru sur parole : la commande liée à la transaction est retrouvée par les
 *    sessions PAYÉES de SasPay (1 à 3 appels), puis revérifiée (statut + verify). C'est cette
 *    vérification serveur, et elle seule, qui peut attribuer un code (fulfill_premium_order).
 * 3. Toute notification valide est journalisée, même sans commande reconnue (ex. un paiement fait
 *    via l'ancien lien fixe) : la preuve n'est jamais perdue.
 * Seul transaction.success déclenche un travail : la réponse part bien avant les 15 s de SasPay.
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
  const txId = typeof data.id === 'string' && data.id.length <= 100 ? data.id : null;

  if (event === 'webhook.test') return Response.json({ received: true });

  await logOrderEvent(null, `webhook_${event || 'inconnu'}`.slice(0, 60), {
    transaction_id: txId,
    reference: data.reference ?? null,
    status: data.status ?? null,
    amount: data.amount ?? null,
    charged: data.charged ?? null,
    currency: data.currency ?? null,
  });

  if (event === 'transaction.success' && txId) {
    try {
      const order = await findOrderForTransaction(txId);
      if (order) await syncOrder(order, { force: true });
      else await logOrderEvent(null, 'paiement_sans_commande', { transaction_id: txId, reference: data.reference ?? null });
    } catch (e) {
      // SasPay momentanément indisponible : 503 → SasPay renverra la notification (+30 s, +5 min…).
      console.error('[webhook saspay] traitement reporté:', (e as Error).message);
      return new Response('réessayer plus tard', { status: 503 });
    }
  }
  return Response.json({ received: true });
}
