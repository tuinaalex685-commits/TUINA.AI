/**
 * Réponses SIMULÉES du moteur v3 (aucun appel Gemini), pour les tests de charge et de
 * concurrence. N'est utilisé que si le worker autorise le mode test (AI_MOCK_ENABLED=1, hors
 * production) ET que le job porte payload.mock === true — jamais posé par l'interface.
 */
export function mockEtude3(feature: string): any {
  switch (feature) {
    case 'etude3_segment':
      return {
        parties: ['Partie simulée'], notions: [{ nom: 'Notion simulée', niveau: 'indispensable', definition_cours: 'Définition simulée.', pages: [1] }],
        regles: [{ enonce: 'Règle simulée', conditions: ['Condition'], exceptions: [], consequences: [], pages: [1] }],
        distinctions: [], mecanismes: [], exemples_cours: [], pieges: ['Piège simulé'], ambiguites: [],
      };
    case 'etude3_consolidation':
      return {
        titre: 'Cours simulé', discipline: 'Droit', idee_centrale: 'Idée centrale simulée.', plan: ['I. Partie', 'II. Partie'],
        examinateur: { indispensables: ['Notion simulée'], confusions: [], erreurs_typiques: [] },
        sequences: [
          { titre: 'Séquence simulée 1', objectif: 'Comprendre la notion simulée.', notions: ['Notion simulée'], pages: [1] },
          { titre: 'Séquence simulée 2', objectif: 'Appliquer la règle simulée.', notions: ['Règle simulée'], pages: [1] },
        ],
        carte_mentale: { centre: 'Cours simulé', noeuds: [{ id: 'n1', label: 'Notion simulée', type: 'notion', parent: '' }, { id: 'n2', label: 'Règle simulée', type: 'regle', parent: 'n1' }] },
      };
    case 'etude3_synthese':
      return {
        titre: 'Synthèse simulée', presentation: 'Présentation simulée.', plan: ['I', 'II'],
        sections: [{ titre: 'Section simulée', blocs: [{ type: 'paragraphe', texte: 'Texte simulé.', origine: 'cours', pages: [1] }] }],
        fiche_memo: ['À retenir simulé'], a_approfondir: [],
      };
    case 'etude3_sequence':
      return {
        titre: 'Séquence simulée', objectif: 'Objectif simulé.', liens: [],
        blocs: [{ type: 'paragraphe', texte: 'Explication simulée.', origine: 'explication' }],
        activites: [
          { id: 'a1', type: 'choix', notion: 'Notion simulée', consigne: 'Question simulée ?', choix: ['Bonne', 'Mauvaise'], bonne: 0, explication: 'Parce que.', pourquoi_faux: ['Juste.', 'Faux.'], autre_explication: 'Autre angle.' },
        ],
      };
    case 'etude3_correction':
      return { verdict: 'partiel', message: 'Correction simulée.', manquants: ['Élément simulé'] };
    default:
      throw new Error(`Simulation inconnue : ${feature}`);
  }
}
