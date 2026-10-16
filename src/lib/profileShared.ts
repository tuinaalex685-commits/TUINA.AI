/**
 * Constantes de profil partagées entre serveur et navigateur (aucun accès base ici).
 * Doit rester aligné avec la table `niveaux` et la contrainte CHECK de `profiles.source_decouverte`.
 */

export const NIVEAUX = [
  { code: 'l1', libelle: 'Licence 1', court: 'L1' },
  { code: 'l2', libelle: 'Licence 2', court: 'L2' },
] as const;

export type NiveauCode = (typeof NIVEAUX)[number]['code'];

export const SOURCES = [
  { code: 'ami', libelle: 'Par un ami' },
  { code: 'groupe_etudiant', libelle: 'Par un groupe d’étudiants' },
  { code: 'reseaux_sociaux', libelle: 'Sur les réseaux sociaux' },
  { code: 'enseignant', libelle: 'Par un enseignant' },
  { code: 'autre', libelle: 'Autrement' },
] as const;

export type SourceCode = (typeof SOURCES)[number]['code'];

export function isNiveau(v: unknown): v is NiveauCode {
  return typeof v === 'string' && NIVEAUX.some((n) => n.code === v);
}

export function isSource(v: unknown): v is SourceCode {
  return typeof v === 'string' && SOURCES.some((s) => s.code === v);
}

export function niveauLabel(code: string | null | undefined): string | null {
  return NIVEAUX.find((n) => n.code === code)?.court ?? null;
}

/** Un cours du catalogue est-il proposé à ce niveau ? (cours sans niveau = tous les niveaux) */
export function catalogVisibleFor(courseNiveau: string | null | undefined, userNiveau: string | null): boolean {
  return !courseNiveau || !userNiveau || courseNiveau === userNiveau;
}
