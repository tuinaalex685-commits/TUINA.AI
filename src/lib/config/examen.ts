/**
 * Configuration de la SECTION EXAMEN — EX.1 : banque de questions.
 *
 * Comme pour la maîtrise (src/lib/config/mastery.ts), tout paramètre pédagogique
 * vit ici en TypeScript pour rester ajustable SANS migration. La banque est
 * générée UNE SEULE FOIS par contenu (mutualisée par source_hash) ; sa taille et
 * sa composition sont donc des choix de génération, pas des colonnes en base.
 *
 * Décisions figées (conception 2026-07-15) :
 * - banque de 24-30 questions (extensible plus tard : régénérer = 1 appel Gemini) ;
 * - difficulté taguée par Gemini à la génération puis FIGÉE (l'app ne fait que lire) ;
 * - les questions référencent les thèmes par clé positionnelle (section_ordre,
 *   theme_ordre) car les theme_id ne sont PAS partagés entre utilisateurs (clones).
 */

/** Types de questions auto-corrigeables (phase 1 — aucune correction IA). */
export type ExamenQuestionType = 'qcm' | 'vrai_faux' | 'trous' | 'association' | 'classement';

export type ExamenDifficulte = 'facile' | 'moyen' | 'difficile';

export const EXAMEN_TYPES: ExamenQuestionType[] = ['qcm', 'vrai_faux', 'trous', 'association', 'classement'];
export const EXAMEN_DIFFICULTES: ExamenDifficulte[] = ['facile', 'moyen', 'difficile'];

/** Composition cible de la banque par type (total = taille de la banque). */
export const BANQUE_REPARTITION_TYPES: Record<ExamenQuestionType, number> = {
  qcm: 8,
  vrai_faux: 6,
  trous: 5,
  association: 4,
  classement: 4,
};

/** Taille cible de la banque (dérivée de la répartition : 27, dans la fourchette validée 24-30). */
export const TAILLE_BANQUE = Object.values(BANQUE_REPARTITION_TYPES).reduce((a, b) => a + b, 0);

/** Répartition cible des difficultés dans la banque (guide la génération). */
export const BANQUE_REPARTITION_DIFFICULTE: Record<ExamenDifficulte, number> = {
  facile: 0.4,
  moyen: 0.4,
  difficile: 0.2,
};

/**
 * Nombre minimal de questions VALIDES pour accepter une banque. La validation
 * serveur écarte les questions malformées une à une ; sous ce seuil, la banque
 * est refusée (erreur permanente du job → jamais d'examen bancal en cache).
 */
export const BANQUE_MIN_QUESTIONS_VALIDES = 18;

// ============================================================================
// EX.2 : DÉROULÉ D'UN EXAMEN (composition, barème, durée)
// Tout est en config TS → ajustable sans migration. La composition FIXE par type
// garantit un points_max IDENTIQUE entre toutes les variantes → notes comparables
// entre étudiants et entre passages (décision figée, barème pondéré simple).
// ============================================================================

/** Barème PONDÉRÉ par type (défaut figé). Un vrai/faux ne vaut pas un classement. */
export const POINTS_PAR_TYPE: Record<ExamenQuestionType, number> = {
  qcm: 1,
  vrai_faux: 0.5,
  trous: 1,
  association: 1.5,
  classement: 1.5,
};

/** Budget temps indicatif par question (secondes) → durée d'examen AUTO-CALCULÉE. */
export const TEMPS_PAR_TYPE_S: Record<ExamenQuestionType, number> = {
  qcm: 75,
  vrai_faux: 45,
  trous: 60,
  association: 90,
  classement: 90,
};

/** Composition d'un examen STANDARD : nombre de questions par type (total = 15). */
export const COMPOSITION_STANDARD: Record<ExamenQuestionType, number> = {
  qcm: 5,
  vrai_faux: 4,
  trous: 3,
  association: 2,
  classement: 1,
};

/** Note maximale d'un examen. */
export const NOTE_MAX = 20;

/** Durée (secondes) calculée depuis une composition (compte par type). Arrondie à la minute sup. */
export function dureeExamenSecondes(countsParType: Partial<Record<ExamenQuestionType, number>>): number {
  let s = 0;
  for (const t of EXAMEN_TYPES) s += (countsParType[t] || 0) * TEMPS_PAR_TYPE_S[t];
  return Math.ceil(s / 60) * 60;
}

// ============================================================================
// EX.3 : MAÎTRISE EXAMEN (par thème) + composition ADAPTATIVE
// ============================================================================

/**
 * Lissage exponentiel (EMA) de la maîtrise examen d'un thème : les passages
 * récents pèsent davantage sans effacer l'historique. α ∈ ]0,1] configurable.
 *   maîtrise = α·score_récent + (1-α)·maîtrise_précédente  (1er passage = score)
 * α=0.5 → le dernier passage compte pour moitié, l'avant-dernier pour un quart…
 * Une réussite chanceuse isolée ne suffit pas à franchir le seuil ; une
 * régression fait redescendre progressivement. Jamais stockée : recalculée
 * depuis l'historique des sessions (aucune dérive possible).
 */
export const MAITRISE_EXAMEN_ALPHA = 0.5;

/** Composition d'un examen ADAPTATIF (total = 10) : plus court, ciblé sur les faiblesses. */
export const COMPOSITION_ADAPTATIF: Record<ExamenQuestionType, number> = {
  qcm: 4,
  vrai_faux: 2,
  trous: 2,
  association: 1,
  classement: 1,
};

/** Part des questions d'un examen adaptatif tirées des thèmes SOUS le seuil (le reste = consolidation). */
export const ADAPTATIF_PART_FAIBLES = 0.7;
