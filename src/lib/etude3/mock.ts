/**
 * Réponses SIMULÉES du moteur v4 (aucun appel Gemini), pour les tests de charge, de concurrence
 * et de parcours. N'est utilisé que si le worker autorise le mode test (AI_MOCK_ENABLED=1, hors
 * production) ET que le job porte payload.mock === true, ou en local avec AI_MOCK_ALL=1.
 * Les textes disent qu'ils sont simulés : aucun ne prétend venir d'un vrai cours.
 */
export function mockEtude3(feature: string): any {
  switch (feature) {
    case 'etude3_module':
      return {
        titre: 'Module simulé', idee_centrale: 'Idée centrale simulée.',
        notions: [{ nom: 'Notion simulée', niveau: 'indispensable', definition_cours: 'Définition simulée.', sens: 'Sens simulé.', probleme: 'Problème simulé.', fonctionnement: '', liees: [], prerequis: [], confusions: ['Confusion simulée'], exemples: [], pages: [1] }],
        distinctions: [{ a: 'Notion simulée', b: 'Notion voisine simulée', critere: 'Critère simulé.' }],
        pieges: ['Piège simulé'], ambiguites: [],
        lecons: [
          { titre: 'Leçon simulée A', objectif: 'Comprendre la notion simulée.', accroche: 'Question simulée ?', notions: ['Notion simulée'], pages: [1] },
          { titre: 'Leçon simulée B', objectif: 'Distinguer la notion simulée.', accroche: 'Situation simulée.', notions: ['Notion simulée'], pages: [1] },
        ],
        carte: { centre: 'Module simulé', noeuds: [
          { id: 'n1', label: 'Notion simulée', type: 'notion', parent: '', lien: '', explication: 'Explication simulée.' },
          { id: 'n2', label: 'Condition simulée', type: 'condition', parent: 'n1', lien: 'condition de', explication: 'Explication simulée.' },
        ] },
      };
    case 'etude3_synthese':
      return {
        titre: 'Cours simulé', presentation: 'Présentation simulée. Elle dit ce que tu vas apprendre.', pourquoi: 'Pourquoi simulé.',
        questions: [{ question: 'Question simulée ?', reponse: 'Réponse simulée.', ou: 'Module simulé' }],
        carte: { centre: 'Cours simulé', noeuds: [
          { id: 'g1', label: 'Branche simulée', type: 'notion', parent: '', lien: '', explication: 'Explication simulée.', module: 'm1' },
          { id: 'g2', label: 'Sous-notion simulée', type: 'regle', parent: 'g1', lien: 'se divise en', explication: 'Explication simulée.' },
        ] },
        branches: [{ titre: 'Branche simulée', idee: 'Idée simulée.', simple: 'En mots simples (simulé).', liens: 'Liens simulés.', exemple: 'Exemple simulé.', avant_de_commencer: 'Prérequis simulé.', modules: ['m1'] }],
        pieges: ['Piège simulé'], a_retenir: ['À retenir simulé'], a_approfondir: [],
      };
    case 'etude3_sequence':
      return {
        titre: 'Leçon simulée', objectif: 'Objectif simulé.', liens: [], suite: 'Suite simulée.', savoir_expliquer: 'Explication à un camarade (simulée).',
        accroche: { situation: 'Situation simulée.', question: 'Que peux-tu faire (simulé) ?' },
        etapes: [
          { cle: 'comprendre', blocs: [{ type: 'paragraphe', texte: 'Explication simple simulée.', origine: 'explication' }] },
          { cle: 'formuler', blocs: [{ type: 'definition', terme: 'Notion simulée', definition: 'Définition simulée.', reformulation: 'Reformulation simulée.', origine: 'cours', pages: [1] }] },
          { cle: 'illustrer', blocs: [{ type: 'scene', titre: 'Scène simulée', legende: 'Ce que montre la scène simulée.', acteurs: [{ id: 'a', nom: 'Awa', role: 'créancière', genre: 'personne' }, { id: 'b', nom: 'Paul', role: 'débiteur', genre: 'personne' }], relations: [{ de: 'a', vers: 'b', action: 'action simulée' }] }] },
          { cle: 'retenir', blocs: [{ type: 'liste', items: ['Point simulé'] }] },
        ],
        activites: [
          { id: 'a1', type: 'choix', niveau: 'comprendre', notion: 'Notion simulée', consigne: 'Question simulée ?', choix: ['Bonne', 'Mauvaise', 'Autre'], bonne: 0, explication: 'Parce que.', pourquoi_faux: ['Juste.', 'Faux.', 'Faux.'], autre_explication: 'Autre angle.', explication_simple: 'Plus simple.' },
          { id: 'a2', type: 'ouverte', niveau: 'examen', notion: 'Notion simulée', consigne: 'Reformule (simulé).', attendus: ['Élément simulé'], erreurs_typiques: [], reponse_modele: 'Réponse simulée.', autre_explication: 'Autre angle.', explication_simple: 'Plus simple.' },
        ],
      };
    case 'etude3_correction':
      return { verdict: 'partiel', message: 'Correction simulée.', manquants: ['Élément simulé'] };
    default:
      throw new Error(`Simulation inconnue : ${feature}`);
  }
}
