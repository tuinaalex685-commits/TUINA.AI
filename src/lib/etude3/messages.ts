/**
 * Messages d'erreur des études guidées, utilisables côté SERVEUR comme côté navigateur.
 * (Défini auparavant dans un composant « use client » : la page serveur qui l'appelait plantait
 * — « Attempted to call cleanError() from the server » — dès qu'une analyse avait échoué.)
 */

/** Message d'erreur lisible (le préfixe technique PDF_SCANNE est retiré). */
export const cleanError = (msg: string | null | undefined) =>
  String(msg || 'Le traitement n’a pas abouti.').replace(/^PDF_SCANNE:\s*/, '');
