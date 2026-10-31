// Comportement RÉEL de claim_ai_job_v2 (migration 08) : plafond sous concurrence, places libérées,
// baux expirés, équité, droits. Base de TEST uniquement. Lancer : npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TEST_SUPABASE_URL || '';
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY || '';
const PUB = process.env.TEST_SUPABASE_ANON_KEY || '';
const skip = !URL_ || !KEY ? 'TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY absents' : URL_.includes('mqyivcuoplcpwyjkufur') ? 'refus : production' : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const TYPE = `test_file_${randomBytes(3).toString('hex')}`;
let userId = '';
const mdp = 'FileIA-Test-2026';
const email = `${TYPE}@sjp-test.invalid`;

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const claim = (max: number) => db!.rpc('claim_ai_job_v2', { now_ts: iso(), lease_ts: iso(120_000), p_max_inflight: max })
  .then(({ data, error }) => { if (error) throw error; return (data as any[])[0] ?? null; });
const vider = () => db!.from('ai_jobs').delete().eq('type', TYPE);
const ajouter = async (n: number, extra: Record<string, unknown> = {}) => {
  const rows = Array.from({ length: n }, (_, i) => ({ user_id: userId, type: TYPE, status: 'pending', payload: { i }, ...extra }));
  const { data, error } = await db!.from('ai_jobs').insert(rows).select('id');
  if (error) throw error;
  return data!.map((r) => r.id as string);
};
const enCours = async () => (await db!.from('ai_jobs').select('id', { count: 'exact', head: true }).eq('type', TYPE).eq('status', 'processing')).count ?? 0;

before(async () => {
  if (skip) return;
  const { data, error } = await db!.auth.admin.createUser({ email, password: mdp, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});
after(async () => {
  if (skip) return;
  await vider();
  if (userId) await db!.auth.admin.deleteUser(userId);
});

test('plafond : 40 réclamations simultanées, plafond 5 → exactement 5 jobs en cours', { skip }, async () => {
  await vider(); await ajouter(40);
  const res = await Promise.all(Array.from({ length: 40 }, () => claim(5)));
  assert.equal(res.filter(Boolean).length, 5);
  assert.equal(await enCours(), 5);
  assert.equal(new Set(res.filter(Boolean).map((j) => j.id)).size, 5, 'jamais deux fois le même job');
});

test('une place libérée → un seul job de plus', { skip }, async () => {
  const { data } = await db!.from('ai_jobs').select('id').eq('type', TYPE).eq('status', 'processing').limit(1);
  await db!.from('ai_jobs').update({ status: 'completed', lease_until: null }).eq('id', data![0].id);
  const res = await Promise.all(Array.from({ length: 10 }, () => claim(5)));
  assert.equal(res.filter(Boolean).length, 1);
  assert.equal(await enCours(), 5);
});

test('bail expiré : ne compte plus dans le plafond, et le job abandonné (plus ancien) est repris avant un plus récent', { skip }, async () => {
  await vider();
  // Insertions SÉPARÉES : des dates de création distinctes, comme en réalité (une même
  // transaction donne la même date à toutes les lignes, et l'ordre devient arbitraire).
  const [abandonne] = await ajouter(1, { status: 'processing', lease_until: iso(-60_000) }); // fonction coupée
  await new Promise((r) => setTimeout(r, 300));
  await ajouter(4, { status: 'processing', lease_until: iso(120_000) });                      // 4 en cours, valides
  await new Promise((r) => setTimeout(r, 300));
  await ajouter(1);                                                                            // nouveau job en attente
  const repris = await claim(5);  // 4 baux valides < 5 : une place existe
  assert.equal(repris?.id, abandonne);
  assert.equal(await claim(5), null, 'plafond de 5 atteint : le nouveau job attend');
});

test('bail NULL sur un job « en cours » : repris (plus de job bloqué à jamais)', { skip }, async () => {
  await vider();
  const [bloque] = await ajouter(1, { status: 'processing', lease_until: null });
  const repris = await claim(5);
  assert.equal(repris?.id, bloque);
});

test('équité : une étape d’analyse renvoyée en file passe APRÈS une correction arrivée entre-temps', { skip }, async () => {
  await vider();
  const [analyse] = await ajouter(1);                       // créée en premier
  await new Promise((r) => setTimeout(r, 1200));
  const [correction] = await ajouter(1);                    // arrivée ensuite
  // L'étape suivante de l'analyse est replanifiée maintenant (comme yieldStep : now + 50 ms).
  await db!.from('ai_jobs').update({ next_attempt_at: iso(50) }).eq('id', analyse);
  await new Promise((r) => setTimeout(r, 300));
  const premier = await claim(5);
  assert.equal(premier?.id, correction, 'la correction ne doit pas attendre derrière toutes les étapes de l’analyse');
  const second = await claim(5);
  assert.equal(second?.id, analyse);
});

test('job pas encore dû (reprise après erreur) : jamais réclamé avant l’heure', { skip }, async () => {
  await vider();
  await ajouter(1, { next_attempt_at: iso(60_000) });
  assert.equal(await claim(5), null);
});

test('droits : un étudiant connecté ne peut pas réclamer de job', { skip }, async () => {
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { error: e1 } = await c.auth.signInWithPassword({ email, password: mdp });
  assert.ifError(e1);
  const { error } = await c.rpc('claim_ai_job_v2', { now_ts: iso(), lease_ts: iso(120_000), p_max_inflight: 5 });
  assert.ok(error, 'appel refusé attendu');
});
