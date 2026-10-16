"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import { consumeQuota, refundQuota } from '@/lib/quota';
import { resolveDocumentAccess } from '@/lib/access';
import { signRefund } from '@/lib/quotaRefund';
import { headers } from 'next/headers';
import { after } from 'next/server';
import crypto from 'crypto';

export type AiJobType = 'evaluation' | 'flashcards' | 'redaction' | 'etude' | 'examen_pool';

const JOB_TYPES: AiJobType[] = ['evaluation', 'flashcards', 'redaction', 'etude', 'examen_pool'];

/**
 * Champs autorisés dans le payload, par type de job. Tout le reste est ignoré.
 *
 * Avant, le payload du client était enregistré tel quel : un client pouvait y glisser
 * `mock: true` (générateur de test) et remplir les caches PARTAGÉS (flashcards,
 * evaluation_cache) avec des données factices servies ensuite aux autres étudiants.
 */
const PAYLOAD_FIELDS: Record<AiJobType, string[]> = {
  evaluation: ['documentId', 'coursId', 'type', 'count', 'documentName'],
  flashcards: ['documentId', 'coursId', 'count', 'documentName'],
  redaction: ['redactionId'],
  etude: ['documentId'],
  examen_pool: ['documentId'],
};

function sanitizePayload(type: AiJobType, raw: Record<string, unknown>): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  for (const key of PAYLOAD_FIELDS[type]) {
    const v = raw?.[key];
    if (typeof v === 'string' && v.length > 0 && v.length <= 300) clean[key] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) clean[key] = v;
  }
  return clean;
}

/** Corrections de Rédaction par jour (tous plans : la Rédaction est déjà réservée au Premium). */
const REDACTION_DAILY_LIMIT = 3;

/**
 * Crée un job IA et le renvoie immédiatement (le frontend ne fait qu'observer ensuite).
 * Ne bloque JAMAIS sur Gemini. Déclenche le worker en best-effort ; le cron garantit le traitement.
 *
 * C'est le SEUL chemin de création d'un job côté utilisateur : propriété, Premium et quotas
 * sont vérifiés ici, et le worker revérifie la propriété avant de lire un contenu privé.
 */
export async function enqueueAiJob(type: AiJobType, rawPayload: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };
  if (!JOB_TYPES.includes(type)) return { error: 'Type de traitement inconnu.' };

  const payload = sanitizePayload(type, rawPayload || {});
  const premium = await isPremium(supabase, user.email);

  // Rédaction et Étude d'un document personnel = Premium, vérifié ici côté serveur. Avant,
  // l'Étude n'était contrôlée que dans /api/etude/generate : passer par cette action
  // contournait le Premium et la limite horaire.
  if (type === 'redaction' && !premium) {
    return { error: "La Rédaction est réservée aux membres Premium." };
  }
  if (type === 'etude' && !premium) {
    return { error: "L'import de tes propres cours est réservé aux membres Premium.", premiumRequired: true };
  }

  // Rédaction : la copie doit appartenir à l'appelant. Sans ce contrôle, un job pouvait
  // cibler la copie d'un autre étudiant, réécrire sa correction et l'exposer dans ai_jobs.result.
  if (type === 'redaction') {
    if (typeof payload.redactionId !== 'string') return { error: 'Rédaction manquante.' };
    const { data: red } = await supabaseAdmin
      .from('redactions').select('id').eq('id', payload.redactionId).eq('user_id', user.id).maybeSingle();
    if (!red) return { error: 'Rédaction introuvable ou accès refusé.' };
  }

  // Anti-IDOR : le worker lit le texte via le service role ; sans ce contrôle, un job aurait
  // généré du contenu à partir du document privé d'autrui.
  const docId = typeof payload.documentId === 'string' ? payload.documentId : null;
  const coursId = typeof payload.coursId === 'string' ? payload.coursId : null;

  if (docId && docId !== 'dummy') {
    const access = await resolveDocumentAccess(supabaseAdmin, user.id, docId);
    // Un cours du catalogue n'est ouvert qu'aux contenus mutualisés par source_hash
    // (flashcards, banque d'examen) : coût Gemini nul dès le deuxième utilisateur.
    const catalogAllowed = type === 'flashcards' || type === 'examen_pool';
    const ok = access === 'owner' || (access === 'catalog' && catalogAllowed);
    if (!ok) return { error: "Document introuvable ou accès refusé." };
  } else if (coursId && type === 'flashcards') {
    const { data: cours } = await supabaseAdmin
      .from('cours').select('matiere_id').eq('id', coursId).maybeSingle();
    const { data: matiere } = cours
      ? await supabaseAdmin.from('matieres').select('id').eq('id', cours.matiere_id).eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!cours || !matiere) return { error: "Cours introuvable ou accès refusé." };
  } else if (type !== 'redaction') {
    return { error: 'Document manquant.' };
  }

  // Étude : même garde-fou que /api/etude/generate (5 générations par heure).
  if (type === 'etude') {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from('ai_jobs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('type', 'etude').gte('created_at', oneHourAgo);
    if ((recent || 0) >= 5) return { error: "Limite atteinte : 5 études par heure maximum. Réessayez plus tard." };
  }

  // Quotas. Rédaction : compteur journalier ATOMIQUE (consume_free_quota est générique :
  // utilisateur + fonctionnalité + limite). Avant, on comptait les copies CRÉÉES aujourd'hui :
  // une copie d'hier se faisait corriger sans limite, et deux clics simultanés passaient tous
  // les deux. Évaluations : quota Free (un appel Gemini par contenu/type/nombre).
  let refund: (() => Promise<void>) | null = null;
  let refundFeature: 'redaction' | 'evaluation' | null = null;
  if (type === 'redaction') {
    const { data, error } = await supabaseAdmin.rpc('consume_free_quota', {
      p_user_id: user.id, p_feature: 'redaction', p_limit: REDACTION_DAILY_LIMIT,
    });
    if (error) {
      console.error('[jobs] quota redaction indisponible:', error.message);
      return { error: "Vérification du quota impossible pour le moment. Réessaie dans un instant." };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed !== true) {
      return { error: `Vous avez atteint votre limite de ${REDACTION_DAILY_LIMIT} corrections de Rédaction pour aujourd'hui. Réessayez demain.` };
    }
    refund = () => refundQuota(user.id, 'redaction');
    refundFeature = 'redaction';
  } else if (type === 'evaluation') {
    const quota = await consumeQuota(supabase, user.id, user.email, 'evaluation');
    if (!quota.allowed) return { error: quota.error, quotaReached: true };
    if (!quota.unlimited) {
      refund = () => refundQuota(user.id, 'evaluation');
      refundFeature = 'evaluation';
    }
  }

  const content_hash = crypto.createHash('sha256')
    .update(`${type}:${JSON.stringify(payload)}`).digest('hex');

  // Écrit par le SERVEUR après le filtrage : indique au worker quel crédit rendre si le
  // traitement échoue définitivement (jamais lu depuis le client).
  // Identifiant choisi par le serveur : la signature du crédit y est liée (non recopiable).
  const jobId = crypto.randomUUID();
  let storedPayload: Record<string, string | number> = payload;
  if (refundFeature) {
    const sig = signRefund(jobId, user.id, refundFeature);
    if (sig) storedPayload = { ...payload, quotaFeature: refundFeature, quotaSig: sig };
  }

  const { data: job, error } = await supabaseAdmin
    .from('ai_jobs')
    .insert({ id: jobId, user_id: user.id, type, status: 'pending', payload: storedPayload, content_hash })
    .select('id, status')
    .single();

  if (error || !job) {
    // Aucun job créé : l'étudiant ne perd pas son crédit pour notre incident.
    if (refund) await refund();
    console.error('[jobs] insertion ai_jobs impossible:', error?.message);
    return { error: "Impossible de créer le traitement. Réessaie dans un instant." };
  }

  // Déclenchement immédiat du worker. after() garantit que l'appel part réellement après la
  // réponse (un fetch non attendu pouvait être coupé avec la fonction ; le cron n'étant plus que
  // quotidien sur l'offre Hobby, le job aurait attendu). On n'attend que l'envoi, pas le traitement.
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('host');
    if (host) {
      after(() => fetch(`${proto}://${host}/api/worker/ai`, {
        method: 'POST',
        headers: { 'x-worker-secret': process.env.CRON_SECRET || '' },
        signal: AbortSignal.timeout(3000),
      }).then(() => {}, () => {}));
    }
  } catch { /* non bloquant */ }

  return { success: true, jobId: job.id };
}
