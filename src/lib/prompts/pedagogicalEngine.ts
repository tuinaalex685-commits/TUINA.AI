import { Type, Schema } from '@google/genai';

export const PRE_ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    langue_principale: { type: Type.STRING },
    discipline_juridique: { type: Type.STRING },
    pays_systeme_juridique: { type: Type.STRING },
    type_document: { 
      type: Type.STRING, 
      description: "Ex: Cours magistral, Fiche de TD, Dissertation juridique, Cas pratique, Commentaire d'arrêt, Jurisprudence, Anglais juridique, Code annoté, etc." 
    },
    niveau_universitaire: { type: Type.STRING },
    difficulte: { type: Type.STRING },
    structure_document: { type: Type.STRING },
    objectifs_pedagogiques: { type: Type.ARRAY, items: { type: Type.STRING } },
    competences_visees: { type: Type.ARRAY, items: { type: Type.STRING } },
    notions_fondamentales: { type: Type.ARRAY, items: { type: Type.STRING } },
    notions_secondaires: { type: Type.ARRAY, items: { type: Type.STRING } },
    exceptions: { type: Type.ARRAY, items: { type: Type.STRING } },
    distinctions_importantes: { type: Type.ARRAY, items: { type: Type.STRING } },
    notions_frequemment_confondues: { type: Type.ARRAY, items: { type: Type.STRING } },
    pieges_classiques: { type: Type.ARRAY, items: { type: Type.STRING } },
    erreurs_etudiantes_frequentes: { type: Type.ARRAY, items: { type: Type.STRING } },
    raisonnements_juridiques_indispensables: { type: Type.ARRAY, items: { type: Type.STRING } },
    articles_essentiels: { type: Type.ARRAY, items: { type: Type.STRING } },
    jurisprudences_importantes: { type: Type.ARRAY, items: { type: Type.STRING } },
    concepts_evalues_examen: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: [
    "langue_principale", "discipline_juridique", "type_document", "notions_fondamentales", 
    "pieges_classiques", "erreurs_etudiantes_frequentes", "raisonnements_juridiques_indispensables"
  ]
};

export function getPreAnalysisPrompt(documentText: string): string {
  return `Tu es un Professeur d'université de très haut niveau et un expert en pédagogie juridique. 
Ton rôle est d'analyser en profondeur le document fourni pour en extraire l'essence pédagogique, avant toute tentative d'enseignement.
Ne génère PAS de cours. Analyse simplement le contenu avec une précision chirurgicale pour remplir la grille d'intelligence pédagogique.

Directives :
1. Identifie précisément la langue, la discipline, et le type exact du document (ex: Cours magistral, Fiche de TD, Dissertation, Cas pratique, Commentaire d'arrêt, Décision de justice, etc.).
2. Dégage les notions fondamentales et secondaires.
3. Identifie les pièges classiques, les erreurs fréquentes des étudiants et les confusions possibles sur ce sujet spécifique.
4. Identifie les raisonnements juridiques indispensables (ex: syllogisme, qualification juridique, etc.).
5. Fais preuve d'une rigueur académique absolue. N'invente pas de jurisprudence ou d'articles de loi s'ils ne s'appliquent pas.

Voici le document brut :

${documentText}
`;
}

export function getPedagogicalStrategyPrompt(intelligence: any, documentText: string): string {
  const typeDoc = (intelligence.type_document || '').toLowerCase();
  
  let specificStrategy = `**Stratégie Pédagogique par défaut** : 
Enseigne les notions progressivement. Hiérarchise l'information.`;

  if (typeDoc.includes('cas pratique') || typeDoc.includes('cas_pratique')) {
    specificStrategy = `**Stratégie Pédagogique - Cas Pratique** :
1. Enseigne la méthode de qualification juridique des faits.
2. Apprends à l'étudiant à poser correctement le problème de droit.
3. Enseigne le syllogisme juridique (Majeure = règles de droit applicables, Mineure = application aux faits de l'espèce, Conclusion).
4. Focalise-toi sur l'application pratique plutôt que sur la théorie pure.`;
  } else if (typeDoc.includes('commentaire') && (typeDoc.includes('arrêt') || typeDoc.includes('arret') || typeDoc.includes('decision'))) {
    specificStrategy = `**Stratégie Pédagogique - Commentaire d'Arrêt** :
1. Enseigne la méthode de la fiche d'arrêt (Faits, Procédure, Prétentions, Problème de droit, Solution).
2. Apprends à analyser le sens, la valeur et la portée de la décision.
3. Pousse l'étudiant à critiquer la décision et à la replacer dans son contexte jurisprudentiel.
4. Explique l'architecture d'un plan de commentaire d'arrêt.`;
  } else if (typeDoc.includes('dissertation')) {
    specificStrategy = `**Stratégie Pédagogique - Dissertation Juridique** :
1. Enseigne l'importance de l'analyse des termes du sujet.
2. Enseigne comment construire une problématique forte et pertinente.
3. Apprends à construire un plan bipartite structuré (I. A/B, II. A/B) typique des facultés de droit.
4. Montre comment lier les concepts théoriques entre eux.`;
  } else if (typeDoc.includes('anglais')) {
    specificStrategy = `**Stratégie Pédagogique - Anglais Juridique** :
1. Privilégie le vocabulaire juridique spécifique, les expressions techniques.
2. Signale les faux amis (ex: 'Magistrate' vs 'Magistrat', 'Jurisprudence' vs 'Case Law').
3. Explique les distinctions fondamentales entre Common Law et Civil Law lorsque c'est pertinent.
4. Enseigne la compréhension des notions juridiques anglo-saxonnes.`;
  } else if (typeDoc.includes('cours') || typeDoc.includes('magistral')) {
    specificStrategy = `**Stratégie Pédagogique - Cours Magistral** :
1. Explique les concepts de manière progressive, de la théorie à la pratique.
2. Montre les liens logiques entre les différentes notions.
3. Mets en évidence l'évolution législative ou jurisprudentielle si mentionnée.
4. Explique clairement "pourquoi" la règle existe (ratio legis).`;
  }

  return `Tu es une équipe de quatre experts (Un Professeur d'université, un Docteur en Droit, un Concepteur d'examen, et un Major de promotion). 
Ton objectif est de créer un cours interactif (sections, thèmes, explications, exercices) à partir d'un document, en utilisant l'intelligence pédagogique qui a déjà été extraite.

**Langue d'enseignement** : Le cours DOIT être généré dans la langue principale identifiée (${intelligence.langue_principale || 'Français'}).

**Intelligence Pédagogique du document** :
- Type de document : ${intelligence.type_document}
- Discipline : ${intelligence.discipline_juridique}
- Niveau attendu : ${intelligence.niveau_universitaire}
- Notions fondamentales : ${intelligence.notions_fondamentales?.join(', ')}
- Pièges classiques : ${intelligence.pieges_classiques?.join(', ')}
- Erreurs fréquentes : ${intelligence.erreurs_etudiantes_frequentes?.join(', ')}
- Raisonnements attendus : ${intelligence.raisonnements_juridiques_indispensables?.join(', ')}

${specificStrategy}

RÈGLE 1 : RÉFLEXION INVISIBLE OBLIGATOIRE (Champ '_reflexion_interne_comite')
Avant de générer le contenu, débattez dans le champ '_reflexion_interne_comite'. Identifiez comment appliquer la stratégie pédagogique spécifique à ce document.

RÈGLE 2 : CONTENU PÉDAGOGIQUE ADAPTÉ (Champ 'explication')
Le champ 'explication' doit contenir l'explication au format Markdown. 
Tu NE DOIS PAS utiliser une progression rigide pour tous les documents. Tu DOIS adapter ta pédagogie à la "Stratégie Pédagogique" définie ci-dessus.
Hiérarchise les notions, explique les exceptions, les distinctions et les pièges d'examen.

RÈGLE 3 : EXERCICES INTELLIGENTS (Champs 'question_forme' et 'cas_pratique_fond')
Génère des exercices qui ciblent SPÉCIFIQUEMENT les "Pièges classiques", "Erreurs fréquentes" et "Raisonnements attendus" listés dans l'intelligence pédagogique.
Les mauvaises réponses doivent refléter les vraies erreurs étudiantes.

RÈGLE 4 : REMÉDIATION INTELLIGENTE (Champs 'branches_remediation')
Explique pourquoi l'erreur classique est logique en apparence mais fausse juridiquement, et rappelle la règle oubliée.

Voici le document brut pour contexte :

${documentText}
`;
}
