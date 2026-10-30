// Concurrence sur l'activation des codes (fonction activate_access_code, migration 09).
// Base de TEST uniquement : TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_KEY. Ignoré sinon ; refuse la production.
// Lancer : npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TEST_SUPABASE_URL || '';
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY || '';
const PROD_REF = 'mqyivcuoplcpwyjkufur';
const skip = !URL_ || !KEY ? 'TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY absents' : URL_.includes(PROD_REF) ? 'refus : production' : false;

const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const lot = randomBytes(4).toString('hex');
const codes: string[] = [];
const nouveauCode = async (patch: Record<string, unknown> = {}) => {
  const code = `IT-${lot}-${codes.length}`.toLowerCase(); // stocké en minuscules : la saisie se fera en majuscules
  const { error } = await db!.from('access_codes').insert({ code, status: 'active', ...patch });
  if (error) throw error;
  codes.push(code);
  return code;
};
const activer = (email: string, code: string) =>
  db!.rpc('activate_access_code', { p_email: email, p_code: code }).then(({ data, error }) => {
    if (error) throw error;
    return (data as { status: string }).status;
  });
const email = (n: string) => `it-${lot}-${n}@sjp-test.invalid`;

before(async () => { if (skip) return; });
after(async () => {
  if (skip) return;
  await db!.from('access_code_history').delete().like('email', `it-${lot}-%`);
  await db!.from('access_codes').delete().in('code', codes);
});

test('50 comptes, le même code, au même instant : un seul l’obtient', { skip }, async () => {
  const code = await nouveauCode();
  const res = await Promise.all(Array.from({ length: 50 }, (_, i) => activer(email(`meme-${i}`), code.toUpperCase())));
  assert.equal(res.filter((s) => s === 'ok').length, 1);
  assert.equal(res.filter((s) => s === 'invalid').length, 49);
});

test('un compte, deux codes au même instant : un seul est consommé', { skip }, async () => {
  const [a, b] = [await nouveauCode(), await nouveauCode()];
  const res = await Promise.all([activer(email('double'), a), activer(email('double'), b)]);
  assert.deepEqual(res.slice().sort(), ['already_active', 'ok']);
  const { data } = await db!.from('access_codes').select('code').in('code', [a, b]).not('email', 'is', null);
  assert.equal(data?.length, 1); // l'autre code reste vierge, utilisable plus tard
});

test('renouvellement : ancien code expiré remplacé, archivé et bloqué', { skip }, async () => {
  const ancien = await nouveauCode({ email: email('renouv'), expires_at: new Date(Date.now() - 86400000).toISOString() });
  const neuf = await nouveauCode();
  assert.equal(await activer(email('renouv'), ` ${neuf.toUpperCase()} `), 'ok');
  const { data: old } = await db!.from('access_codes').select('email, status').eq('code', ancien).single();
  assert.deepEqual(old, { email: null, status: 'blocked' });
  const { count } = await db!.from('access_code_history').select('id', { count: 'exact', head: true }).eq('code', ancien);
  assert.equal(count, 1);
});

test('code d’un autre étudiant, ou code bloqué : refusé', { skip }, async () => {
  const pris = await nouveauCode({ email: email('titulaire'), expires_at: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(await activer(email('intrus'), pris), 'invalid');
  const bloque = await nouveauCode({ status: 'blocked' });
  assert.equal(await activer(email('x'), bloque), 'invalid');
});

test('déjà Premium : un nouveau code n’est pas gaspillé', { skip }, async () => {
  await nouveauCode({ email: email('premium'), expires_at: new Date(Date.now() + 86400000).toISOString() });
  const neuf = await nouveauCode();
  assert.equal(await activer(email('premium'), neuf), 'already_active');
  const { data } = await db!.from('access_codes').select('email').eq('code', neuf).single();
  assert.equal(data?.email, null);
});
