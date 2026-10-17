"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { consumeQuota, refundQuota } from '@/lib/quota';
import { generateStructuredJSON } from '@/lib/gemini';
import { enqueueDedup, lastJob } from '@/lib/jobs/enqueue';
import { CORRECTION_SCHEMA, CORRECTION_SYSTEM, neutralize } from '@/lib/prompts/etude/prompts';
import { accesEtude, ensureSequenceJob, etatActivites, getAnalyse, getParcours, getSequence, knownHash } from '@/lib/etude3/store';
import { ENGINE_VERSION, MAX_TENTATIVES, type Activite, type RetourActivite, type Verdict } from '@/lib/etude3/types';

/**
 * Études guidées v3 — actions serveur. Toutes les règles de progression sont vérifiées ICI :
 * le navigateur n'envoie que des intentions (« je réponds ceci à l'activité a2 »), jamais un
 * état (« activité réussie », « séquence débloquée »).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPONSE = 4000;
const ANALYSES_PAR_HEURE = 6;

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** « Commencer l'étude » : démarrage ENREGISTRÉ (Q-01), puis analyse si elle n'existe pas encore. */
export async function startEtude(documentId: string) {
  if (!UUID_RE.test(documentId)) return { error: 'Cours invalide.' };
  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };
  const acces = await accesEtude(user.id, user.email, documentId);
  if (!acces.ok) return { error: acces.raison === 'premium' ? 'L’étude de tes propres cours est réservée au Premium.' : 'Cours introuvable.' };

  // Idempotent : un double clic ou un second appareil ne crée pas deux parcours.
  const hashConnu = await knownHash(documentId);
  const { error } = await supabaseAdmin.from('etude_parcours').upsert(
    { user_id: user.id, document_id: documentId, engine_version: ENGINE_VERSION, source_hash: hashConnu },
    { onConflict: 'user_id,document_id', ignoreDuplicates: true },
  );
  if (error) {
    console.error('[etude3] démarrage impossible:', error.message);
    return { error: 'Démarrage impossible pour le moment. Réessaie dans un instant.' };
  }

  const parcours = await getParcours(user.id, documentId);
  const hash = parcours?.source_hash || hashConnu;
  if (hash) {
    if (!parcours?.source_hash) await supabaseAdmin.from('etude_parcours').update({ source_hash: hash }).eq('user_id', user.id).eq('document_id', documentId);
    const analyse = await getAnalyse(hash);
    if (analyse?.statut === 'pret') {
      revalidatePath(`/app/etude/${documentId}`);
      return { success: true, status: 'ready' as const };
    }
  }

  // Une analyse de ce document déjà en route (lancée par n'importe qui) : on la rejoint, gratuitement.
  const dedupKey = `${ENGINE_VERSION}:${documentId}`;
  const enCours = await lastJob('etude3_analyse', dedupKey);
  if (enCours && ['pending', 'queued', 'processing', 'generating', 'saving'].includes(enCours.status)) {
    return { success: true, status: 'analysing' as const, jobId: enCours.id as string };
  }
  // Garde-fou de coût avant une NOUVELLE analyse : nombre lancé par heure et par étudiant.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabaseAdmin.from('ai_jobs').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('type', 'etude3_analyse').gte('created_at', since);
  if ((count || 0) >= ANALYSES_PAR_HEURE) {
    return { error: `Tu as lancé ${ANALYSES_PAR_HEURE} analyses dans l’heure. Réessaie un peu plus tard.` };
  }
  const res = await enqueueDedup({ userId: user.id, type: 'etude3_analyse', payload: { documentId }, dedupKey });
  if ('error' in res) return { error: res.error };
  revalidatePath(`/app/etude/${documentId}`);
  return { success: true, status: 'analysing' as const, jobId: res.jobId };
}

/** La synthèse a été lue : on peut ouvrir la séquence 1. */
export async function markSyntheseVue(documentId: string) {
  if (!UUID_RE.test(documentId)) return { error: 'Cours invalide.' };
  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };
  const p = await getParcours(user.id, documentId);
  if (!p) return { error: 'Commence d’abord l’étude.' };
  await supabaseAdmin.from('etude_parcours')
    .update({ synthese_vue_at: p.synthese_vue_at ?? new Date().toISOString(), sequence_courante: Math.max(1, p.sequence_courante), updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('document_id', documentId);
  return { success: true };
}

/** Prépare une séquence (et la suivante en avance). N'ouvre jamais une séquence verrouillée. */
export async function prepareSequence(documentId: string, ordre: number) {
  if (!UUID_RE.test(documentId) || !Number.isInteger(ordre) || ordre < 1) return { error: 'Requête invalide.' };
  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };
  const p = await getParcours(user.id, documentId);
  if (!p?.source_hash) return { error: 'Commence d’abord l’étude.' };
  if (ordre > p.sequence_max) return { error: 'Cette séquence n’est pas encore débloquée.' };
  const acces = await accesEtude(user.id, user.email, documentId);
  if (!acces.ok) return { error: 'Accès refusé.' };

  if (await getSequence(p.source_hash, ordre)) return { success: true, ready: true };
  const res = await ensureSequenceJob(user.id, documentId, p.source_hash, ordre);
  if ('error' in res) return { error: res.error };
  return { success: true, ready: false, jobId: res.jobId };
}

function choixLettre(i: number) { return String.fromCharCode(65 + i); }

/**
 * Réponse à une activité. Règles (E-04) :
 *  - tentatives comptées côté serveur (contrainte unique : pas de double comptage) ;
 *  - une requête rejouée (même requestId) renvoie le même résultat ;
 *  - une panne technique NE consomme PAS de tentative ;
 *  - après 3 tentatives infructueuses : bonne réponse expliquée, notion « À revoir », on continue.
 */
export async function answerActivity(input: { documentId: string; ordre: number; activiteId: string; reponse: string; requestId: string }): Promise<{ error: string } | { success: true; retour: RetourActivite }> {
  const { documentId, ordre, activiteId, requestId } = input || ({} as typeof input);
  const reponse = typeof input?.reponse === 'string' ? input.reponse.trim() : '';
  if (!UUID_RE.test(documentId) || !UUID_RE.test(requestId) || !Number.isInteger(ordre) || ordre < 1) return { error: 'Requête invalide.' };
  if (typeof activiteId !== 'string' || !/^[a-z0-9_-]{1,20}$/i.test(activiteId)) return { error: 'Activité invalide.' };
  if (!reponse) return { error: 'Écris ou choisis une réponse.' };
  if (reponse.length > MAX_REPONSE) return { error: 'Réponse trop longue.' };

  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };

  // Requête rejouée : même résultat, aucune nouvelle tentative.
  const { data: replay } = await supabaseAdmin.from('etude_tentatives').select('retour').eq('user_id', user.id).eq('request_id', requestId).maybeSingle();
  if (replay?.retour) return { success: true, retour: replay.retour as RetourActivite };

  const p = await getParcours(user.id, documentId);
  if (!p?.source_hash) return { error: 'Commence d’abord l’étude.' };
  if (ordre > p.sequence_max) return { error: 'Cette séquence n’est pas encore débloquée.' };
  const acces = await accesEtude(user.id, user.email, documentId);
  if (!acces.ok) return { error: 'Accès refusé.' };

  const sequence = await getSequence(p.source_hash, ordre);
  const activite = sequence?.activites.find((a) => a.id === activiteId) as Activite | undefined;
  if (!activite) return { error: 'Activité introuvable.' };

  const etat = (await etatActivites(user.id, documentId, ordre))[activiteId];
  if (etat?.termine) return { error: 'Cette activité est déjà terminée.' };
  const numero = (etat?.tentatives || 0) + 1;

  // Évaluation (contenu lu en base, jamais envoyé par le navigateur).
  let verdict: Verdict;
  let message: string;
  let manquants: string[] = [];
  if (activite.type === 'choix') {
    const idx = Number(reponse);
    if (!Number.isInteger(idx) || idx < 0 || idx >= activite.choix.length) return { error: 'Choix invalide.' };
    verdict = idx === activite.bonne ? 'juste' : 'faux';
    message = verdict === 'juste'
      ? (activite.pourquoi_faux[idx] || activite.explication || 'C’est bien ça.')
      : (activite.pourquoi_faux[idx] || 'Ce n’est pas la bonne proposition.');
  } else {
    // Réponse ouverte : correction IA courte, sous quota (Free : quota journalier ; Premium : illimité).
    const supabase = await createClient();
    const quota = await consumeQuota(supabase, user.id, user.email, 'cas_pratique');
    if (!quota.allowed) return { error: quota.error || 'Limite de corrections atteinte pour aujourd’hui.' };
    try {
      const prompt = [
        `CONSIGNE : ${activite.consigne}`,
        `ATTENDUS :\n- ${activite.attendus.join('\n- ')}`,
        activite.erreurs_typiques.length ? `ERREURS TYPIQUES :\n- ${activite.erreurs_typiques.join('\n- ')}` : '',
        `RÉPONSE MODÈLE (pour toi seulement) : ${activite.reponse_modele}`,
        `<REPONSE_ETUDIANT>\n${neutralize(reponse)}\n</REPONSE_ETUDIANT>`,
      ].filter(Boolean).join('\n\n');
      const raw: any = await generateStructuredJSON(CORRECTION_SYSTEM, prompt, CORRECTION_SCHEMA, undefined, { userId: user.id, feature: 'etude3_correction', documentId }, 0.2);
      verdict = raw?.verdict === 'juste' || raw?.verdict === 'partiel' ? raw.verdict : 'faux';
      message = String(raw?.message || '').slice(0, 1500) || 'Relis l’explication et réessaie.';
      manquants = (Array.isArray(raw?.manquants) ? raw.manquants : []).map(String).slice(0, 5);
    } catch (err) {
      // Panne technique : crédit rendu, AUCUNE tentative comptée.
      if (!quota.unlimited) await refundQuota(user.id, 'cas_pratique');
      console.error('[etude3] correction indisponible:', err instanceof Error ? err.message : err);
      return { error: 'La correction est momentanément indisponible. Ta tentative n’a pas été comptée : réessaie.' };
    }
  }

  const reussi = verdict === 'juste';
  const dernierEssai = !reussi && numero >= MAX_TENTATIVES;
  const retour: RetourActivite = {
    verdict, message, manquants, numero,
    // 2e tentative et suivantes : une AUTRE manière d'expliquer, pas le même texte.
    autre_explication: !reussi && numero >= 1 ? activite.autre_explication : undefined,
    bonne_reponse: dernierEssai
      ? (activite.type === 'choix' ? `${choixLettre(activite.bonne)}. ${activite.choix[activite.bonne]} — ${activite.explication}` : activite.reponse_modele)
      : undefined,
    aRevoir: dernierEssai,
    termine: reussi || dernierEssai,
  };

  const { error } = await supabaseAdmin.from('etude_tentatives').insert({
    user_id: user.id, document_id: documentId, sequence_ordre: ordre, activite_id: activiteId,
    numero, reponse: reponse.slice(0, MAX_REPONSE), verdict, retour, request_id: requestId,
  });
  if (error) {
    if (error.code === '23505') return { error: 'Ta réponse a déjà été enregistrée (double envoi). Recharge la page.' };
    console.error('[etude3] tentative non enregistrée:', error.message);
    return { error: 'Ta réponse n’a pas pu être enregistrée. Réessaie.' };
  }
  if (dernierEssai) {
    await supabaseAdmin.from('etude_a_revoir').upsert(
      { user_id: user.id, document_id: documentId, sequence_ordre: ordre, activite_id: activiteId, notion: activite.notion },
      { onConflict: 'user_id,document_id,sequence_ordre,activite_id', ignoreDuplicates: true },
    );
  }
  await supabaseAdmin.from('etude_parcours').update({ updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('document_id', documentId);
  return { success: true, retour };
}

/** Termine une séquence si TOUTES ses activités sont terminées ; débloque la suivante. Idempotent. */
export async function completeSequence(documentId: string, ordre: number) {
  if (!UUID_RE.test(documentId) || !Number.isInteger(ordre) || ordre < 1) return { error: 'Requête invalide.' };
  const user = await currentUser();
  if (!user) return { error: 'Non authentifié' };
  const p = await getParcours(user.id, documentId);
  if (!p?.source_hash) return { error: 'Commence d’abord l’étude.' };
  if (ordre > p.sequence_max) return { error: 'Cette séquence n’est pas encore débloquée.' };

  const [sequence, analyse, etats] = await Promise.all([getSequence(p.source_hash, ordre), getAnalyse(p.source_hash), etatActivites(user.id, documentId, ordre)]);
  if (!sequence || !analyse?.plan) return { error: 'Séquence introuvable.' };
  const restantes = sequence.activites.filter((a) => !etats[a.id]?.termine);
  if (restantes.length > 0) return { error: `Il te reste ${restantes.length} activité${restantes.length > 1 ? 's' : ''} à faire dans cette séquence.` };

  const derniere = ordre >= analyse.plan.length;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now, sequence_courante: derniere ? ordre : Math.max(p.sequence_courante, ordre + 1) };
  if (!derniere) patch.sequence_max = Math.max(p.sequence_max, ordre + 1);
  else { patch.statut = 'termine'; patch.termine_at = p.statut === 'termine' ? undefined : now; }
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  await supabaseAdmin.from('etude_parcours').update(patch).eq('user_id', user.id).eq('document_id', documentId);

  // On prépare la séquence d'après pendant que l'étudiant lit la suivante (E-01, sans attente).
  if (ordre + 2 <= analyse.plan.length) await ensureSequenceJob(user.id, documentId, p.source_hash, ordre + 2).catch(() => {});
  revalidatePath(`/app/etude/${documentId}`);
  return { success: true, next: derniere ? null : ordre + 1 };
}
