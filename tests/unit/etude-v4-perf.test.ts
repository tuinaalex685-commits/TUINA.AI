// Déni de service : le découpage d'un PDF énorme reste rapide (tailles de pages mémoïsées).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireModules } from '../../src/lib/etude3/structure.ts';

test('3 000 pages : modules construits en moins de 2 secondes, 40 au plus', () => {
  const pages = Array.from({ length: 3000 }, (_, i) => `${i % 9 === 0 ? `CHAPITRE ${i / 9 + 1} : SUJET\n` : ''}${'Le juge tranche le litige. '.repeat(120)}`);
  const t0 = Date.now();
  const modules = construireModules(pages);
  assert.ok(Date.now() - t0 < 2000, `trop lent : ${Date.now() - t0} ms`);
  assert.ok(modules.length <= 40);
});
