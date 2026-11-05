// Sécurité du paiement SasPay : signature des webhooks et décision de livraison. Lancer : npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidWebhookSignature, decidePayment, formatAmount, parseAmount, isSaspayCheckoutUrl } from '../../src/lib/saspayCore.ts';

const SECRET = 'a'.repeat(64);
const sign = (ts: string, body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
const NOW = 1_800_000_000;
const BODY = '{"event":"transaction.success","data":{"id":"tx1","amount":"2500.00"}}';

test('webhook : signature valide acceptée', () => {
  const ts = String(NOW);
  assert.equal(isValidWebhookSignature(BODY, sign(ts, BODY), ts, SECRET, NOW), true);
});

test('webhook : corps modifié refusé (montant falsifié)', () => {
  const ts = String(NOW);
  const forged = BODY.replace('2500.00', '25.00');
  assert.equal(isValidWebhookSignature(forged, sign(ts, BODY), ts, SECRET, NOW), false);
});

test('webhook : mauvais secret refusé', () => {
  const ts = String(NOW);
  assert.equal(isValidWebhookSignature(BODY, sign(ts, BODY, 'b'.repeat(64)), ts, SECRET, NOW), false);
});

test('webhook : rejeu de plus de 5 minutes refusé, même bien signé', () => {
  const ts = String(NOW - 301);
  assert.equal(isValidWebhookSignature(BODY, sign(ts, BODY), ts, SECRET, NOW), false);
  const ok = String(NOW - 299);
  assert.equal(isValidWebhookSignature(BODY, sign(ok, BODY), ok, SECRET, NOW), true);
});

test('webhook : en-têtes absents ou horodatage non numérique refusés', () => {
  assert.equal(isValidWebhookSignature(BODY, null, String(NOW), SECRET, NOW), false);
  assert.equal(isValidWebhookSignature(BODY, sign(String(NOW), BODY), null, SECRET, NOW), false);
  assert.equal(isValidWebhookSignature(BODY, sign('abc', BODY), 'abc', SECRET, NOW), false);
  assert.equal(isValidWebhookSignature(BODY, sign(String(NOW), BODY), String(NOW), '', NOW), false);
});

const expected = { amount: 2500, currency: 'XOF' };
const pay = (status: string, amount = '2500.00', currency = 'XOF') =>
  ({ id: 'tx', reference: 'R', status, requested_amount: amount, currency });

test('livraison uniquement sur SUCCESS au bon montant et dans la bonne devise', () => {
  assert.equal(decidePayment(pay('SUCCESS'), expected), 'success');
  assert.equal(decidePayment(pay('success'), expected), 'success');
});

test('paiement en attente, échoué ou annulé : jamais de livraison', () => {
  assert.equal(decidePayment(pay('PENDING'), expected), 'pending');
  assert.equal(decidePayment(pay(''), expected), 'pending');
  assert.equal(decidePayment(pay('FAILED'), expected), 'failed');
  assert.equal(decidePayment(pay('CANCELLED'), expected), 'failed');
});

test('montant ou devise inattendus : intervention, pas de livraison', () => {
  assert.equal(decidePayment(pay('SUCCESS', '100.00'), expected), 'mismatch');
  assert.equal(decidePayment(pay('SUCCESS', '2500.00', 'XAF'), expected), 'mismatch');
  assert.equal(decidePayment(pay('SUCCESS', 'abc'), expected), 'mismatch');
});

test('montants : chaîne décimale envoyée, lecture tolérante', () => {
  assert.equal(formatAmount(2500), '2500.00');
  assert.equal(parseAmount('2500.00'), 2500);
  assert.equal(parseAmount(null), null);
});

test('redirection : uniquement vers une page HTTPS de SasPay', () => {
  assert.equal(isSaspayCheckoutUrl('https://checkout.saspay.me/abc'), true);
  assert.equal(isSaspayCheckoutUrl('https://pay.saspay.me/checkout/x=='), true);
  assert.equal(isSaspayCheckoutUrl('http://checkout.saspay.me/abc'), false);
  assert.equal(isSaspayCheckoutUrl('https://saspay.me.pirate.com/abc'), false);
  assert.equal(isSaspayCheckoutUrl('https://evilsaspay.me/abc'), false);
  assert.equal(isSaspayCheckoutUrl('https://user:pw@checkout.saspay.me/abc'), false);
  assert.equal(isSaspayCheckoutUrl('javascript:alert(1)'), false);
  assert.equal(isSaspayCheckoutUrl(null), false);
});
