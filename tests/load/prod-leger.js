// Contrôle de fumée LÉGER en production (lecture seule, sans IA, sans écriture) : des étudiants
// connectés parcourent l'application. Mesure : SJP tient-il N étudiants simultanés ?
// Lancer : k6 run -e PROD_LEGER=1 -e VUS=25 -e BASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=…
//          -e COMPTES='email1:mdp1,email2:mdp2' tests/load/prod-leger.js
import { check, fail, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import { garde, paliers, VUS, BASE, ouvrirSession, page } from './lib.js';

const deconnecte = new Rate('sjp_session_perdue'); // page /app servie comme /login : session refusée

const COMPTES = (__ENV.COMPTES || '').split(',').filter(Boolean).map((c) => {
  const i = c.indexOf(':');
  return { email: c.slice(0, i), password: c.slice(i + 1) };
});

export const options = {
  // k6 vide les cookies à chaque itération par défaut : un étudiant, lui, reste connecté.
  noCookiesReset: true,
  scenarios: { navigation: { executor: 'ramping-vus', startVUs: 0, stages: paliers(), gracefulRampDown: '30s' } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    sjp_page_ms: ['p(95)<2500'],
    sjp_session_perdue: ['rate<0.01'],
  },
};

export function setup() {
  garde(VUS);
  if (!COMPTES.length) fail('COMPTES manquant');
}

// Pages d'un étudiant gratuit, dans l'ordre d'une vraie visite.
const PARCOURS = [
  ['/app/dashboard', 'tableau de bord'],
  ['/app/examen', 'examens'],
  ['/app/bibliotheque', 'bibliothèque'],
  ['/app/redaction', 'rédaction'],
  ['/app/revisions', 'révisions'],
  ['/app/progression', 'progression'],
  ['/app/premium', 'offre premium'],
  ['/app/compte', 'mon compte'],
];

export default function () {
  const c = COMPTES[(__VU - 1) % COMPTES.length];
  if (!ouvrirSession(c.email, c.password)) { deconnecte.add(1); sleep(5); return; }
  if (__ITER === 0) page('/', 'accueil');
  for (const [path, nom] of PARCOURS) {
    const res = page(path, nom);
    const perdue = /\/login/.test(res.url || '');
    deconnecte.add(perdue);
    check(res, { [`${nom} : session conservée`]: () => !perdue });
    sleep(3 + Math.random() * 5); // lecture de la page par l'étudiant
  }
  void http;
}
