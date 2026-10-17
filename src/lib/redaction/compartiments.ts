/**
 * Rédaction juridique — référentiel partagé (client ET serveur, aucun secret ici).
 *
 * Trois compartiments. `type` est la valeur stockée dans `redactions.type` (libellés
 * historiques conservés : les copies existantes restent lisibles sans migration de données).
 */

export type CompartimentSlug = 'cas-pratique' | 'dissertation' | 'commentaire';

export interface Compartiment {
  slug: CompartimentSlug;
  type: 'Cas pratique' | 'Dissertation' | "Commentaire d'arrêt";
  label: string;          // titre de l'onglet
  singulier: string;      // « un cas pratique »
  description: string;
  /** Peut-on proposer des sujets à partir d'un cours ? (jamais pour un arrêt : pas de décision inventée) */
  sujetsDepuisCours: boolean;
  /** L'énoncé (faits, texte de la décision) est-il obligatoire ? */
  enonceRequis: boolean;
  enonceLabel: string;
  enoncePlaceholder: string;
  sujetPlaceholder: string;
  methode: { titre: string; etapes: { nom: string; detail: string }[] };
}

export const COMPARTIMENTS: Compartiment[] = [
  {
    slug: 'cas-pratique',
    type: 'Cas pratique',
    label: 'Cas pratiques',
    singulier: 'un cas pratique',
    description: 'Des faits, des problèmes de droit, une solution argumentée.',
    sujetsDepuisCours: true,
    enonceRequis: true,
    enonceLabel: 'Les faits du cas',
    enoncePlaceholder: 'Colle ici l’énoncé complet : les faits, les personnes, les dates, la question posée.',
    sujetPlaceholder: 'Ex. : Cas pratique — la vente conclue par un mineur',
    methode: {
      titre: 'Méthode du cas pratique',
      etapes: [
        { nom: 'Les faits utiles', detail: 'Résume les faits qui comptent juridiquement, sans les recopier.' },
        { nom: 'La qualification', detail: 'Traduis les faits en catégories juridiques : qui est qui, quel acte, quelle situation.' },
        { nom: 'Le problème de droit', detail: 'Pose chaque question juridique, en termes abstraits.' },
        { nom: 'La règle (majeure)', detail: 'Énonce la règle applicable, ses conditions et ses exceptions.' },
        { nom: 'L’application (mineure)', detail: 'Vérifie chaque condition au regard des faits, une par une.' },
        { nom: 'La solution', detail: 'Conclus clairement, et envisage l’hypothèse contraire si un fait est incertain.' },
      ],
    },
  },
  {
    slug: 'dissertation',
    type: 'Dissertation',
    label: 'Dissertations',
    singulier: 'une dissertation',
    description: 'Un sujet, une problématique, un plan en deux parties.',
    sujetsDepuisCours: true,
    enonceRequis: false,
    enonceLabel: 'Consignes (facultatif)',
    enoncePlaceholder: 'Consignes de ton enseignant : durée, documents autorisés, attentes particulières.',
    sujetPlaceholder: 'Ex. : La capacité juridique du mineur',
    methode: {
      titre: 'Méthode de la dissertation',
      etapes: [
        { nom: 'L’accroche', detail: 'Une entrée en matière liée au sujet : une citation, un fait, une évolution.' },
        { nom: 'Les définitions', detail: 'Définis chaque terme du sujet et délimite-le.' },
        { nom: 'L’intérêt du sujet', detail: 'Montre pourquoi la question compte, en droit et en pratique.' },
        { nom: 'La problématique', detail: 'La question précise à laquelle ta copie répond.' },
        { nom: 'L’annonce du plan', detail: 'Deux parties, deux sous-parties, titres qui répondent à la problématique.' },
        { nom: 'Le développement', detail: 'Chaque sous-partie argumente avec des règles et des exemples du cours, avec des transitions.' },
      ],
    },
  },
  {
    slug: 'commentaire',
    type: "Commentaire d'arrêt",
    label: 'Commentaires d’arrêt',
    singulier: 'un commentaire d’arrêt',
    description: 'Une décision à analyser : fiche d’arrêt, puis commentaire.',
    sujetsDepuisCours: false,
    enonceRequis: true,
    enonceLabel: 'Le texte de la décision',
    enoncePlaceholder: 'Colle ici le texte intégral de la décision donnée en TD (juridiction, date, attendus).',
    sujetPlaceholder: 'Ex. : Commentaire de l’arrêt du … (référence donnée par ton enseignant)',
    methode: {
      titre: 'Méthode du commentaire d’arrêt',
      etapes: [
        { nom: 'Les faits', detail: 'Ce qui s’est passé entre les parties, qualifié juridiquement.' },
        { nom: 'La procédure', detail: 'Les juridictions saisies et les décisions rendues avant celle-ci.' },
        { nom: 'Les prétentions', detail: 'Ce que soutient chaque partie devant la juridiction.' },
        { nom: 'Le problème de droit', detail: 'La question juridique tranchée par la décision.' },
        { nom: 'La solution', detail: 'Ce que décide la juridiction, et sur quel fondement.' },
        { nom: 'Le commentaire', detail: 'Plan en deux parties : le sens, la valeur et la portée de la décision.' },
      ],
    },
  },
];

export const COMPARTIMENT_BY_SLUG = new Map(COMPARTIMENTS.map((c) => [c.slug, c]));
export const COMPARTIMENT_BY_TYPE = new Map<string, Compartiment>(COMPARTIMENTS.map((c) => [c.type, c]));

export const LIMITS = {
  sujet: 300,
  enonce: 12000,
  copie: 20000,
  copieMinCorrection: 200, // caractères : en dessous, la correction n'a pas de sens
} as const;

/** Corrections par jour (la Rédaction est réservée au Premium). */
export const REDACTION_DAILY_LIMIT = 3;

export type ErreurCategorie = 'droit' | 'raisonnement' | 'methode' | 'formulation';

export const CATEGORIES: { key: ErreurCategorie; label: string; aide: string }[] = [
  { key: 'droit', label: 'Erreurs de droit', aide: 'Règle inexacte, condition oubliée, notion confondue.' },
  { key: 'raisonnement', label: 'Erreurs de raisonnement', aide: 'Syllogisme incomplet, conclusion qui ne découle pas des prémisses.' },
  { key: 'methode', label: 'Erreurs de méthode', aide: 'Structure attendue absente ou mal construite.' },
  { key: 'formulation', label: 'Erreurs de formulation', aide: 'Vocabulaire imprécis, phrase ambiguë, style.' },
];

/** Rapport de correction (format v2, produit par le worker). */
export interface RapportV2 {
  version: 2;
  note: number;
  appreciation: string;
  points_forts: string[];
  erreurs: { categorie: ErreurCategorie; extrait: string; probleme: string; conseil: string }[];
  priorites: string[];
  comparaison?: { evolution: string; progres: string[]; reste_a_travailler: string[] } | null;
  proposition: { titre: string; contenu: string[] };
  limites?: string;
}

export function isRapportV2(r: unknown): r is RapportV2 {
  return !!r && typeof r === 'object' && (r as { version?: number }).version === 2;
}

/** Nombre de mots (affichage). */
export const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
