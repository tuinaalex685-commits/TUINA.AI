/**
 * Comparaison d'emails sûre avec PostgREST.
 *
 * Les emails sont parfois enregistrés avec des majuscules (anciens codes d'accès), d'où l'usage
 * de `ilike`. Mais dans `ilike`, `_` et `%` sont des JOKERS : sans échappement, le compte
 * "a_b@x.com" correspondait aussi à "aXb@x.com" et pouvait hériter de son Premium.
 * Ce motif échappé donne une égalité exacte, insensible à la casse.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function exactEmailPattern(email: string | null | undefined): string {
  return normalizeEmail(email).replace(/[\\%_]/g, (c) => `\\${c}`);
}
