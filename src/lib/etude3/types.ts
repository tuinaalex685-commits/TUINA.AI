/**
 * Études guidées v3 — types partagés (client et serveur) et version du moteur.
 *
 * ENGINE_VERSION fait partie de la clé de cache des contenus communs : l'incrémenter (nouveau
 * prompt, nouveau schéma, autre modèle) rend les anciens résultats incompatibles SANS les
 * effacer. Ils restent en base ; les étudiants concernés se voient proposer la nouvelle
 * version à la demande (E-05).
 */
export const ENGINE_VERSION = 'v3.0-flash-2.5';

export type Origine = 'cours' | 'explication' | 'complement';

export type Bloc =
  | { type: 'titre'; texte: string }
  | { type: 'paragraphe'; texte: string; origine?: Origine; pages?: number[] }
  | { type: 'definition'; terme: string; definition: string; reformulation?: string; origine?: Origine; pages?: number[] }
  | { type: 'exemple'; titre?: string; texte: string }
  | { type: 'piege'; texte: string }
  | { type: 'attention'; texte: string }
  | { type: 'tableau'; titre: string; colonnes: string[]; lignes: string[][]; legende?: string }
  | { type: 'arbre'; titre: string; question: string; branches: { condition: string; resultat: string }[]; legende?: string }
  | { type: 'processus'; titre: string; etapes: { nom: string; detail: string }[]; legende?: string }
  | { type: 'frise'; titre: string; jalons: { date: string; evenement: string }[]; legende?: string }
  | { type: 'liste'; titre?: string; items: string[] }
  | { type: 'memo'; items: string[] }
  | { type: 'incertitude'; texte: string };

export interface SyntheseSection {
  id: string;
  titre: string;
  idee_centrale?: string;
  blocs: Bloc[];
}

export interface Synthese {
  titre: string;
  presentation: string;
  plan: string[];
  sections: SyntheseSection[];
  fiche_memo: string[];
  a_approfondir: string[];
}

export interface Couverture {
  pages_total: number;
  pages_lues: number;
  pages_vides: number[];
  caracteres: number;
  tronque: boolean;
}

export interface PlanSequence {
  ordre: number;
  titre: string;
  objectif: string;
  notions: string[];
  pages: number[];
}

export type Activite =
  | {
      id: string;
      type: 'choix';
      notion: string;
      consigne: string;
      choix: string[];
      bonne: number;
      explication: string;
      pourquoi_faux: string[];
      autre_explication: string;
    }
  | {
      id: string;
      type: 'ouverte';
      notion: string;
      consigne: string;
      attendus: string[];
      erreurs_typiques: string[];
      reponse_modele: string;
      autre_explication: string;
    };

export interface Sequence {
  ordre: number;
  titre: string;
  objectif: string;
  blocs: Bloc[];
  liens: string[];
  activites: Activite[];
}

export interface NoeudCarte {
  id: string;
  label: string;
  type: 'notion' | 'regle' | 'condition' | 'exception' | 'consequence';
  parent?: string | null;
}

export interface CarteMentale {
  centre: string;
  noeuds: NoeudCarte[];
}

export type Verdict = 'juste' | 'partiel' | 'faux';

export interface RetourActivite {
  verdict: Verdict;
  message: string;
  manquants?: string[];
  autre_explication?: string;
  bonne_reponse?: string;
  numero: number;
  aRevoir: boolean;
  termine: boolean;
}

/** Nombre de tentatives infructueuses après lequel la notion passe « À revoir » (E-04). */
export const MAX_TENTATIVES = 3;
