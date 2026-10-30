/**
 * Messages d'erreur des études guidées, utilisables côté SERVEUR comme côté navigateur.
 * (Défini auparavant dans un composant « use client » : la page serveur qui l'appelait plantait
 * — « Attempted to call cleanError() from the server » — dès qu'une analyse avait échoué.)
 */

/** Message d'erreur lisible (le préfixe technique PDF_SCANNE est retiré). */
export const cleanError = (msg: string | null | undefined) => {
  const m = String(msg || 'Le traitement n’a pas abouti.').replace(/^PDF_SCANNE:\s*/, '');
  // Erreur technique du service d'IA (délai dépassé, surcharge, réponse illisible) : un message
  // compréhensible, sans le détail interne de Google.
  if (/gemini|deadline|overloaded|\b50[0-4]\b|unavailable|rpc|json|schema|invalide/i.test(m)) {
    return 'Le service d’IA a mis trop de temps à répondre ou est momentanément surchargé. Réessaie dans une minute : ce qui est déjà fait est conservé.';
  }
  return m;
};
