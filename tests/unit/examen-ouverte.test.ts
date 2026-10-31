// Questions ouvertes de l'examen (question-réponse, mise en situation) : validation de la banque
// et notation (correction IA enregistrée, réponse vide, IA indisponible = hors barème).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corriger, formatReponse, CLE_CORRECTION_IA, type CompositionItem, type PoolQuestion } from '../../src/lib/examen/engine.ts';
import { validateExamenQuestions } from '../../src/lib/examen/banque.ts';

const pool: PoolQuestion[] = [
  { type: 'vrai_faux', difficulte: 'facile', section_ordre: 1, theme_ordre: 1, question: 'Affirmation simple de test.', correct: 0 },
  { type: 'ouverte', difficulte: 'moyen', section_ordre: 1, theme_ordre: 1, question: 'Awa vend seule le logement familial. Moussa peut-il agir ?',
    reponse_attendue: 'Oui : la vente du logement de la famille exige le consentement des deux époux ; Moussa peut demander la nullité.',
    elements_attendus: ['logement de la famille protégé', 'consentement des deux époux', 'nullité de la vente'] },
];
const composition: CompositionItem[] = [
  { poolIndex: 0, type: 'vrai_faux', section_ordre: 1, theme_ordre: 1, points: 0.5 },
  { poolIndex: 1, type: 'ouverte', section_ordre: 1, theme_ordre: 1, points: 2 },
];

test('réponse ouverte corrigée par l’IA : crédit partiel et retour pédagogique', () => {
  const c = corriger(composition, pool, { '0': 0, '1': 'Oui, il faut le consentement des deux.', [CLE_CORRECTION_IA]: { '1': { ratio: 0.5, retour: 'Il manque la sanction.' } } });
  assert.equal(c.parQuestion[1].points, 1);
  assert.equal(c.parQuestion[1].retour, 'Il manque la sanction.');
  assert.equal(c.pointsMax, 2.5);
  assert.equal(c.note, 12);
});

test('réponse ouverte vide : 0 point, sans appel ni exclusion', () => {
  const c = corriger(composition, pool, { '0': 0 });
  assert.equal(c.parQuestion[1].points, 0);
  assert.equal(c.pointsMax, 2.5);
});

test('IA indisponible : la question rédigée est HORS barème (jamais un 0 injuste)', () => {
  const c = corriger(composition, pool, { '0': 0, '1': 'Ma réponse rédigée.' });
  assert.equal(c.parQuestion[1].nonCorrigee, true);
  assert.equal(c.pointsMax, 0.5);
  assert.equal(c.note, 20);
});

test('ratio hors bornes ramené entre 0 et 1', () => {
  const c = corriger(composition, pool, { '1': 'x', [CLE_CORRECTION_IA]: { '1': { ratio: 7, retour: '' } } });
  assert.equal(c.parQuestion[1].points, 2);
});

test('affichage : réponse rédigée et réponse attendue avec ses éléments', () => {
  const f = formatReponse(composition[1], pool[1], 'Ma réponse');
  assert.equal(f.votre, 'Ma réponse');
  assert.match(f.bonne, /Éléments attendus : logement de la famille protégé ; consentement des deux époux ; nullité de la vente/);
});

test('banque : une question ouverte exige une réponse modèle et au moins 2 éléments attendus', () => {
  const base = { type: 'ouverte', difficulte: 'moyen', section_ordre: 1, theme_ordre: 1, question: 'Distinguez l’action en justice de la demande en justice.', explication: 'Selon le cours.' };
  const ok = validateExamenQuestions([{ ...base, reponse_attendue: 'L’action est le pouvoir d’agir ; la demande est l’acte qui la met en œuvre.', elements_attendus: ['pouvoir d’agir', 'acte de procédure'] }], null);
  assert.equal(ok.length, 1);
  assert.equal(validateExamenQuestions([{ ...base, reponse_attendue: 'Trop court', elements_attendus: ['a', 'b'] }], null).length, 0);
  assert.equal(validateExamenQuestions([{ ...base, reponse_attendue: 'L’action est le pouvoir d’agir en justice.', elements_attendus: ['un seul'] }], null).length, 0);
});
