/**
 * Messages d'erreur des études guidées, utilisables côté SERVEUR comme côté navigateur.
 * (Défini auparavant dans un composant « use client » : la page serveur qui l'appelait plantait
 * — « Attempted to call cleanError() from the server » — dès qu'une analyse avait échoué.)
 */

/**
 * Message d'erreur lisible (le préfixe technique PDF_SCANNE est retiré), sans le détail interne
 * de Google, et propre à chaque cause. Avant, toute erreur contenant « gemini », « json » ou
 * « schema » devenait « trop de temps / surchargé », y compris une réponse coupée ou une requête
 * refusée : l'étudiant réessayait pour rien (constaté le 31/10/2026).
 */
export const cleanError = (msg: string | null | undefined) => {
  const m = String(msg || 'Le traitement n’a pas abouti.').replace(/^PDF_SCANNE:\s*/, '');
  // Réponse coupée ou JSON incomplet : réessayer redonne le même résultat, le défaut est chez SJP.
  if (/coupée|unterminated|format illisible/i.test(m)) {
    return 'La leçon préparée par l’IA est arrivée incomplète. Ce n’est pas de ton fait : le problème est enregistré pour être corrigé par SJP.';
  }
  // Requête refusée par Google (400) : configuration de SJP.
  if (/"code":\s*400|\b400\b.*(invalid|argument|schema)|invalid_argument/i.test(m)) {
    return 'Le service d’IA a refusé la demande de SJP. Ce n’est pas de ton fait : le problème est enregistré pour être corrigé par SJP.';
  }
  // Quota ou crédit de l'IA épuisé.
  if (/\b429\b|quota|rate limit|resource_exhausted|credit|depleted|billing/i.test(m)) {
    return 'Le service d’IA de SJP a atteint sa limite d’utilisation pour le moment. Réessaie un peu plus tard : ce qui est déjà fait est conservé.';
  }
  // Délai dépassé ou surcharge chez Google : là, réessayer peut suffire.
  if (/gemini|deadline|timeout|overloaded|\b50[0-4]\b|unavailable|rpc|json|schema|invalide/i.test(m)) {
    return 'Le service d’IA a mis trop de temps à répondre ou est momentanément surchargé. Réessaie dans une minute : ce qui est déjà fait est conservé.';
  }
  return m;
};
