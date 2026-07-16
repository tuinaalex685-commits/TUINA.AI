/**
 * MOTEUR D'EXAMEN — logique PURE et déterministe (EX.2).
 *
 * Aucune dépendance à Next/Supabase : entièrement testable hors ligne et
 * réutilisable côté serveur. Trois responsabilités, strictement séparées :
 *   1. composer()   : tire un examen depuis la banque (seedé → reproductible) ;
 *   2. vueEpuree()  : construit ce que le CLIENT reçoit — SANS AUCUN corrigé ;
 *   3. corriger()   : note côté serveur (barème pondéré + crédit partiel).
 *
 * Le corrigé (bonne réponse) ne transite JAMAIS par la vue épurée : c'est la
 * garantie anti-triche de la section Examen.
 */
import {
  ExamenQuestionType, EXAMEN_TYPES, POINTS_PAR_TYPE, COMPOSITION_STANDARD,
  COMPOSITION_ADAPTATIF, ADAPTATIF_PART_FAIBLES, MAITRISE_EXAMEN_ALPHA,
  dureeExamenSecondes,
} from '@/lib/config/examen';
import { estMaitrise } from '@/lib/config/mastery';

/** Une question telle que stockée dans examen_question_pools (contient le corrigé). */
export interface PoolQuestion {
  type: ExamenQuestionType;
  difficulte: string;
  section_ordre: number;
  theme_ordre: number;
  question: string;
  explication?: string;
  options?: string[];          // qcm
  correct?: number;            // qcm (index) | vrai_faux (0=Vrai,1=Faux)
  reponses_trous?: string[];   // trous
  paires?: { gauche: string; droite: string }[]; // association
  elements_ordonnes?: string[];// classement (ordre CORRECT)
}

/** Entrée de composition : référence dans la banque + ordre d'affichage seedé (jamais le corrigé). */
export interface CompositionItem {
  poolIndex: number;
  type: ExamenQuestionType;
  section_ordre: number;
  theme_ordre: number;
  points: number;
  // Ordres d'affichage (mélangés) — présentation stable au reload, ne révèlent aucun corrigé :
  optionsAffichees?: string[]; // qcm : options mélangées
  droitesAffichees?: string[]; // association : colonne droite mélangée
  elementsAffiches?: string[]; // classement : éléments mélangés
}

// --- RNG déterministe (mulberry32) : même seed → même examen (variantes reproductibles) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Normalisation robuste pour comparer des réponses texte (casse, accents, espaces, ponctuation). */
export function normText(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Compose un examen STANDARD depuis la banque. Déterministe pour un seed donné.
 * Nombre FIXE de questions par type → points_max constant → notes comparables.
 * Best-effort si la banque manque de questions d'un type (prend ce qui existe).
 */
export function composerStandard(pool: PoolQuestion[], seed: number): CompositionItem[] {
  return composer(pool, seed, COMPOSITION_STANDARD);
}

/** Clé positionnelle d'un thème (identique dans tous les clones d'un contenu). */
export const keyOf = (sectionOrdre: number, themeOrdre: number) => `${sectionOrdre}:${themeOrdre}`;

// Construit un item de composition depuis une question du pool (+ mélanges d'affichage seedés).
function buildItem(pool: PoolQuestion[], i: number, rng: () => number): CompositionItem {
  const q = pool[i];
  const item: CompositionItem = {
    poolIndex: i, type: q.type, section_ordre: q.section_ordre, theme_ordre: q.theme_ordre,
    points: POINTS_PAR_TYPE[q.type],
  };
  if (q.type === 'qcm' && q.options) item.optionsAffichees = shuffled(q.options, rng);
  if (q.type === 'association' && q.paires) item.droitesAffichees = shuffled(q.paires.map((p) => p.droite), rng);
  if (q.type === 'classement' && q.elements_ordonnes) item.elementsAffiches = shuffled(q.elements_ordonnes, rng);
  return item;
}

export function composer(
  pool: PoolQuestion[], seed: number, counts: Partial<Record<ExamenQuestionType, number>>
): CompositionItem[] {
  const rng = mulberry32(seed);
  const items: CompositionItem[] = [];
  for (const type of EXAMEN_TYPES) {
    const want = counts[type] || 0;
    if (want <= 0) continue;
    const candidates = pool.map((q, i) => ({ q, i })).filter((x) => x.q.type === type);
    for (const { i } of shuffled(candidates, rng).slice(0, want)) items.push(buildItem(pool, i, rng));
  }
  // Ordre de présentation global mélangé (mais points_max inchangé).
  return shuffled(items, rng);
}

// --- EX.3 : maîtrise examen (EMA) --------------------------------------------
export interface SessionThemeResults {
  submitted_at: string;
  theme_results: { section_ordre: number; theme_ordre: number; ratio: number }[];
}
export interface ThemeExamMastery {
  section_ordre: number;
  theme_ordre: number;
  score: number;   // 0..100 (EMA des ratios de réussite), null-équivalent si tested=0
  tested: number;  // nombre de passages ayant couvert ce thème
}

/**
 * Maîtrise examen par thème = EMA des scores de réussite, calculée depuis TOUT
 * l'historique des sessions soumises (jamais stockée). Un thème jamais testé
 * n'apparaît pas (→ à considérer comme prioritaire par l'appelant).
 */
export function computeExamMastery(
  sessions: SessionThemeResults[], alpha = MAITRISE_EXAMEN_ALPHA
): Record<string, ThemeExamMastery> {
  const ordered = sessions.slice().sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const acc: Record<string, ThemeExamMastery> = {};
  for (const s of ordered) {
    for (const tr of s.theme_results || []) {
      const key = keyOf(tr.section_ordre, tr.theme_ordre);
      const score = Math.max(0, Math.min(100, (Number(tr.ratio) || 0) * 100));
      const prev = acc[key];
      acc[key] = {
        section_ordre: tr.section_ordre, theme_ordre: tr.theme_ordre,
        score: prev ? alpha * score + (1 - alpha) * prev.score : score,
        tested: (prev?.tested || 0) + 1,
      };
    }
  }
  for (const k of Object.keys(acc)) acc[k].score = Math.round(acc[k].score * 10) / 10;
  return acc;
}

/** Un thème est FAIBLE pour l'adaptatif s'il est jamais testé OU sous le seuil de maîtrise. */
export function estThemeFaible(examMastery: Record<string, ThemeExamMastery>, key: string): boolean {
  const m = examMastery[key];
  return !m || m.tested === 0 || !estMaitrise(m.score);
}

/**
 * Composition ADAPTATIVE : ~ADAPTATIF_PART_FAIBLES des questions tirées des
 * thèmes faibles (jamais testés ou sous le seuil), le reste en consolidation.
 * Déterministe (seed). Best-effort si la banque manque de questions d'un profil.
 */
export function composerAdaptatif(
  pool: PoolQuestion[], seed: number, examMastery: Record<string, ThemeExamMastery>,
  counts: Partial<Record<ExamenQuestionType, number>> = COMPOSITION_ADAPTATIF,
  partFaibles = ADAPTATIF_PART_FAIBLES
): CompositionItem[] {
  const rng = mulberry32(seed);
  const items: CompositionItem[] = [];
  for (const type of EXAMEN_TYPES) {
    const want = counts[type] || 0;
    if (want <= 0) continue;
    const candidates = pool.map((q, i) => ({ q, i })).filter((x) => x.q.type === type);
    const faibles = shuffled(candidates.filter((x) => estThemeFaible(examMastery, keyOf(x.q.section_ordre, x.q.theme_ordre))), rng);
    const forts = shuffled(candidates.filter((x) => !estThemeFaible(examMastery, keyOf(x.q.section_ordre, x.q.theme_ordre))), rng);
    const nFaible = Math.min(faibles.length, Math.round(want * partFaibles));
    const picked = faibles.slice(0, nFaible);
    // Complète avec les forts puis, si besoin, le reste des faibles (best-effort, jamais de doublon).
    const reste = [...forts, ...faibles.slice(nFaible)];
    picked.push(...reste.slice(0, Math.max(0, want - picked.length)));
    for (const { i } of picked) items.push(buildItem(pool, i, rng));
  }
  return shuffled(items, rng);
}

/** Compte des questions par type dans une composition (pour la durée). */
export function countsParType(composition: CompositionItem[]): Partial<Record<ExamenQuestionType, number>> {
  const c: Partial<Record<ExamenQuestionType, number>> = {};
  for (const it of composition) c[it.type] = (c[it.type] || 0) + 1;
  return c;
}
export function dureeSecondes(composition: CompositionItem[]): number {
  return dureeExamenSecondes(countsParType(composition));
}
export function pointsMax(composition: CompositionItem[]): number {
  return composition.reduce((s, it) => s + it.points, 0);
}

/** Une question telle que reçue par le CLIENT : énoncé + éléments à manipuler, ZÉRO corrigé. */
export interface VueQuestion {
  position: number;
  type: ExamenQuestionType;
  difficulte: string;
  question: string;
  options?: string[];       // qcm : options mélangées
  gauches?: string[];       // association : intitulés à apparier (ordre fixe)
  droites?: string[];       // association : choix mélangés
  elements?: string[];      // classement : éléments à ordonner (mélangés)
  nbTrous?: number;         // trous : nombre de champs à remplir
}

/** Construit la vue client. LÈVE si un corrigé risquait de fuiter (garde-fou explicite). */
export function vueEpuree(composition: CompositionItem[], pool: PoolQuestion[]): VueQuestion[] {
  return composition.map((it, position) => {
    const q = pool[it.poolIndex];
    if (!q) throw new Error(`Vue épurée : question ${it.poolIndex} absente de la banque.`);
    const base: VueQuestion = { position, type: it.type, difficulte: q.difficulte, question: q.question };
    if (it.type === 'qcm') base.options = it.optionsAffichees || q.options || [];
    else if (it.type === 'vrai_faux') base.options = ['Vrai', 'Faux'];
    else if (it.type === 'trous') base.nbTrous = (q.reponses_trous || []).length;
    else if (it.type === 'association') {
      base.gauches = (q.paires || []).map((p) => p.gauche);
      base.droites = it.droitesAffichees || (q.paires || []).map((p) => p.droite);
    } else if (it.type === 'classement') {
      base.elements = it.elementsAffiches || q.elements_ordonnes || [];
    }
    return base;
  });
}

/** Résultat de correction d'UNE question. */
export interface ResultatQuestion {
  position: number;
  type: ExamenQuestionType;
  section_ordre: number;
  theme_ordre: number;
  points: number;        // points obtenus (crédit partiel possible)
  pointsMax: number;
  ratio: number;         // 0..1
  correcte: boolean;     // ratio === 1
}

/** Correction d'une question (crédit partiel déterministe pour trous/association/classement). */
function corrigerQuestion(it: CompositionItem, q: PoolQuestion, rep: any): number {
  switch (it.type) {
    case 'qcm': {
      if (typeof q.correct !== 'number' || !q.options) return 0;
      const bonne = q.options[q.correct];
      // Réponse client = valeur de l'option choisie (robuste au mélange d'affichage).
      return normText(rep) && normText(rep) === normText(bonne) ? 1 : 0;
    }
    case 'vrai_faux': {
      const r = Number(rep);
      return (r === 0 || r === 1) && r === q.correct ? 1 : 0;
    }
    case 'trous': {
      const attendu = q.reponses_trous || [];
      if (attendu.length === 0) return 0;
      const arr = Array.isArray(rep) ? rep : [];
      let ok = 0;
      for (let i = 0; i < attendu.length; i++) if (normText(arr[i]) && normText(arr[i]) === normText(attendu[i])) ok++;
      return ok / attendu.length;
    }
    case 'association': {
      const paires = q.paires || [];
      if (paires.length === 0) return 0;
      // Réponse client = pour chaque gauche (dans l'ordre du pool), la droite choisie (valeur).
      const arr = Array.isArray(rep) ? rep : [];
      let ok = 0;
      for (let i = 0; i < paires.length; i++) if (normText(arr[i]) === normText(paires[i].droite)) ok++;
      return ok / paires.length;
    }
    case 'classement': {
      const attendu = q.elements_ordonnes || [];
      if (attendu.length === 0) return 0;
      const arr = Array.isArray(rep) ? rep : [];
      let ok = 0;
      for (let i = 0; i < attendu.length; i++) if (normText(arr[i]) === normText(attendu[i])) ok++;
      return ok / attendu.length;
    }
    default:
      return 0;
  }
}

export interface Correction {
  points: number;
  pointsMax: number;
  note: number; // /20, au demi-point
  parQuestion: ResultatQuestion[];
  parTheme: { section_ordre: number; theme_ordre: number; points: number; pointsMax: number; ratio: number }[];
}

/** Corrige tout l'examen. `reponses` = map position → réponse client (positions manquantes = 0). */
export function corriger(
  composition: CompositionItem[], pool: PoolQuestion[], reponses: Record<string, any>
): Correction {
  const parQuestion: ResultatQuestion[] = [];
  const themeAgg = new Map<string, { section_ordre: number; theme_ordre: number; points: number; pointsMax: number }>();
  let total = 0, totalMax = 0;

  composition.forEach((it, position) => {
    const q = pool[it.poolIndex];
    const ratio = q ? corrigerQuestion(it, q, reponses[String(position)]) : 0;
    const pts = Math.round(ratio * it.points * 100) / 100;
    parQuestion.push({
      position, type: it.type, section_ordre: it.section_ordre, theme_ordre: it.theme_ordre,
      points: pts, pointsMax: it.points, ratio, correcte: ratio === 1,
    });
    total += pts; totalMax += it.points;
    const key = `${it.section_ordre}:${it.theme_ordre}`;
    const agg = themeAgg.get(key) || { section_ordre: it.section_ordre, theme_ordre: it.theme_ordre, points: 0, pointsMax: 0 };
    agg.points += pts; agg.pointsMax += it.points;
    themeAgg.set(key, agg);
  });

  const note = totalMax > 0 ? Math.round((total / totalMax) * 20 * 2) / 2 : 0;
  const parTheme = [...themeAgg.values()].map((a) => ({
    ...a, ratio: a.pointsMax > 0 ? a.points / a.pointsMax : 0,
  }));
  return { points: Math.round(total * 100) / 100, pointsMax: totalMax, note, parQuestion, parTheme };
}
