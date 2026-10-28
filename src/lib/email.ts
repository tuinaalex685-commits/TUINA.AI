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

/**
 * `*` aussi : PostgREST le traduit en `%` dans les filtres like/ilike. Non échappé, une adresse
 * « *@gmail.com » (valide selon la norme) correspondait à TOUS les comptes Gmail : Premium
 * d'un autre étudiant, ou purge admin de leurs codes. Échappé, il devient un `%` littéral.
 */
export function exactEmailPattern(email: string | null | undefined): string {
  return normalizeEmail(email).replace(/[\\%_*]/g, (c) => `\\${c}`);
}

/** Caractères d'adresse acceptés par la norme mais interdits ici (jokers de recherche, aucun usage réel). */
export function hasWildcardChars(email: string | null | undefined): boolean {
  return /[*%]/.test(email || '');
}
