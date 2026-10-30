// Non-régression : aucune saisie ne doit servir de joker dans une recherche PostgREST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactEmailPattern, hasWildcardChars } from '../../src/lib/email.ts';
import { accessCodeVariants, isPlausibleAccessCode } from '../../src/lib/accessCode.ts';

test('email : *, %, _ et \\ sont échappés (aucun joker possible)', () => {
  assert.equal(exactEmailPattern('*@gmail.com'), '\\*@gmail.com');
  assert.equal(exactEmailPattern('a%b@x.com'), 'a\\%b@x.com');
  assert.equal(exactEmailPattern('a_b@x.com'), 'a\\_b@x.com');
  assert.equal(exactEmailPattern(' Etudiant@Gmail.COM '), 'etudiant@gmail.com');
  // Aucun * ni % non précédé d'une barre oblique inverse.
  for (const e of ['*@x.com', '%@x.com', 'a**b%%@x.com']) assert.doesNotMatch(exactEmailPattern(e), /(^|[^\\])[*%]/);
});

test('inscription : adresses avec * ou % refusées', () => {
  assert.equal(hasWildcardChars('*@gmail.com'), true);
  assert.equal(hasWildcardChars('a%b@x.com'), true);
  assert.equal(hasWildcardChars('jean_dupont@gmail.com'), false);
});

test('codes : syntaxe de filtre refusée avant toute requête (guillemets, virgules, parenthèses, jokers)', () => {
  for (const piege of ['x","CODE2","CODE3', 'A*', 'AB%', 'a,b,c,d', '(ABCD)', 'AB\\CD', "AB'CD"]) {
    assert.equal(isPlausibleAccessCode(piege), false, piege);
  }
  assert.equal(isPlausibleAccessCode('SJP-ÉTÉ_2026'), true); // accents permis (code de production avec « É »)
});

test('codes : variantes littérales seulement (le joker reste un caractère)', () => {
  const v = accessCodeVariants('A*');
  assert.ok(v.every((x) => x.includes('*')), 'le * est conservé tel quel, comparé littéralement');
  assert.deepEqual(accessCodeVariants(' Sjp-ab12 ').sort(), ['SJP-AB12', 'Sjp-ab12', 'sjp-ab12'].sort());
});
