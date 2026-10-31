// Examen indépendant de l'Étude guidée (lancement, 31/10/2026) : sans plan d'Étude, la banque fixe
// elle-même ses thèmes ; chaque question garde les titres de sa section et de son thème.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDesQuestions, validateExamenQuestions, type ExamenStructure } from '../../src/lib/examen/banque.ts';

const q = (s: number, t: number, extra: Record<string, unknown> = {}) => ({
  type: 'vrai_faux', difficulte: 'moyen', section_ordre: s, theme_ordre: t, correct: 0,
  question: `Affirmation de test sur le thème ${s}.${t}`, explication: 'Parce que.', ...extra,
});

test('sans plan d’Étude : le plan est déduit des questions, titres conservés', () => {
  const brut = [
    q(1, 1, { section_titre: 'Le mariage', theme_titre: 'Conditions de fond' }),
    q(1, 2, { section_titre: 'Le mariage', theme_titre: 'Effets personnels' }),
    q(2, 1, { section_titre: 'Le divorce', theme_titre: 'Causes' }),
    q(1, 1, { section_titre: 'Autre titre ignoré', theme_titre: 'Autre' }),
  ];
  const plan = planDesQuestions(brut);
  assert.deepEqual(plan.map((s) => [s.section_ordre, s.section_titre, s.themes.map((t) => t.titre)]),
    [[1, 'Le mariage', ['Conditions de fond', 'Effets personnels']], [2, 'Le divorce', ['Causes']]]);
  const valides = validateExamenQuestions(brut, null);
  assert.equal(valides.length, 4);
  assert.equal(valides[3].theme_titre, 'Conditions de fond', 'un thème garde ses premiers titres');
});

test('titre oublié par l’IA : titre neutre, la question n’est pas perdue', () => {
  const valides = validateExamenQuestions([q(3, 2)], null);
  assert.equal(valides.length, 1);
  assert.equal(valides[0].section_titre, 'Partie 3');
  assert.equal(valides[0].theme_titre, 'Thème 2');
});

test('numéros absurdes écartés (pas de thème inventé)', () => {
  assert.equal(validateExamenQuestions([q(0, 1), q(1, 99), q(1.5, 1), q('a' as any, 1)], null).length, 0);
});

test('avec plan d’Étude : seul le plan fourni compte, ses titres sont recopiés', () => {
  const structure: ExamenStructure = [{ section_ordre: 1, section_titre: 'Titre du plan', themes: [{ theme_ordre: 1, titre: 'Thème du plan' }] }];
  const valides = validateExamenQuestions([q(1, 1, { theme_titre: 'Titre inventé par l’IA' }), q(2, 1)], structure);
  assert.equal(valides.length, 1, 'hors plan écarté');
  assert.equal(valides[0].theme_titre, 'Thème du plan');
});
