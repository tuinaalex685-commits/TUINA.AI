// Non-régression : chaque cause d'échec d'une leçon a son message (avant : tout devenait
// « trop de temps / surchargé », y compris une réponse coupée ou un schéma refusé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanError } from '../../src/lib/etude3/messages.ts';

test('réponse coupée et JSON incomplet : problème de SJP, pas « réessaie »', () => {
  for (const e of ['Réponse de l\'IA coupée : limite de 24576 jetons atteinte.', 'L\'IA a renvoyé un format illisible. Détail: Unterminated string in JSON at position 46694']) {
    assert.match(cleanError(e), /incomplète/);
  }
});

test('schéma refusé (400) : refus, pas surcharge', () => {
  const e = 'Erreur lors de la communication avec Gemini: {"error":{"code":400,"message":"The specified schema produces a constraint that has too many states","status":"INVALID_ARGUMENT"}}';
  assert.match(cleanError(e), /refusé/);
});

test('quota : limite d’utilisation', () => {
  assert.match(cleanError('Erreur lors de la communication avec Gemini: 429 RESOURCE_EXHAUSTED'), /limite d’utilisation/);
});

test('délai et surcharge : réessayer dans une minute', () => {
  for (const e of ['Erreur lors de la communication avec Gemini: deadline exceeded', 'Gemini 503 overloaded']) assert.match(cleanError(e), /trop de temps/);
});

test('message métier inchangé, préfixe PDF_SCANNE retiré', () => {
  assert.equal(cleanError('PDF_SCANNE: Ce PDF est une image.'), 'Ce PDF est une image.');
  assert.equal(cleanError(null), 'Le traitement n’a pas abouti.');
});
