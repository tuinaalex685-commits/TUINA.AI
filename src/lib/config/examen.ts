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
