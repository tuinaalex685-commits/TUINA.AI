"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import crypto from 'crypto';

export type AiJobType = 'evaluation' | 'flashcards' | 'redaction';

/**
 * Crée un job IA et le renvoie immédiatement (le frontend ne fait qu'observer ensuite).
 * Ne bloque JAMAIS sur Gemini. Déclenche le worker en best-effort ; le cron garantit le traitement.
 */
export async function enqueueAiJob(type: AiJobType, payload: Record<string, any>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  const content_hash = crypto.createHash('sha256')
    .update(`${type}:${JSON.stringify(payload)}`).digest('hex');

  const { data: job, error } = await supabaseAdmin
    .from('ai_jobs')
    .insert({ user_id: user.id, type, status: 'queued', payload, content_hash })
    .select('id, status')
    .single();

  if (error || !job) return { error: error?.message || "Impossible de créer le job." };

  // Déclenchement immédiat (best-effort). Si tué (rechargement) → le cron reprend dans la minute.
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('host');
    if (host) {
      fetch(`${proto}://${host}/api/worker/ai`, { method: 'POST' }).catch(() => {});
    }
  } catch { /* non bloquant */ }

  return { success: true, jobId: job.id };
}
