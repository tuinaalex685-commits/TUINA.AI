/**
 * Dates affichées à l'identique côté serveur et côté navigateur.
 *
 * `toLocaleDateString()` sans paramètre dépend de la langue et du fuseau de la machine : le
 * serveur (Vercel, en anglais) et le navigateur de l'étudiant (en français) produisaient deux
 * textes différents → erreur d'hydratation React #418. Langue et fuseau sont donc fixés.
 */
const TZ = 'Africa/Ouagadougou';

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { timeZone: TZ });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
}
