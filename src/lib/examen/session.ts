/**
 * CYCLE DE VIE D'UNE SESSION D'EXAMEN (EX.2) — orchestration serveur.
 *
 * Fonctions à DÉPENDANCES INJECTÉES (client Supabase + userId + horloge) : les
 * server actions passent le client authentifié (RLS) + `() => new Date()` ; le
 * harnais de preuve passe un client service-role + un `now` contrôlable pour
 * démontrer l'expiration du chrono SANS attendre en temps réel.
 *
 * Invariants garantis ici (source de vérité = serveur) :
 *  - le CORRIGÉ ne sort jamais : le client ne reçoit que `vueEpuree()` ;
 *  - la DEADLINE est serveur : toute réponse après `deadline` est REJETÉE ;
 *  - la note est calculée serveur (jamais écrite par le client) ;
 *  - finalisation IDEMPOTENTE : re-soumettre renvoie le même résultat.
 */
import crypto from 'crypto';
import {
  composerStandard, corriger, vueEpuree, dureeSecondes, pointsMax,
  seedFrom, CompositionItem, PoolQuestion,
} from '@/lib/examen/engine';

export interface SessionDeps {
  poolDb: any;    // service-role : lit examen_question_pools + documents (corrigés jamais exposés)
  sessionDb: any; // authed (RLS) en prod / service-role en test : lit/écrit examen_sessions
  userId: string;
  now: () => Date;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s || '').digest('hex');

async function loadPool(deps: SessionDeps, sourceHash: string): Promise<PoolQuestion[]> {
  const { data } = await deps.poolDb.from('examen_question_pools')
    .select('questions').eq('source_hash', sourceHash).maybeSingle();
  if (!data?.questions) throw new Error('Banque de questions introuvable pour ce contenu.');
  return data.questions as PoolQuestion[];
}

async function readSession(deps: SessionDeps, sessionId: string): Promise<any> {
  const { data, error } = await deps.sessionDb.from('examen_sessions')
    .select('*').eq('id', sessionId).eq('user_id', deps.userId).maybeSingle();
  if (error) throw new Error(`Lecture session: ${error.message}`);
  if (!data) throw new Error('Session introuvable.');
  return data;
}

/** Démarre un examen : compose depuis la banque, fixe la deadline serveur, persiste. */
export async function startExam(
  deps: SessionDeps, args: { documentId: string; mode?: 'standard' }
): Promise<{ sessionId: string; deadline: string; dureeSecondes: number }> {
  const { data: doc } = await deps.poolDb.from('documents')
    .select('extracted_text').eq('id', args.documentId).maybeSingle();
  const text = doc?.extracted_text || '';
  if (!text || text.trim().length < 100) throw new Error('Document sans texte exploitable.');
  const sourceHash = sha256(text);

  const pool = await loadPool(deps, sourceHash);
  const seedStr = `${deps.userId}:${args.documentId}:${deps.now().getTime()}:${Math.random()}`;
  const seed = seedFrom(seedStr);
  const composition = composerStandard(pool, seed);
  if (composition.length === 0) throw new Error('Composition vide : banque insuffisante.');

  const startedAt = deps.now();
  const duree = dureeSecondes(composition);
  const deadline = new Date(startedAt.getTime() + duree * 1000);

  const { data: row, error } = await deps.sessionDb.from('examen_sessions').insert({
    user_id: deps.userId, document_id: args.documentId, source_hash: sourceHash,
    mode: args.mode || 'standard', composition, seed, answers: {},
    started_at: startedAt.toISOString(), deadline: deadline.toISOString(),
    points_max: pointsMax(composition), status: 'in_progress',
  }).select('id').single();
  if (error) throw new Error(`Création session: ${error.message}`);
  return { sessionId: row.id, deadline: deadline.toISOString(), dureeSecondes: duree };
}

const isExpired = (deps: SessionDeps, session: any) => deps.now().getTime() >= new Date(session.deadline).getTime();

/** Vue de passage : questions ÉPURÉES (aucun corrigé) + réponses de l'étudiant + temps restant. */
export async function getExamView(deps: SessionDeps, sessionId: string): Promise<any> {
  let session = await readSession(deps, sessionId);
  // Finalisation paresseuse : si le temps est écoulé, on clôt AVANT de servir la vue.
  if (session.status === 'in_progress' && isExpired(deps, session)) {
    await finalize(deps, session, true);
    session = await readSession(deps, sessionId);
  }
  const pool = await loadPool(deps, session.source_hash);
  const questions = vueEpuree(session.composition as CompositionItem[], pool);
  const remainingMs = Math.max(0, new Date(session.deadline).getTime() - deps.now().getTime());
  return {
    sessionId, status: session.status, mode: session.mode,
    remainingSeconds: Math.floor(remainingMs / 1000),
    questions, answers: session.answers || {},
    note: session.status === 'submitted' ? Number(session.score) : null,
  };
}

/**
 * Enregistre une réponse. REJETTE après la deadline (chrono serveur). La fusion
 * dans `answers` est ATOMIQUE (RPC examen_save_answer) → deux sauvegardes
 * concurrentes ne s'écrasent jamais (anti lost-update). Idempotent par position.
 */
export async function saveAnswer(
  deps: SessionDeps, sessionId: string, position: number, answer: any
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = await readSession(deps, sessionId);
  if (session.status !== 'in_progress') return { ok: false, reason: 'Examen déjà terminé.' };
  if (isExpired(deps, session)) {
    await finalize(deps, session, true); // le temps est écoulé → on clôt, la réponse est rejetée
    return { ok: false, reason: 'Temps écoulé.' };
  }

  const { data, error } = await deps.sessionDb.rpc('examen_save_answer', {
    p_session_id: sessionId, p_user_id: deps.userId, p_position: String(position), p_answer: answer ?? null,
  });
  if (error) {
    // Dégradation gracieuse si la RPC n'est pas encore déployée (fonction absente) : ancien merge.
    const missing = error.code === '42883' || error.code === 'PGRST202' || /examen_save_answer|function.*not|schema cache/i.test(error.message || '');
    if (!missing) throw new Error(`Sauvegarde réponse: ${error.message}`);
    const answers = { ...(session.answers || {}), [String(position)]: answer };
    const { error: upErr } = await deps.sessionDb.from('examen_sessions')
      .update({ answers, updated_at: deps.now().toISOString() })
      .eq('id', sessionId).eq('user_id', deps.userId).eq('status', 'in_progress');
    if (upErr) throw new Error(`Sauvegarde réponse: ${upErr.message}`);
    return { ok: true };
  }
  // RETURNING vide → NULL : la session n'était plus 'in_progress' (course avec une soumission).
  if (data !== true) return { ok: false, reason: 'Enregistrement refusé (session close).' };
  return { ok: true };
}

/** Soumission manuelle : force la finalisation (correction serveur + note). Idempotent. */
export async function submitExam(deps: SessionDeps, sessionId: string): Promise<any> {
  const session = await readSession(deps, sessionId);
  return finalize(deps, session, true);
}

/**
 * Finalise : corrige côté serveur, écrit note/points/résultats par thème. IDEMPOTENT :
 * une session déjà 'submitted' renvoie son résultat sans re-corriger ni ré-écrire.
 * L'écriture est conditionnée à status='in_progress' → une double-soumission concurrente
 * n'écrit qu'une fois (l'autre relit le résultat figé).
 */
async function finalize(deps: SessionDeps, session: any, _force: boolean): Promise<any> {
  if (session.status === 'submitted') return finalResult(session);

  const pool = await loadPool(deps, session.source_hash);
  const c = corriger(session.composition as CompositionItem[], pool, session.answers || {});
  const submittedAt = deps.now().toISOString();

  const { data: updated, error } = await deps.sessionDb.from('examen_sessions')
    .update({
      status: 'submitted', score: c.note, points_obtenus: c.points, points_max: c.pointsMax,
      theme_results: c.parTheme, submitted_at: submittedAt, updated_at: submittedAt,
    })
    .eq('id', session.id).eq('user_id', deps.userId).eq('status', 'in_progress')
    .select('*');
  if (error) throw new Error(`Finalisation session: ${error.message}`);

  // 0 ligne mise à jour = une autre soumission a gagné la course → on relit le résultat figé.
  if (!updated || updated.length === 0) {
    const fresh = await readSession(deps, session.id);
    return finalResult(fresh);
  }
  return {
    documentId: session.document_id, note: c.note, points: c.points, pointsMax: c.pointsMax,
    parQuestion: c.parQuestion, parTheme: c.parTheme, status: 'submitted',
  };
}

function finalResult(session: any) {
  return {
    documentId: session.document_id, note: Number(session.score), points: Number(session.points_obtenus),
    pointsMax: Number(session.points_max), parTheme: session.theme_results || [],
    status: 'submitted', alreadySubmitted: true,
  };
}
