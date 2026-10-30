// Serveur uniquement.

/**
 * Adresse de base de l'application pour les appels internes (réveil du worker).
 *
 * SÉCURITÉ : jamais déduite des en-têtes de la requête (Host, X-Forwarded-*). Ces appels portent
 * CRON_SECRET : une adresse fournie par le client permettrait d'envoyer le secret chez un tiers.
 * Ordre : APP_URL explicite > domaine de production (en production) > URL du déploiement
 * (préversions Vercel) > serveur local.
 */
export function appBaseUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return null;
}

/** En-têtes d'un appel interne : secret du worker, et contournement de la protection Vercel des préversions. */
function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'x-worker-secret': process.env.CRON_SECRET || '' };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass && process.env.VERCEL_ENV !== 'production') h['x-vercel-protection-bypass'] = bypass;
  return h;
}

/**
 * Réveille une route de worker. On n'attend que l'envoi (timeout court), pas le traitement.
 * Ne lève jamais d'erreur : le cron reste le filet de sécurité.
 */
export async function pingWorker(path = '/api/worker/ai', timeoutMs = 3000): Promise<void> {
  const base = appBaseUrl();
  if (!base || !process.env.CRON_SECRET) return;
  await fetch(new URL(path, base), {
    method: 'POST',
    headers: internalHeaders(),
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  }).then(() => {}, () => {});
}
