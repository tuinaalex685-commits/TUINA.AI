"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import { consumeQuota, refundQuota } from '@/lib/quota';
import { resolveDocumentAccess } from '@/lib/access';
import { signRefund } from '@/lib/quotaRefund';
import { after } from 'next/server';
import { pingWorker } from '@/lib/jobs/workerUrl';
import crypto from 'crypto';
import { LIMITS } from '@/lib/redaction/compartiments';

export type AiJobType = 'evaluation' | 'flashcards' | 'redaction' | 'examen_pool' | 'redaction_sujets';

// L'Étude guidée ne passe plus par ici : actions/etude3.ts (startEtude, prepareSequence) la pilote.
const JOB_TYPES: AiJobType[] = ['evaluation', 'flashcards', 'redaction', 'examen_pool', 'redaction_sujets'];

/** Types d'exercice pour lesquels on propose des sujets (jamais le commentaire d'arrêt : pas de décision inventée). */
const SUJET_TYPES = ['Cas pratique', 'Dissertation'];

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
  examen_pool: ['documentId'],
  redaction_sujets: ['documentId', 'type'],
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

/** Séries de sujets proposés par jour et par étudiant (la plupart sortent du cache, sans coût). */
const SUJETS_DAILY_LIMIT = 10;

/** Corrections de Rédaction par jour (tous plans : la Rédaction est déjà réservée au Premium). */
const REDACTION_DAILY_LIMIT = 3;

/** Jobs flashcards / banque d'examen par heure et par étudiant (anti-robot, pas une limite d'usage). */
const JOBS_SANS_QUOTA_PAR_HEURE = 20;

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
  if ((type === 'redaction' || type === 'redaction_sujets') && !premium) {
    return { error: "La Rédaction est réservée aux membres Premium." };
  }
  if (type === 'redaction_sujets' && !SUJET_TYPES.includes(String(payload.type))) {
    return { error: 'Type d’exercice invalide.' };
  }

  // Rédaction : la copie doit appartenir à l'appelant. Sans ce contrôle, un job pouvait
  // cibler la copie d'un autre étudiant, réécrire sa correction et l'exposer dans ai_jobs.result.
  if (type === 'redaction') {
    if (typeof payload.redactionId !== 'string') return { error: 'Rédaction manquante.' };
    const { data: red } = await supabaseAdmin
      .from('redactions').select('id, statut, contenu').eq('id', payload.redactionId).eq('user_id', user.id).maybeSingle();
    if (!red) return { error: 'Rédaction introuvable ou accès refusé.' };
    // Seul chemin légitime : submitRedaction, qui verrouille la copie en « en_cours » et
    // contrôle sa longueur. Un appel direct de cette action ne contourne donc rien.
    if (red.statut !== 'en_cours') return { error: 'Rends ta copie depuis l’écran de rédaction.' };
    if (String(red.contenu || '').trim().length < LIMITS.copieMinCorrection) return { error: 'Copie trop courte pour être corrigée.' };
    const { count: active } = await supabaseAdmin
      .from('ai_jobs').select('id', { count: 'exact', head: true })
      .eq('type', 'redaction').eq('payload->>redactionId', payload.redactionId)
      .in('status', ['pending', 'queued', 'processing', 'generating', 'saving']);
    if ((active || 0) > 0) return { error: 'Ta copie est déjà en correction.' };
  }

  // Anti-IDOR : le worker lit le texte via le service role ; sans ce contrôle, un job aurait
  // généré du contenu à partir du document privé d'autrui.
  const docId = typeof payload.documentId === 'string' ? payload.documentId : null;
  const coursId = typeof payload.coursId === 'string' ? payload.coursId : null;

  if (docId && docId !== 'dummy') {
    const access = await resolveDocumentAccess(supabaseAdmin, user.id, docId);
    // Un cours du catalogue n'est ouvert qu'aux contenus mutualisés par source_hash
    // (flashcards, banque d'examen) : coût Gemini nul dès le deuxième utilisateur.
    const catalogAllowed = type === 'flashcards' || type === 'examen_pool' || type === 'redaction_sujets';
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

  // Flashcards et banque d'examen n'ont pas de quota (contenu mutualisé), mais chaque job occupe
  // le worker et ajoute des lignes : plafond horaire anti-robot, jamais atteint par un usage normal.
  if (type === 'flashcards' || type === 'examen_pool') {
    const { count: heure } = await supabaseAdmin.from('ai_jobs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('type', type).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((heure || 0) >= JOBS_SANS_QUOTA_PAR_HEURE) {
      return { error: 'Tu as lancé beaucoup de générations en une heure. Patiente quelques minutes avant de recommencer.' };
    }
  }

  // Sujets de rédaction : mis en cache par contenu, mais la 1re génération coûte un appel IA.
  // 1) Un job déjà en route pour le même cours et le même type est réutilisé (pas de doublon).
  // 2) Plafond journalier ATOMIQUE (consume_free_quota) : des appels parallèles ne le dépassent pas.
  if (type === 'redaction_sujets') {
    if (!docId || docId === 'dummy') return { error: 'Cours manquant.' };
    const { data: running } = await supabaseAdmin
      .from('ai_jobs').select('id')
      .eq('user_id', user.id).eq('type', 'redaction_sujets')
      .eq('payload->>documentId', docId).eq('payload->>type', String(payload.type))
      .in('status', ['pending', 'queued', 'processing', 'generating', 'saving'])
      .limit(1);
    if (running?.[0]) return { success: true, jobId: running[0].id as string };
    const { data, error } = await supabaseAdmin.rpc('consume_free_quota', {
      p_user_id: user.id, p_feature: 'redaction_sujets', p_limit: SUJETS_DAILY_LIMIT,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || row?.allowed !== true) {
      return { error: `Tu as demandé ${SUJETS_DAILY_LIMIT} séries de sujets aujourd’hui. Réessaie demain, ou écris ton propre sujet.` };
    }
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
    after(() => pingWorker());
  } catch { /* non bloquant */ }

  return { success: true, jobId: job.id };
}
