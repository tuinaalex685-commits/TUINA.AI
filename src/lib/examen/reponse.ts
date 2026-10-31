// Les textes sont des options de la banque (générées) : bornés large, et le total aussi.
const MAX_TEXTE_REPONSE = 2000;
const MAX_ELEMENTS_REPONSE = 30;
const MAX_TOTAL_REPONSE = 8000;
const texteCourt = (v: unknown) => typeof v === 'string' && v.length <= MAX_TEXTE_REPONSE;

/**
 * Forme d'une réponse d'examen acceptée : null (effacée), un nombre (vrai/faux), un texte court
 * (QCM) ou une liste courte de textes (trous, association, classement), à une position qui existe
 * dans la composition. Tout le reste est refusé : sans cette borne, un appel direct de l'action
 * pouvait écrire ~1 Mo par position, à n'importe quelle position, dans la session.
 */
export function reponseExamenValide(position: unknown, answer: unknown, nbQuestions: number): boolean {
  if (!Number.isInteger(position) || (position as number) < 0 || (position as number) >= nbQuestions) return false;
  if (answer === null || answer === undefined) return true;
  if (typeof answer === 'number') return Number.isFinite(answer);
  if (Array.isArray(answer)) {
    return answer.length <= MAX_ELEMENTS_REPONSE && answer.every((x) => x === null || texteCourt(x))
      && JSON.stringify(answer).length <= MAX_TOTAL_REPONSE;
  }
  return texteCourt(answer);
}
