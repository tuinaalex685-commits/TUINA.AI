// Bibliothèque commune des tests de charge k6 de SJP.
// Les scripts appellent les VRAIS parcours (pages et actions serveur des boutons), pas des raccourcis.
import http from 'k6/http';
import encoding from 'k6/encoding';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export const BASE = (__ENV.BASE_URL || '').replace(/\/+$/, '');
export const SB_URL = (__ENV.SUPABASE_URL || '').replace(/\/+$/, '');
export const SB_KEY = __ENV.SUPABASE_ANON_KEY || '';

// ---------------------------------------------------------------------------------------------
// GARDE-FOU : jamais de charge sur la production. Seule exception, volontaire et bornée :
// PROD_LEGER=1 avec 50 utilisateurs virtuels au plus (contrôle de fumée, pas de montée en charge).
// ---------------------------------------------------------------------------------------------
const PROD_MARKERS = ['mqyivcuoplcpwyjkufur', 'tuina-ai.vercel.app'];
export function garde(maxVus) {
  if (!BASE || !SB_URL || !SB_KEY) fail('BASE_URL, SUPABASE_URL et SUPABASE_ANON_KEY sont obligatoires (environnement de TEST).');
  const prod = PROD_MARKERS.some((m) => BASE.includes(m) || SB_URL.includes(m));
  if (prod && !(__ENV.PROD_LEGER === '1' && maxVus <= 50)) {
    fail('Refus : ces adresses sont celles de la PRODUCTION. Les tests de charge se font sur l’environnement de test.');
  }
}

// Paliers progressifs : 10, 25, 50, 100, 250, 500, 1000 (VUS=…), montée douce puis plateau.
export const VUS = Number(__ENV.VUS || 10);
export const PLATEAU = __ENV.PLATEAU || '3m';
export function paliers() {
  return [
    { duration: '1m', target: Math.ceil(VUS / 2) },
    { duration: '1m', target: VUS },
    { duration: PLATEAU, target: VUS },
    { duration: '30s', target: 0 },
  ];
}

// ---------------------------------------------------------------------------------------------
// Mesures propres à SJP (en plus de celles de k6) : elles disent OÙ ça se dégrade.
// ---------------------------------------------------------------------------------------------
export const m = {
  erreursMetier: new Rate('sjp_erreurs_metier'),       // action refusée (message d'erreur affiché à l'étudiant)
  refusAffluence: new Counter('sjp_refus_affluence'),  // « Beaucoup d'étudiants… » (limite Supabase)
  attenteIA: new Trend('sjp_attente_ia_ms', true),     // du clic au résultat (synthèse, séquence, correction)
  jobsEchoues: new Counter('sjp_jobs_echoues'),
  jobsTropLongs: new Counter('sjp_jobs_trop_longs'),   // pas terminé dans le délai d'attente
  page: new Trend('sjp_page_ms', true),
};

// ---------------------------------------------------------------------------------------------
// Session : connexion Supabase, puis cookie au format @supabase/ssr (base64url, découpé en
// morceaux de 3 180 caractères), exactement comme le navigateur de l'étudiant.
// ---------------------------------------------------------------------------------------------
const REF = SB_URL.replace(/^https?:\/\//, '').split('.')[0];
const COOKIE = `sb-${REF}-auth-token`;
const CHUNK = 3180;

export function connexionDirecte(email, password) {
  const res = http.post(`${SB_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email, password }), {
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, tags: { name: 'supabase_token' },
  });
  if (res.status !== 200) return null;
  const s = res.json();
  s.expires_at = s.expires_at || Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600);
  return s;
}

export function cookiesDeSession(session) {
  const value = 'base64-' + encoding.b64encode(JSON.stringify(session), 'rawurl');
  if (value.length <= CHUNK) return { [COOKIE]: value };
  const out = {};
  for (let i = 0, n = 0; i < value.length; i += CHUNK, n++) out[`${COOKIE}.${n}`] = value.slice(i, i + CHUNK);
  return out;
}

export function ouvrirSession(email, password) {
  const s = connexionDirecte(email, password);
  if (!s) return null;
  const jar = http.cookieJar();
  for (const [k, v] of Object.entries(cookiesDeSession(s))) jar.set(BASE, k, v, { path: '/' });
  return s;
}

// ---------------------------------------------------------------------------------------------
// Pages et actions serveur
// ---------------------------------------------------------------------------------------------
export function page(path, name) {
  const res = http.get(`${BASE}${path}`, { tags: { name: name || path }, redirects: 5 });
  m.page.add(res.timings.duration, { page: name || path });
  check(res, { [`page ${name || path} OK`]: (r) => r.status === 200 });
  return res;
}

// Identifiants des actions serveur du déploiement testé (fichier produit par action-ids.mjs).
const IDS = JSON.parse(open('./actions.json'));
export const actionDisponible = (nom) => !!IDS[nom];

/**
 * Appelle une action serveur comme le bouton de l'interface : POST sur la page qui l'utilise,
 * en-tête Next-Action, arguments en JSON. Renvoie la valeur retournée par l'action.
 */
export function action(nom, pagePath, args) {
  const id = IDS[nom];
  if (!id) fail(`Action ${nom} absente de actions.json : relancer action-ids.mjs sur ce déploiement.`);
  const res = http.post(`${BASE}${pagePath}`, JSON.stringify(args), {
    headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' },
    tags: { name: `action_${nom}` }, redirects: 0,
  });
  let valeur = null;
  if (res.status === 200 && typeof res.body === 'string') {
    const ligne = res.body.split('\n').find((l) => l.startsWith('1:'));
    try { valeur = ligne ? JSON.parse(ligne.slice(2)) : null; } catch { valeur = null; }
  }
  const ok = res.status === 200 && valeur && !valeur.error;
  m.erreursMetier.add(!ok, { action: nom });
  if (valeur?.error && /Beaucoup d.(étudiants|inscriptions)/.test(valeur.error)) m.refusAffluence.add(1, { action: nom });
  check(res, { [`action ${nom} répond`]: (r) => r.status === 200 });
  return { res, valeur };
}

/** Suit un job IA comme useJob (rythme adaptatif) jusqu'à la fin ; mesure l'attente réelle. */
export function attendreJob(jobId, debut, maxSecondes = 900) {
  for (;;) {
    const age = (Date.now() - debut) / 1000;
    if (age > maxSecondes) { m.jobsTropLongs.add(1); return 'trop_long'; }
    const r = http.get(`${BASE}/api/jobs/${jobId}`, { tags: { name: 'api_jobs_suivi' } });
    if (r.status === 200) {
      const j = r.json();
      if (j.status === 'completed' || j.status === 'done') { m.attenteIA.add(Date.now() - debut); return 'ok'; }
      if (j.status === 'failed' || j.status === 'error') { m.jobsEchoues.add(1); return 'echec'; }
    }
    sleep(age < 30 ? 2.5 : age < 120 ? 5 : 10);
  }
}
