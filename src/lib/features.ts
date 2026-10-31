/**
 * Fonctionnalités suspendues pour le lancement de SJP (décision du responsable, 31/10/2026).
 *
 * Rien n'est supprimé : code, tables, parcours enregistrés et corrections restent en place.
 * Pour réactiver, il suffit de repasser l'interrupteur à true et de redéployer.
 * Utilisable côté serveur comme côté navigateur (aucune dépendance serveur).
 */

/** Étude guidée : pages, actions, file IA et worker refusent tout tant que c'est false. */
export const ETUDE_GUIDEE_ACTIVE = false;

/** Catalogue des comptes gratuits (cours publiés par SJP) : « bientôt disponible » tant que false. */
export const CATALOGUE_FREE_ACTIF = false;

export const ETUDE_SUSPENDUE = 'Étude guidée : bientôt disponible.';
export const CATALOGUE_SUSPENDU = 'Catalogue : bientôt disponible.';

/** Jobs IA de l'Étude guidée (analyse du cours, leçons). */
export const estJobEtude = (type: string) => type.startsWith('etude3_');
