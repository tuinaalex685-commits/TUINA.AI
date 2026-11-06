// Contrôle LÉGER en production, comptes PREMIUM distincts (un compte et ses données par utilisateur
// virtuel). Lecture seule : pages uniquement, aucune IA, aucune écriture.
// Lancer : k6 run -e PROD_LEGER=1 -e VUS=25 -e BASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=…
//          -e COMPTES_FICHIER=<chemin absolu de comptes-premium.json> tests/load/prod-premium.js
// comptes-premium.json : [{ email, password, matiereId, redactionId }, …] (au moins VUS comptes).
import { check, fail, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { garde, paliers, VUS, ouvrirSession, page } from './lib.js';

const COMPTES = JSON.parse(open(__ENV.COMPTES_FICHIER));
const sessionPerdue = new Rate('sjp_session_perdue');      // renvoyé vers /login
const pasPremium = new Rate('sjp_premium_absent');         // page servie comme à un compte gratuit
const donneesAbsentes = new Rate('sjp_donnees_absentes');  // la matière / la copie du compte n'apparaît pas

export const options = {
  noCookiesReset: true, // un étudiant reste connecté d'une page à l'autre
  scenarios: { premium: { executor: 'ramping-vus', startVUs: 0, stages: paliers(), gracefulRampDown: '30s' } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    sjp_page_ms: ['p(95)<2500'],
    sjp_session_perdue: ['rate<0.01'],
    sjp_premium_absent: ['rate<0.01'],
    sjp_donnees_absentes: ['rate<0.01'],
  },
};

export function setup() {
  garde(VUS);
  if (COMPTES.length < VUS) fail(`Il faut au moins ${VUS} comptes distincts (fichier : ${COMPTES.length}).`);
}

export default function () {
  // Un compte par utilisateur virtuel, jamais partagé.
  const c = COMPTES[(exec.vu.idInTest - 1) % COMPTES.length];
  if (!ouvrirSession(c.email, c.password)) { sessionPerdue.add(1); sleep(5); return; }

  const parcours = [
    ['/app/dashboard', 'tableau de bord'],
    ['/app/matieres', 'mes matières', 'Droit civil test'],
    [`/app/matieres/${c.matiereId}`, 'une matière', 'Droit civil test'],
    ['/app/objectifs', 'objectifs', 'Réviser 20 fiches'],
    ['/app/bibliotheque', 'bibliothèque'],
    ['/app/revisions', 'révisions'],
    ['/app/progression', 'progression'],
    ['/app/examen', 'examens'],
    ['/app/redaction', 'rédaction'],
    [`/app/redaction/${c.redactionId}`, 'une copie', 'La responsabilité civile'],
    ['/app/compte', 'mon compte'],
  ];
  for (const [path, nom, attendu] of parcours) {
    const res = page(path, nom);
    const body = String(res.body || '');
    const perdue = /\/login/.test(res.url || '');
    const premium = body.includes('SJP Premium') && !body.includes('Découvrir Premium');
    sessionPerdue.add(perdue);
    if (!perdue) pasPremium.add(!premium);
    if (attendu && !perdue) donneesAbsentes.add(!body.includes(attendu));
    check(res, {
      [`${nom} : connecté`]: () => !perdue,
      [`${nom} : servi en Premium`]: () => perdue || premium,
      ...(attendu ? { [`${nom} : ses propres données`]: () => perdue || body.includes(attendu) } : {}),
    });
    sleep(3 + Math.random() * 5); // lecture de la page
  }
}
