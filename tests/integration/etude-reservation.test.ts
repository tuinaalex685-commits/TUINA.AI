// Étude guidée : la tentative est RÉSERVÉE avant la correction IA (actions/etude3.ts, answerActivity).
// Vérifie sur la base de TEST l'invariant dont dépend cette réservation : des envois parallèles
// (identifiants de requête différents) ne réservent qu'UNE place, donc un seul appel Gemini.
// Lancer : npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TEST_SUPABASE_URL || '';
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY || '';
const skip = !URL_ || !KEY ? 'TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY absents' : URL_.includes('mqyivcuoplcpwyjkufur') ? 'refus : production' : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
let userId = '';
let documentId = '';

before(async () => {
  if (skip) return;
  const { data, error } = await db!.auth.admin.createUser({ email: `resa-${randomBytes(3).toString('hex')}@sjp-test.invalid`, password: 'Resa-Test-2026', email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const doc = await db!.from('documents').insert({ nom: 'resa.pdf', type: 'pdf', url: 'test', url_fichier: 'test', taille: 1, user_id: userId }).select('id').single();
  if (doc.error) throw doc.error;
  documentId = doc.data.id;
});
after(async () => {
  if (skip || !userId) return;
  await db!.from('etude_tentatives').delete().eq('user_id', userId);
  await db!.from('documents').delete().eq('id', documentId);
  await db!.auth.admin.deleteUser(userId);
});

const reserver = (numero: number) => db!.from('etude_tentatives').insert({
  user_id: userId, document_id: documentId, sequence_ordre: 1, activite_id: 'a1', numero,
  reponse: 'ma réponse', verdict: 'faux', retour: null, request_id: randomUUID(),
});

test('20 envois simultanés de la même tentative : une seule réservation, les autres refusées (23505)', { skip }, async () => {
  const res = await Promise.all(Array.from({ length: 20 }, () => reserver(1)));
  assert.equal(res.filter((r) => !r.error).length, 1);
  assert.ok(res.filter((r) => r.error).every((r) => r.error!.code === '23505'));
});

test('libération après panne : seule la réservation sans retour est supprimée, la place se rouvre', { skip }, async () => {
  const id = randomUUID();
  await db!.from('etude_tentatives').delete().eq('user_id', userId);
  assert.ifError((await db!.from('etude_tentatives').insert({ user_id: userId, document_id: documentId, sequence_ordre: 1, activite_id: 'a2', numero: 1, reponse: 'r', verdict: 'faux', retour: null, request_id: id })).error);
  // Même filtre que libererReservation() : une tentative déjà corrigée n'est jamais effacée.
  assert.ifError((await db!.from('etude_tentatives').insert({ user_id: userId, document_id: documentId, sequence_ordre: 1, activite_id: 'a3', numero: 1, reponse: 'r', verdict: 'juste', retour: { verdict: 'juste' }, request_id: randomUUID() })).error);
  await db!.from('etude_tentatives').delete().eq('user_id', userId).eq('request_id', id).is('retour', null);
  const { data } = await db!.from('etude_tentatives').select('activite_id').eq('user_id', userId);
  assert.deepEqual(data!.map((r) => r.activite_id), ['a3']);
  assert.ifError((await db!.from('etude_tentatives').insert({ user_id: userId, document_id: documentId, sequence_ordre: 1, activite_id: 'a2', numero: 1, reponse: 'r', verdict: 'faux', retour: null, request_id: randomUUID() })).error, 'place rouverte');
});
