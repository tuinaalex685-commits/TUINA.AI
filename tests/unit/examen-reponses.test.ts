// Non-régression : une réponse d'examen n'est enregistrée que si sa position existe et que sa forme
// est celle d'une vraie réponse (avant : n'importe quel JSON de ~1 Mo, à n'importe quelle position).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reponseExamenValide } from '../../src/lib/examen/reponse.ts';

test('réponses légitimes acceptées (qcm, vrai/faux, trous, association, classement, effacement)', () => {
  assert.equal(reponseExamenValide(0, 'La coutume', 20), true);
  assert.equal(reponseExamenValide(19, 1, 20), true);
  assert.equal(reponseExamenValide(3, ['action', '', null], 20), true);
  assert.equal(reponseExamenValide(4, Array.from({ length: 8 }, (_, i) => `élément ${i}`), 20), true);
  assert.equal(reponseExamenValide(5, null, 20), true);
  assert.equal(reponseExamenValide(6, 'x'.repeat(2000), 20), true);
});

test('position hors de la composition refusée', () => {
  for (const p of [-1, 20, 1e9, 1.5, NaN, '3' as any, null as any]) assert.equal(reponseExamenValide(p, 'a', 20), false, String(p));
});

test('formes et tailles abusives refusées', () => {
  assert.equal(reponseExamenValide(0, 'x'.repeat(2001), 20), false);
  assert.equal(reponseExamenValide(0, { a: 1 } as any, 20), false);
  assert.equal(reponseExamenValide(0, Array.from({ length: 31 }, () => 'a'), 20), false);
  assert.equal(reponseExamenValide(0, Array.from({ length: 30 }, () => 'x'.repeat(1000)), 20), false, 'total > 8 000');
  assert.equal(reponseExamenValide(0, [{ nested: 'x' }] as any, 20), false);
  assert.equal(reponseExamenValide(0, Infinity, 20), false);
  assert.equal(reponseExamenValide(0, true as any, 20), false);
});
