import crypto from 'crypto';

/**
 * Marqueur « crédit à rendre si le job échoue », SIGNÉ par le serveur.
 *
 * Le worker rend le crédit Rédaction/Évaluation d'un job en échec définitif. Le payload d'un job
 * pouvant encore être écrit par un client (tant que la policy INSERT sur ai_jobs n'est pas
 * retirée), un simple champ `quotaFeature` se falsifierait : il suffirait de créer des jobs voués
 * à l'échec pour se rembourser sans fin. La signature HMAC (secret serveur) rend ce champ
 * infalsifiable, et la lier à l'IDENTIFIANT du job (choisi par le serveur) empêche de recopier un
 * marqueur valide dans un autre job.
 */
export type RefundFeature = 'redaction' | 'evaluation';

function secret(): string | null {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function signRefund(jobId: string, userId: string, feature: RefundFeature): string | null {
  const key = secret();
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(`${jobId}:${userId}:${feature}`).digest('hex');
}

export function verifyRefund(jobId: string, userId: string, payload: any): RefundFeature | null {
  const feature = payload?.quotaFeature;
  const sig = payload?.quotaSig;
  if ((feature !== 'redaction' && feature !== 'evaluation') || typeof sig !== 'string') return null;
  const expected = signRefund(jobId, userId, feature);
  if (!expected || expected.length !== sig.length) return null;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? feature : null;
}
