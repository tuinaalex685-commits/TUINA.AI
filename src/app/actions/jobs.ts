"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import crypto from 'crypto';

export type AiJobType = 'evaluation' | 'flashcards' | 'redaction' | 'etude' | 'examen_pool';

/**
 * Crée un job IA et le renvoie immédiatement (le frontend ne fait qu'observer ensuite).
 * Ne bloque JAMAIS sur Gemini. Déclenche le worker en best-effort ; le cron garantit le traitement.
 */
export async function enqueueAiJob(type: AiJobType, payload: Record<string, any>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Quota Rédaction (3 corrections IA / jour) : jusqu'ici vérifié UNIQUEMENT côté client
  // (RedactionManager.tsx) — contournable en appelant cette action directement. Revérifié ici,
  // côté serveur, sur la même règle (statut 'analyse' du jour), avant toute création de job.
  if (type === 'redaction') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count, error: usageError } = await supabase
      .from('redactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('statut', 'analyse')
      .gte('date_creation', startOfDay.toISOString());
    if (usageError) return { error: "Erreur serveur lors de la vérification du quota." };
    if ((count || 0) >= 3) {
      return { error: "Vous avez atteint votre limite de 3 corrections de Rédaction pour aujourd'hui. Réessayez demain." };
    }
  }

  // Anti-IDOR : flashcards / evaluation / examen_pool transportent un documentId (et parfois un
  // coursId legacy pour les flashcards) dans le payload, fourni par le client. Avant cette vérification,
  // rien n'empêchait d'enqueue un job sur le documentId/coursId d'UN AUTRE utilisateur — le worker lit
  // le texte via le service role (getSourceText/getDocumentText) sans revérifier l'appartenance, donc un
  // job accepté aurait généré du contenu IA à partir d'un document privé d'autrui.
  const docId = typeof payload.documentId === 'string' ? payload.documentId : null;
  const coursId = typeof payload.coursId === 'string' ? payload.coursId : null;

  if (docId && docId !== 'dummy') {
    const { data: doc } = await supabaseAdmin
      .from('documents').select('id').eq('id', docId).eq('user_id', user.id).maybeSingle();
    if (!doc) return { error: "Document introuvable ou accès refusé." };
  } else if (coursId) {
    const { data: cours } = await supabaseAdmin
      .from('cours').select('matiere_id').eq('id', coursId).maybeSingle();
    const { data: matiere } = cours
      ? await supabaseAdmin.from('matieres').select('id').eq('id', cours.matiere_id).eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!cours || !matiere) return { error: "Cours introuvable ou accès refusé." };
  }

  const content_hash = crypto.createHash('sha256')
    .update(`${type}:${JSON.stringify(payload)}`).digest('hex');

  const { data: job, error } = await supabaseAdmin
    .from('ai_jobs')
    .insert({ user_id: user.id, type, status: 'pending', payload, content_hash })
    .select('id, status')
    .single();

  if (error || !job) return { error: error?.message || "Impossible de créer le job." };

  // Déclenchement immédiat (best-effort). Si tué (rechargement) → le cron reprend dans la minute.
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('host');
    if (host) {
      fetch(`${proto}://${host}/api/worker/ai`, { method: 'POST', headers: { 'x-worker-secret': process.env.CRON_SECRET || '' } }).catch(() => {});
    }
  } catch { /* non bloquant */ }

  return { success: true, jobId: job.id };
}
