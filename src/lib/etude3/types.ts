/**
 * Études guidées v3 — types partagés (client et serveur) et version du moteur.
 *
 * ENGINE_VERSION fait partie de la clé de cache des contenus communs : l'incrémenter (nouveau
 * prompt, nouveau schéma, autre modèle) rend les anciens résultats incompatibles SANS les
 * effacer. Ils restent en base ; les étudiants concernés se voient proposer la nouvelle
 * version à la demande (E-05).
 */
export const ENGINE_VERSION = 'v4.2-lecons';

/**
 * Préfixe des identifiants d'activités de cette version (« l4a1 »…). Les tentatives et les
 * notions « À revoir » sont rangées par identifiant d'activité : un préfixe propre à la version
 * empêche qu'une réponse donnée dans l'ancien parcours compte dans le nouveau. À changer en
 * même temps que ENGINE_VERSION si le contenu des leçons change.
 */
export const ACTIVITE_PREFIXE = 'l42';

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
  | { type: 'scene'; titre: string; acteurs: Acteur[]; relations: { de: string; vers: string; action: string }[]; legende: string; questions?: { question: string; reponse: string }[] }
  | { type: 'comparaison'; titre: string; cotes: { titre: string; situation: string; consequence: string; valide?: boolean }[]; critere: string; legende: string }
  | { type: 'termes'; items: { terme: string; sens: string }[] }
  | { type: 'revele'; question: string; reponse: string }
  | { type: 'vraifaux'; affirmation: string; vrai: boolean; explication: string }
  | { type: 'memo'; items: string[] }
  | { type: 'incertitude'; texte: string };

/** Un personnage ou une institution d'une scène illustrée (dessinée par l'application, jamais inventée par une image). */
export interface Acteur {
  id: string;
  nom: string;
  role: string;
  genre: 'personne' | 'officier' | 'juge' | 'avocat' | 'institution' | 'groupe';
  sexe?: 'homme' | 'femme';
  dit?: string;          // courte réplique affichée dans une bulle
  etat?: 'oui' | 'non';  // ✓ accord, consentement… / ✗ refus, contrainte, vice…
  explication?: string;  // son rôle, affiché quand on touche le personnage
}

export interface SyntheseSection {
  id: string;
  titre: string;
  idee_centrale?: string;
  blocs: Bloc[];
}

/**
 * Synthèse v4 : une INTRODUCTION PÉDAGOGIQUE au cours, pas une réduction du cours.
 * Elle montre où l'on va (grandes questions, carte générale), explique chaque branche comme un
 * enseignant, et laisse le détail aux leçons.
 */
export interface BrancheSynthese {
  id: string;
  titre: string;
  idee: string;                 // l'idée principale
  simple: string;               // ce que cela veut dire, en mots simples
  liens: string;                // comment elle s'articule avec les autres branches
  exemple?: string;
  avant_de_commencer: string;   // ce qu'il faut avoir compris avant le parcours détaillé
  essentiel?: string[];         // le résumé de cette partie du cours : ce qu'il faut en retenir
  modules: string[];            // modules du parcours couverts (m1, m2…)
}

export interface Synthese {
  titre: string;
  presentation: string;         // ce que tu vas apprendre
  pourquoi: string;             // pourquoi cette matière compte
  questions: { question: string; reponse: string; ou: string }[];
  branches: BrancheSynthese[];
  carte: CarteMentale | null;
  pieges: string[];
  a_retenir: string[];
  a_approfondir: string[];
  /** v3 uniquement (lecture des anciennes synthèses). */
  sections?: SyntheseSection[];
  plan?: string[];
  fiche_memo?: string[];
}

/** Module pédagogique : une unité intellectuelle du cours (souvent un chapitre). */
export interface ModuleCours {
  id: string;
  titre: string;
  chemin: string[];
  pages: number[];
  idee_centrale: string;
  carte: CarteMentale | null;
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
  module?: string;        // v4 : module du cours (m1…)
  accroche?: string;      // v4 : la question concrète qui ouvre la leçon
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
      niveau?: NiveauActivite;
      explication_simple?: string;
      prerequis?: string;
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
      niveau?: NiveauActivite;
      explication_simple?: string;
      prerequis?: string;
    };

/** Les étapes d'une leçon v4, dans l'ordre où l'étudiant les découvre. */
export type CleEtape = 'comprendre' | 'formuler' | 'decomposer' | 'illustrer' | 'distinguer' | 'retenir';

/**
 * Progression d'une notion (exigence du responsable, 2026-10-29) : situation → idée simple →
 * définition et vocabulaire → décomposition du mécanisme → exemples → distinctions →
 * vérification → application → à retenir → validation. Les étapes de contenu sont ci-dessous ;
 * la situation est l'accroche, vérification et application sont les activités, la validation
 * est faite par le serveur. Une étape sans objet pour une notion est simplement omise.
 */
export const ETAPES: { cle: CleEtape; titre: string; sousTitre: string }[] = [
  { cle: 'comprendre', titre: 'Comprendre l’idée', sousTitre: 'Le problème et l’idée de fond, avec des mots simples' },
  { cle: 'formuler', titre: 'Les mots du droit', sousTitre: 'La définition du cours et le sens de chaque terme' },
  { cle: 'decomposer', titre: 'Le mécanisme pas à pas', sousTitre: 'Ses éléments, un par un, puis comment ils s’articulent' },
  { cle: 'illustrer', titre: 'Le voir en situation', sousTitre: 'Des exemples qui font découvrir le mécanisme' },
  { cle: 'distinguer', titre: 'Ne pas confondre', sousTitre: 'Les notions voisines et le piège du cours' },
  { cle: 'retenir', titre: 'À retenir pour l’examen', sousTitre: 'Ce que tu dois savoir restituer et expliquer' },
];

/** Niveau d'une vérification, du plus simple au niveau examen (difficulté croissante). */
export type NiveauActivite = 'comprendre' | 'distinguer' | 'appliquer' | 'examen';

export interface EtapeLecon {
  cle: CleEtape;
  blocs: Bloc[];
}

export interface Sequence {
  ordre: number;
  titre: string;
  objectif: string;
  /** v3 : contenu d'un seul tenant. v4 : vide, le contenu est dans `etapes`. */
  blocs: Bloc[];
  liens: string[];
  activites: Activite[];
  /** v4 : leçon guidée. */
  accroche?: { situation: string; question: string };
  etapes?: EtapeLecon[];
  savoir_expliquer?: string;
  suite?: string;
}

export interface NoeudCarte {
  id: string;
  label: string;
  type: 'notion' | 'regle' | 'condition' | 'exception' | 'consequence';
  parent?: string | null;
  /** Nature du lien avec le parent (« se divise en », « condition de », « s'oppose à »…). */
  lien?: string;
  /** Ce que recouvre ce nœud, en une ou deux phrases simples (affiché au clic). */
  explication?: string;
  /** Carte générale : module du parcours correspondant (m1…), pour naviguer vers sa carte. */
  module?: string;
}

export interface CarteMentale {
  centre: string;
  noeuds: NoeudCarte[];
}

export type Verdict = 'juste' | 'partiel' | 'faux';

/**
 * Ce que le NAVIGATEUR reçoit d'une activité : la consigne et les choix, jamais la bonne réponse,
 * les attendus ni les explications (sinon on lit la solution avant de répondre).
 */
export type ActivitePublique =
  | { id: string; type: 'choix'; notion: string; consigne: string; niveau?: NiveauActivite; choix: string[] }
  | { id: string; type: 'ouverte'; notion: string; consigne: string; niveau?: NiveauActivite };

export function versPublique(a: Activite): ActivitePublique {
  return a.type === 'choix'
    ? { id: a.id, type: 'choix', notion: a.notion, consigne: a.consigne, niveau: a.niveau, choix: a.choix }
    : { id: a.id, type: 'ouverte', notion: a.notion, consigne: a.consigne, niveau: a.niveau };
}

export interface RetourActivite {
  verdict: Verdict;
  message: string;
  manquants?: string[];
  autre_explication?: string;
  /** 2e erreur : la notion décomposée plus simplement, et le prérequis à revoir. */
  explication_simple?: string;
  prerequis?: string;
  /** QCM terminé (réussi ou après le dernier essai) : la bonne proposition, pour la surligner. */
  bonne_index?: number;
  bonne_reponse?: string;
  numero: number;
  aRevoir: boolean;
  termine: boolean;
}

/** Nombre de tentatives infructueuses après lequel la notion passe « À revoir » (E-04). */
export const MAX_TENTATIVES = 3;
