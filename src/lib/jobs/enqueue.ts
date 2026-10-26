// Serveur uniquement (next/headers, service role) : ne jamais importer depuis un composant client.
import crypto from 'crypto';
import { after } from 'next/server';
import { pingWorker } from '@/lib/jobs/workerUrl';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Création de jobs IA côté serveur, pour les actions qui ont DÉJÀ vérifié l'accès et les droits
 * (aucune donnée du navigateur n'entre dans le payload sans contrôle).
 *
 * Déduplication : si un job identique (même type + même clé de contenu) est déjà en attente ou
 * en cours, on le réutilise au lieu d'en créer un second. C'est la première ligne de défense
 * contre les générations Gemini en double (la seconde est le verrou de contenu du worker).
 */
const ACTIVE = ['pending', 'queued', 'processing', 'generating', 'saving'];

export async function enqueueDedup(params: {
  userId: string;
  type: string;
  payload: Record<string, string | number>;
  dedupKey: string;
}): Promise<{ jobId: string; reused: boolean } | { error: string }> {
  const content_hash = crypto.createHash('sha256').update(`${params.type}:${params.dedupKey}`).digest('hex');

  const { data: running } = await supabaseAdmin
    .from('ai_jobs').select('id').eq('type', params.type).eq('content_hash', content_hash)
    .in('status', ACTIVE).limit(1);
  if (running?.[0]) return { jobId: running[0].id as string, reused: true };

  const { data: job, error } = await supabaseAdmin
    .from('ai_jobs')
    .insert({ user_id: params.userId, type: params.type, status: 'pending', payload: params.payload, content_hash })
    .select('id').single();
  if (error || !job) {
    console.error('[jobs] insertion impossible:', error?.message);
    return { error: 'Impossible de lancer le traitement. Réessaie dans un instant.' };
  }
  await triggerWorker();
  return { jobId: job.id as string, reused: false };
}

/** Réveille le worker après la réponse (le cron reste le filet de sécurité). */
export async function triggerWorker() {
  try {
    // Adresse configurée, jamais l'en-tête Host du client (l'appel porte CRON_SECRET).
    after(() => pingWorker());
  } catch { /* hors requête : ignoré */ }
}

/** État d'un job (pour l'affichage d'une erreur après coup). */
export async function lastJob(type: string, dedupKey: string) {
  const content_hash = crypto.createHash('sha256').update(`${type}:${dedupKey}`).digest('hex');
  const { data } = await supabaseAdmin
    .from('ai_jobs').select('id, status, error, phase, progress, updated_at')
    .eq('type', type).eq('content_hash', content_hash)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
