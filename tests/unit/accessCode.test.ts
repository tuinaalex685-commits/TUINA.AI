// Non-régression des règles des codes d'accès. Lancer : npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccessCode, isPlausibleAccessCode, isCodeCurrentlyActive } from '../../src/lib/accessCode.ts';

test('saisie mobile : majuscule automatique, espaces, minuscules → même code', () => {
  // Bug de production : 5 codes sur 9 contenaient des minuscules ; le clavier mobile met une
  // majuscule en tête, la comparaison exacte répondait « code non valide ».
  const stocke = normalizeAccessCode('sjp-ab12cd');
  assert.equal(normalizeAccessCode('Sjp-ab12cd'), stocke);
  assert.equal(normalizeAccessCode('  SJP-AB12CD '), stocke);
  assert.equal(normalizeAccessCode('SJP - AB12 CD'), stocke);
  assert.equal(stocke, 'SJP-AB12CD');
});

test('O et 0 ne sont PAS confondus (pas d’agrandissement de l’espace de devinette)', () => {
  assert.notEqual(normalizeAccessCode('SJP-O1'), normalizeAccessCode('SJP-01'));
});

test('saisies non plausibles refusées avant toute requête', () => {
  assert.equal(isPlausibleAccessCode(''), false);
  assert.equal(isPlausibleAccessCode('   '), false);
  assert.equal(isPlausibleAccessCode('ab'), false);
  assert.equal(isPlausibleAccessCode('x'.repeat(101)), false);
  assert.equal(isPlausibleAccessCode(null), false);
  assert.equal(isPlausibleAccessCode('SJP-AB12'), true);
});

test('Premium : actif et non expiré seulement', () => {
  const maintenant = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(isCodeCurrentlyActive({ status: 'active', expires_at: '2026-11-27T12:00:00Z' }, maintenant), true);
  assert.equal(isCodeCurrentlyActive({ status: 'active', expires_at: '2026-10-28T11:59:59Z' }, maintenant), false);
  assert.equal(isCodeCurrentlyActive({ status: 'active', expires_at: null }, maintenant), true); // code d'avant la migration
  assert.equal(isCodeCurrentlyActive({ status: 'inactive', expires_at: '2026-11-27T12:00:00Z' }, maintenant), false);
  assert.equal(isCodeCurrentlyActive({ status: 'blocked' }, maintenant), false);
});

test('expiration exactement à l’instant : n’est plus Premium', () => {
  const t = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(isCodeCurrentlyActive({ status: 'active', expires_at: '2026-10-28T12:00:00Z' }, t), false);
});
