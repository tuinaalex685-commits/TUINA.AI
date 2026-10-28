// Tests de charge SJP : un scénario à la fois (SCENARIO=…), par paliers (VUS=10, 25, 50, 100, 250, 500, 1000).
//
//   inscription     des étudiants cliquent « Créer un compte gratuit » en même temps
//   connexion       vague de connexions (rentrée, veille d'examen)
//   code_distinct   chacun active SON code Premium au même moment
//   code_meme       tout le monde tente LE MÊME code : un seul doit l'obtenir
//   expiration      des comptes dont l'abonnement vient d'expirer naviguent
//   etude_distinct  chacun lance une Étude guidée sur un cours DIFFÉRENT (pire cas pour l'IA)
//   etude_meme      tout le monde lance l'étude du MÊME cours (mutualisation : une seule analyse)
//   redaction       cas pratiques, dissertations et commentaires corrigés en même temps
//   mixte           la vraie vie : navigation, études, séquences, rédaction, en proportions réalistes
//   endurance       « mixte » pendant des heures (DUREE=6h) : fuites, sessions qui expirent, lenteur
//
// Exemple : k6 run -e SCENARIO=mixte -e VUS=100 -e BASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… scenarios.js
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { garde, paliers, VUS, page, action, actionDisponible, ouvrirSession, attendreJob } from './lib.js';

const SCENARIO = __ENV.SCENARIO || 'mixte';
const C = JSON.parse(open('./comptes.json')); // produit par seed.mjs (environnement de test)

const endurance = SCENARIO === 'endurance';
export const options = {
  scenarios: {
    [SCENARIO]: endurance
      ? { executor: 'constant-vus', vus: VUS, duration: __ENV.DUREE || '6h', exec: 'mixte' }
      : { executor: 'ramping-vus', startVUs: 0, stages: paliers(), exec: SCENARIO, gracefulRampDown: '2m' },
  },
  // Seuils = définition de « ça tient » pour SJP. Un seuil franchi = palier où SJP se dégrade.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:api_jobs_suivi}': ['p(95)<800'],
    sjp_page_ms: ['p(95)<2500'],
    sjp_erreurs_metier: ['rate<0.02'],
    sjp_jobs_echoues: ['count<1'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() { garde(VUS); }

const vu = () => exec.vu.idInTest - 1;
const pick = (arr) => arr[vu() % arr.length];
const pause = (min, max) => sleep(min + Math.random() * (max - min)); // temps de lecture humain

// --- Authentification ------------------------------------------------------------------------
export function inscription() {
  page('/inscription', 'inscription');
  pause(3, 8); // l'étudiant remplit le formulaire
  const email = `charge+${exec.vu.idInTest}-${exec.vu.iterationInScenario}-${Date.now()}@sjp-test.invalid`;
  const { valeur } = action('signUpFree', '/inscription', [email, 'MotDePasse-Test-2026', { niveau: 'L1', source: 'whatsapp' }]);
  check(valeur, { 'compte créé': (v) => !!v && v.success === true });
  pause(5, 15);
}

export function connexion() {
  const c = pick(C.premium);
  page('/login', 'login');
  pause(2, 5);
  const { valeur } = action('login', '/login', [c.email, c.password]);
  check(valeur, { 'connecté': (v) => !!v && v.success === true });
  page('/app/dashboard', 'dashboard');
  pause(10, 30);
}

// --- Codes Premium ---------------------------------------------------------------------------
export function code_distinct() {
  const c = C.code[vu() % C.code.length];
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  page('/app/compte', 'compte');
  pause(2, 6);
  const { valeur } = action('activateAccessCode', '/app/compte', [c.code]);
  check(valeur, { 'Premium activé': (v) => !!v && v.success === true });
  page('/app/dashboard', 'dashboard');
  pause(20, 40);
}

export function code_meme() {
  const c = pick(C.meme_code.comptes);
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  const { valeur } = action('activateAccessCode', '/app/compte', [C.meme_code.code]);
  // Attendu : UN seul succès sur l'ensemble du test ; tous les autres reçoivent « code non valide ».
  check(valeur, { 'réponse propre (succès ou refus)': (v) => !!v && (v.success === true || typeof v.error === 'string') });
  pause(20, 40);
}

export function expiration() {
  const c = pick(C.expire);
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  const d = page('/app/dashboard', 'dashboard');
  // Abonnement expiré : expérience Free (incitation à passer Premium visible), sans erreur.
  check(d, { 'redevenu Free sans erreur': (r) => r.status === 200 && /Premium/.test(String(r.body)) });
  const { valeur } = action('startEtude', `/app/etude/${c.doc}`, [c.doc]);
  check(valeur, { 'étude Premium refusée proprement': (v) => !!v && typeof v.error === 'string' });
  pause(20, 40);
}

// --- Études guidées --------------------------------------------------------------------------
function parcoursEtude(c, doc) {
  page(`/app/etude/${doc}`, 'etude_accueil');
  pause(2, 5);
  const debut = Date.now();
  const { valeur } = action('startEtude', `/app/etude/${doc}`, [doc]);
  if (!valeur?.success) return;
  if (valeur.jobId && attendreJob(valeur.jobId, debut) !== 'ok') return;
  page(`/app/etude/${doc}/synthese`, 'etude_synthese');
  pause(30, 90); // lecture de la synthèse
  action('markSyntheseVue', `/app/etude/${doc}/synthese`, [doc]);
  const t2 = Date.now();
  const seq = action('prepareSequence', `/app/etude/${doc}`, [doc, 1]).valeur;
  if (seq?.jobId && attendreJob(seq.jobId, t2) !== 'ok') return;
  page(`/app/etude/${doc}/sequence/1`, 'etude_sequence');
  pause(20, 60);
  for (let essai = 0; essai < 2; essai++) {
    const r = action('answerActivity', `/app/etude/${doc}/sequence/1`, [{
      documentId: doc, ordre: 1, activiteId: 'a1', reponse: essai === 0 ? 'B' : 'A', requestId: uuid(),
    }]).valeur;
    if (r?.success) break;
    pause(5, 15);
  }
}

export function etude_distinct() {
  const c = pick(C.premium);
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  parcoursEtude(c, c.docDistinct);
  pause(10, 30);
}

export function etude_meme() {
  const c = pick(C.premium);
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  parcoursEtude(c, c.docPartage);
  pause(10, 30);
}

// --- Rédaction -------------------------------------------------------------------------------
const TYPES = ['cas-pratique', 'dissertation', 'commentaire'];
const ENONCE = 'Monsieur K. a conclu avec la société B. un contrat de vente portant sur un véhicule. '.repeat(3);
const COPIE = 'Introduction. Le problème posé est celui de la formation du contrat et de ses effets. '.repeat(8);

export function redaction() {
  const c = pick(C.premium);
  if (!ouvrirSession(c.email, c.password)) fail('connexion du compte de test impossible');
  const slug = TYPES[(vu() + exec.vu.iterationInScenario) % 3];
  page('/app/redaction', 'redaction_accueil');
  pause(3, 8);
  const cree = action('createRedaction', '/app/redaction', [{ slug, source: 'libre', documentId: null, sujet: 'Sujet de test de charge', enonce: ENONCE }]).valeur;
  if (!cree?.id) return;
  const copie = `/app/redaction/${cree.id}`;
  page(copie, 'redaction_copie');
  // Rédaction : sauvegardes automatiques au fil de la frappe (toutes les ~1,5 s d'inactivité).
  for (let i = 1; i <= 6; i++) { pause(20, 60); action('updateRedactionContent', copie, [cree.id, COPIE.slice(0, 120 * i)]); }
  const t = Date.now();
  const sub = action('submitRedaction', copie, [cree.id]).valeur;
  if (sub?.jobId) attendreJob(sub.jobId, t);
  page(copie, 'redaction_rapport');
  // Ne pas saturer la limite de copies (sinon : prévoir plus de comptes que d'itérations).
  if (actionDisponible('deleteRedaction')) action('deleteRedaction', '/app/redaction', [cree.id]);
  pause(10, 30);
}

// --- La vraie vie ----------------------------------------------------------------------------
// Répartition observée chez des étudiants en révision : surtout de la lecture et de la navigation,
// une part plus faible déclenche de l'IA.
export function mixte() {
  const r = (vu() * 7 + exec.vu.iterationInScenario) % 20;
  if (r < 8) {                              // 40 % : navigation et lecture
    const c = pick(C.premium);
    if (!ouvrirSession(c.email, c.password)) return;
    page('/app/dashboard', 'dashboard'); pause(10, 30);
    page('/app/matieres', 'matieres'); pause(10, 40);
    page(`/app/etude/${c.docPartage}`, 'etude_accueil'); pause(20, 60);
  } else if (r < 12) etude_meme();          // 20 % : étude d'un cours déjà partagé
  else if (r < 14) etude_distinct();        // 10 % : étude d'un cours personnel
  else if (r < 18) redaction();             // 20 % : rédaction
  else if (r < 19) connexion();             //  5 % : connexions
  else expiration();                        //  5 % : abonnements expirés
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    return (ch === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}
