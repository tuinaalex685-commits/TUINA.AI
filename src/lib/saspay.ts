/**
 * CLIENT SASPAY — serveur uniquement. La clé (SASPAY_API_KEY) ne quitte jamais le serveur.
 * Référence : https://docs.saspay.me/llms.txt et /api-reference/openapi.json (fait foi).
 */
import type { VerifiedPayment } from '@/lib/saspayCore';

const BASE_URL = 'https://api.saspay.me/api/v1';
const TIMEOUT_MS = 12_000;

export class SaspayError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.SASPAY_API_KEY;
  if (!key) throw new SaspayError('SASPAY_API_KEY manquante', 500, 'config');
  return key;
}

/**
 * 429 (300 requêtes/minute pour tout le compte) : pause de 60 s des vérifications automatiques
 * dans cette instance serveur. La création d'une session reste tentée (action de l'étudiant).
 */
let pausedUntil = 0;
export function isSaspayPaused(): boolean {
  return Date.now() < pausedUntil;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new SaspayError('SasPay injoignable', 503, 'network');
  }
  const json: any = await res.json().catch(() => null);
  if (res.status === 429) pausedUntil = Date.now() + 60_000;
  if (!res.ok || json?.success === false) {
    // Jamais de corps complet dans les journaux : seulement le code et le message.
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new SaspayError(String(msg).slice(0, 200), res.status, json?.error?.code || json?.code);
  }
  // Enveloppe { success, data } ou objet direct selon la route.
  return (json && typeof json === 'object' && 'data' in json && json.data ? json.data : json) as T;
}

export interface CheckoutSession {
  id: string;
  checkout_url: string;
  status: string;
}

export function createCheckoutSession(input: {
  amount: string;
  currency: string;
  description: string;
  customer_email: string;
  customer_name: string;
  return_url: string;
  metadata: Record<string, string>;
  expires_at: string;
  country?: string;
}): Promise<CheckoutSession> {
  return call<CheckoutSession>('/checkout-sessions/', { method: 'POST', body: JSON.stringify(input) });
}

export interface CheckoutStatus {
  id: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | string;
  transaction_id: string | null;
  transaction_status: string | null;
  transaction_reference: string | null;
}

/** Revérifie l'état réel côté gateway avant de répondre (documentation SasPay). */
export function getCheckoutStatus(sessionId: string): Promise<CheckoutStatus> {
  return call<CheckoutStatus>(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
}

/** Annule une session non payée (ex. commande impossible à enregistrer chez SJP). */
export function cancelCheckoutSession(sessionId: string): Promise<unknown> {
  return call(`/checkout-sessions/${encodeURIComponent(sessionId)}/cancel/`, { method: 'POST' });
}

export interface CheckoutSessionListItem {
  id: string;
  status: string;
  transaction: string | { id?: string } | null;
}

/** Sessions du compte, filtrées par statut (pagination par numéro de page, 100 max). */
export function listCheckoutSessions(q: { status: 'PAID' | 'PENDING'; page: number; page_size: number }) {
  const qs = new URLSearchParams({ status: q.status, page: String(q.page), page_size: String(q.page_size) });
  return call<{ results: CheckoutSessionListItem[]; next: string | null }>(`/checkout-sessions/?${qs}`)
    .then((r) => ({ results: Array.isArray(r?.results) ? r.results : [], next: r?.next ?? null }));
}

/** Seule source acceptée pour livrer : statut SUCCESS revérifié côté gateway. */
export function verifyPayment(paymentId: string): Promise<VerifiedPayment> {
  return call<VerifiedPayment>(`/payments/${encodeURIComponent(paymentId)}/verify/`);
}
