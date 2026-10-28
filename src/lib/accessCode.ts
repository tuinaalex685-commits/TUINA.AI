/**
 * Règles PURES des codes d'accès (aucune dépendance : testées par `node --test`).
 *
 * Un code est saisi à la main, souvent sur mobile : le clavier met une majuscule en tête,
 * ajoute une espace finale, et l'étudiant recopie « O » pour « 0 ». La comparaison était
 * EXACTE et sensible à la casse : 5 des 9 codes de production contiennent des minuscules,
 * donc « Code non valide » pour un code pourtant juste. On compare désormais sans tenir
 * compte de la casse ni des espaces (la confusion O/0 reste volontairement refusée : elle
 * augmenterait l'espace de devinette).
 */

/** Forme de comparaison : sans espaces (début, fin, milieu), en majuscules. */
export function normalizeAccessCode(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Saisie plausible (avant toute requête) : évite d'interroger la base pour du bruit. */
export function isPlausibleAccessCode(raw: unknown): boolean {
  const c = normalizeAccessCode(raw);
  return c.length >= 4 && c.length <= 100;
}

/**
 * Un code donne le Premium s'il est 'active' ET non expiré. L'expiration est DÉRIVÉE à la
 * lecture : à la date prévue, l'étudiant redevient Free à sa requête suivante, sans tâche
 * planifiée. L'administrateur réactive le code → nouvelle période d'un mois.
 */
export function isCodeCurrentlyActive(c: { status: string; expires_at?: string | null }, now = Date.now()): boolean {
  if (c.status !== 'active') return false;
  if (!c.expires_at) return true; // code non encore daté (avant migration) : comportement historique
  return new Date(c.expires_at).getTime() > now;
}
