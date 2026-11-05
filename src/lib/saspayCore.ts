/**
 * Règles PURES de l'intégration SasPay (aucune dépendance réseau : testées par `node --test`).
 */
import crypto from 'node:crypto';

/** Âge maximal d'un webhook (documentation SasPay : 300 secondes). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Signature d'un webhook SasPay : HMAC-SHA256 hexadécimal de `${timestamp}.${corpsBrut}`.
 * Toujours calculée sur le corps BRUT reçu, jamais sur un JSON re-sérialisé.
 */
export function isValidWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Montant décimal SasPay (« "2500.00" ») → nombre, ou null si illisible. */
export function parseAmount(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Montant à envoyer à SasPay : chaîne décimale, jamais un flottant. */
export function formatAmount(n: number): string {
  return n.toFixed(2);
}

export interface VerifiedPayment {
  id: string;
  reference: string | null;
  status: string;
  requested_amount: string | null;
  currency: string | null;
}

/**
 * Décision à partir de la vérification SERVEUR d'un paiement (GET /payments/{id}/verify/).
 *  - 'success' : payé, montant et devise exacts → on peut livrer ;
 *  - 'mismatch' : payé, mais montant ou devise différents → intervention (jamais de Premium auto) ;
 *  - 'failed'   : refusé ou annulé ;
 *  - 'pending'  : pas encore terminé → ne rien livrer.
 */
export function decidePayment(
  p: VerifiedPayment,
  expected: { amount: number; currency: string },
): 'success' | 'mismatch' | 'failed' | 'pending' {
  const s = String(p.status || '').toUpperCase();
  if (s === 'FAILED' || s === 'CANCELLED') return 'failed';
  if (s !== 'SUCCESS') return 'pending';
  const amount = parseAmount(p.requested_amount);
  const currency = String(p.currency || '').toUpperCase();
  if (amount === null || Math.abs(amount - expected.amount) > 0.001 || currency !== expected.currency.toUpperCase()) {
    return 'mismatch';
  }
  return 'success';
}
