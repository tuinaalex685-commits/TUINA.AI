// Limites d'inscription Supabase, par le VRAI parcours (action serveur signUpFree).
//   IP_DISTINCTES=0 : tous les étudiants vus derrière une seule IP (= situation de production sur Vercel)
//   IP_DISTINCTES=1 : chaque étudiant présente sa propre IP (en-tête x-real-ip → sb-forwarded-for)
// k6 run -e BASE_URL=http://localhost:3210 -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… -e N=60 tests/load/auth-limites.js
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { BASE, garde } from './lib.js';

const IDS = JSON.parse(open('./actions.json'));
const N = Number(__ENV.N || 60);
const DISTINCT = __ENV.IP_DISTINCTES === '1';
const ok = new Counter('inscriptions_reussies');
const refus = new Counter('inscriptions_refusees_affluence');
const autres = new Counter('inscriptions_autres_erreurs');

export const options = {
  scenarios: { vague: { executor: 'shared-iterations', vus: Math.min(N, 30), iterations: N, maxDuration: '3m' } },
};
export function setup() { garde(N); }

export default function () {
  const i = exec.scenario.iterationInTest;
  const email = `limite-${__ENV.LOT || 'x'}-${DISTINCT ? 'ipd' : 'ip1'}-${i}@sjp-test.invalid`;
  const headers = { 'Next-Action': IDS.signUpFree, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' };
  if (DISTINCT) headers['x-real-ip'] = `41.${100 + ((i >> 16) & 63)}.${(i >> 8) & 255}.${(i & 255) + 1}`;
  const res = http.post(`${BASE}/inscription`, JSON.stringify([email, 'MotDePasse-Test-2026', { niveau: 'l1', source: 'groupe_etudiant' }]), { headers, tags: { name: 'signUpFree' } });
  const ligne = String(res.body || '').split('\n').find((l) => l.startsWith('1:'));
  let v = null; try { v = ligne ? JSON.parse(ligne.slice(2)) : null; } catch { v = null; }
  if (v && v.success) ok.add(1);
  else if (v && /Beaucoup d.inscriptions/.test(v.error || '')) refus.add(1);
  else { autres.add(1); if (exec.scenario.iterationInTest < 3) console.warn(`réponse inattendue ${res.status}: ${String(res.body).slice(0, 200)}`); }
  check(res, { 'HTTP 200': (r) => r.status === 200 });
}
