/**
 * ANALYSE DES EXAMENS (EX.3) — lecture seule, aucun appel Gemini.
 *
 * Transforme l'historique des sessions soumises en signal pédagogique :
 *   - maîtrise examen par thème (EMA, jamais stockée) ;
 *   - analyse des points faibles ;
 *   - retour ciblé vers l'Étude Guidée (pdfId + thèmes à revoir) ;
 *   - carte de maîtrise prête pour la composition ADAPTATIVE (EX.4) ;
 *   - historique des notes pour la progression.
 *
 * Les `theme_results` d'une session sont clés sur (section_ordre, theme_ordre)
 * — clés positionnelles STABLES entre tous les clones d'un contenu. On les
 * résout ici vers les theme_id/titres PROPRES à l'utilisateur (son cours Étude
 * du document), sans jamais écrire dans le flux Étude (etude_progression_themes
 * reste la seule source de la maîtrise Étude, cf theme_mastery / INC.1).
 */
import { estMaitrise } from '@/lib/config/mastery';
import {
  computeExamMastery, corriger, formatReponse, keyOf,
  CompositionItem, PoolQuestion, ThemeExamMastery,
} from '@/lib/examen/engine';

type Db = any; // client authed (RLS) en prod / service-role en test

export interface ThemeInfo {
  section_ordre: number;
  theme_ordre: number;
  theme_id: string | null;
  theme_titre: string;
  section_titre: string;
}
export interface ThemeAnalyse extends ThemeInfo {
  score: number | null; // maîtrise examen 0..100, null si jamais testé
  tested: number;
  maitrise: boolean;
}
export interface ExamAnalyse {
  pdfId: string;
  coursId: string | null;
  themes: ThemeAnalyse[];
  /** Thèmes testés ET sous le seuil : preuve de faiblesse → à retravailler dans l'Étude. */
  faiblesTestes: ThemeAnalyse[];
  /** Thèmes jamais couverts par un examen → à mesurer (prioritaires en adaptatif). */
  nonTestes: ThemeAnalyse[];
  resume: {
    nbThemes: number;
    nbMaitrises: number;
    nbTestes: number;
    nbExamens: number;
    derniereNote: number | null;
    meilleureNote: number | null;
    moyenneNotes: number | null;
    /** Vrai si TOUS les thèmes sont maîtrisés → sortie de boucle possible (recommandation Rédaction, EX.4). */
    coursMaitrise: boolean;
    /** Id de la session la plus récente (pour lier vers sa correction détaillée). */
    derniereSessionId: string | null;
  };
}

/** Résout (section_ordre, theme_ordre) → theme_id/titres du cours Étude de CE document. */
export async function resolveThemeMap(
  db: Db, documentId: string
): Promise<{ pdfId: string; coursId: string | null; map: Record<string, ThemeInfo> }> {
  const { data: cours } = await db.from('etude_cours').select('id, pdf_id').eq('pdf_id', documentId).maybeSingle();
  if (!cours) return { pdfId: documentId, coursId: null, map: {} };
  const { data: sections } = await db.from('etude_sections').select('id, ordre, titre').eq('cours_id', cours.id);
  const secList = sections || [];
  const secById = new Map<string, { ordre: number; titre: string }>(secList.map((s: any) => [s.id, { ordre: s.ordre, titre: s.titre }]));
  const map: Record<string, ThemeInfo> = {};
  if (secList.length > 0) {
    const { data: themes } = await db.from('etude_themes')
      .select('id, section_id, ordre, titre').in('section_id', secList.map((s: any) => s.id));
    for (const t of themes || []) {
      const sec = secById.get(t.section_id);
      if (!sec) continue;
      map[keyOf(sec.ordre, t.ordre)] = {
        section_ordre: sec.ordre, theme_ordre: t.ordre, theme_id: t.id,
        theme_titre: t.titre, section_titre: sec.titre,
      };
    }
  }
  return { pdfId: cours.pdf_id, coursId: cours.id, map };
}

/** Sessions SOUMISES de l'utilisateur (optionnellement pour un document). */
export async function getSubmittedSessions(db: Db, userId: string, documentId?: string): Promise<any[]> {
  let q = db.from('examen_sessions')
    .select('id, document_id, mode, score, theme_results, submitted_at, started_at')
    .eq('user_id', userId).eq('status', 'submitted');
  if (documentId) q = q.eq('document_id', documentId);
  const { data } = await q;
  return data || [];
}

/** Carte de maîtrise examen par clé positionnelle (pour la composition ADAPTATIVE — EX.4). */
export async function getExamMasteryMap(
  db: Db, userId: string, documentId: string
): Promise<Record<string, ThemeExamMastery>> {
  const sessions = await getSubmittedSessions(db, userId, documentId);
  return computeExamMastery(sessions.map((s: any) => ({ submitted_at: s.submitted_at, theme_results: s.theme_results || [] })));
}

/** Analyse complète d'un document pour l'utilisateur : maîtrise par thème + points faibles + retour Étude. */
export async function getExamAnalyse(db: Db, userId: string, documentId: string): Promise<ExamAnalyse> {
  const sessions = await getSubmittedSessions(db, userId, documentId);
  const mastery = computeExamMastery(sessions.map((s: any) => ({ submitted_at: s.submitted_at, theme_results: s.theme_results || [] })));
  const { pdfId, coursId, map } = await resolveThemeMap(db, documentId);

  const themes: ThemeAnalyse[] = Object.values(map).map((info) => {
    const m = mastery[keyOf(info.section_ordre, info.theme_ordre)];
    const tested = m?.tested || 0;
    const score = tested > 0 ? m!.score : null;
    return { ...info, score, tested, maitrise: tested > 0 && estMaitrise(score ?? 0) };
  }).sort((a, b) => a.section_ordre - b.section_ordre || a.theme_ordre - b.theme_ordre);

  const notes = sessions.map((s: any) => Number(s.score)).filter((n: number) => !Number.isNaN(n));
  const sorted = sessions.slice().sort((a: any, b: any) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const nbTestes = themes.filter((t) => t.tested > 0).length;
  const nbMaitrises = themes.filter((t) => t.maitrise).length;

  return {
    pdfId, coursId, themes,
    faiblesTestes: themes.filter((t) => t.tested > 0 && !t.maitrise),
    nonTestes: themes.filter((t) => t.tested === 0),
    resume: {
      nbThemes: themes.length,
      nbMaitrises,
      nbTestes,
      nbExamens: sessions.length,
      derniereNote: sorted.length ? Number(sorted[sorted.length - 1].score) : null,
      meilleureNote: notes.length ? Math.max(...notes) : null,
      moyenneNotes: notes.length ? Math.round((notes.reduce((a: number, b: number) => a + b, 0) / notes.length) * 10) / 10 : null,
      // Sortie de boucle : cours entièrement maîtrisé UNIQUEMENT si chaque thème est testé ET au seuil.
      coursMaitrise: themes.length > 0 && nbMaitrises === themes.length,
      derniereSessionId: sorted.length ? sorted[sorted.length - 1].id : null,
    },
  };
}

export interface CorrectionQuestion {
  position: number;
  type: string;
  difficulte: string;
  question: string;
  votre: string;
  bonne: string;
  explication: string;
  correcte: boolean;
  ratio: number;
  points: number;
  pointsMax: number;
}

/**
 * Correction DÉTAILLÉE d'une session (question par question : votre réponse vs
 * la bonne réponse + explication). Le corrigé n'est révélé que si la session est
 * SOUMISE (jamais pendant l'examen). Lu via service role (la banque des corrigés
 * n'est pas exposée au client).
 */
export async function getExamCorrection(
  db: Db, userId: string, sessionId: string
): Promise<{ note: number | null; documentId: string | null; submittedAt: string | null; questions: CorrectionQuestion[] }> {
  const { data: s } = await db.from('examen_sessions')
    .select('id, user_id, status, source_hash, composition, answers, score, document_id, submitted_at')
    .eq('id', sessionId).eq('user_id', userId).maybeSingle();
  if (!s) throw new Error('Session introuvable.');
  if (s.status !== 'submitted') throw new Error('La correction est disponible après la remise de l’examen.');

  const { data: pool } = await db.from('examen_question_pools').select('questions').eq('source_hash', s.source_hash).maybeSingle();
  const questions = (pool?.questions || []) as PoolQuestion[];
  const composition = (s.composition || []) as CompositionItem[];
  const answers = s.answers || {};
  const c = corriger(composition, questions, answers);

  const items: CorrectionQuestion[] = composition.map((it, pos) => {
    const q = questions[it.poolIndex];
    const res = c.parQuestion[pos];
    const fmt = q ? formatReponse(it, q, answers[String(pos)]) : { votre: '', bonne: '' };
    return {
      position: pos, type: it.type, difficulte: q?.difficulte || '', question: q?.question || '',
      votre: fmt.votre, bonne: fmt.bonne, explication: q?.explication || '',
      correcte: res?.correcte || false, ratio: res?.ratio || 0,
      points: res?.points ?? 0, pointsMax: res?.pointsMax ?? it.points,
    };
  });
  return { note: s.score === null || s.score === undefined ? null : Number(s.score), documentId: s.document_id, submittedAt: s.submitted_at, questions: items };
}

/** Historique des notes (tous documents) pour les vues de progression. */
export async function getExamHistory(db: Db, userId: string): Promise<
  { sessionId: string; documentId: string | null; mode: string; note: number | null; submittedAt: string }[]
> {
  const sessions = await getSubmittedSessions(db, userId);
  return sessions
    .sort((a: any, b: any) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
    .map((s: any) => ({
      sessionId: s.id, documentId: s.document_id, mode: s.mode,
      note: s.score === null || s.score === undefined ? null : Number(s.score),
      submittedAt: s.submitted_at,
    }));
}
