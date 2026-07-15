/**
 * Configuration de la MAÎTRISE PAR THÈME (INC.1).
 *
 * Le seuil est volontairement défini ici (et non dans la base) pour rester
 * ajustable SANS migration. Le score, lui, est calculé par la vue SQL
 * `theme_mastery` (voir database/theme_mastery.sql) selon la formule :
 *
 *   score = clamp(0..100,
 *       40 si forme validée
 *     + 60 si fond validé
 *     - min(20, 5 x (tentatives_forme + tentatives_fond)))
 *
 * Propriété : avec SEUIL = 70, un thème est « maîtrisé » dès que la forme ET le
 * fond sont validés (la pénalité de tentatives fait baisser le % affiché mais ne
 * prive jamais de la maîtrise) — cohérent avec un soft-gate, pas une sanction.
 */

/** Score minimal (0-100) à partir duquel un thème est considéré comme maîtrisé. */
export const SEUIL_MAITRISE = 70;

/** Vrai si le score de maîtrise atteint le seuil configuré. */
export function estMaitrise(score: number | null | undefined): boolean {
  return (score ?? 0) >= SEUIL_MAITRISE;
}
