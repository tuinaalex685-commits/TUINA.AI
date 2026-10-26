// Relève les identifiants des actions serveur (Next.js les change à chaque build) → actions.json.
//
//   node tests/charge/action-ids.mjs                (lit le JavaScript du déploiement BASE_URL, connecté avec
//                                                    le premier compte de comptes.json)
//   node tests/charge/action-ids.mjs --local        (lit .next/server/server-reference-manifest.json d'une build locale)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const VOULUES = ['signUpFree', 'login', 'activateAccessCode', 'startEtude', 'markSyntheseVue', 'prepareSequence',
  'answerActivity', 'createRedaction', 'updateRedactionContent', 'submitRedaction', 'deleteRedaction'];
const sortie = new URL('./actions.json', import.meta.url);

function ecrire(ids) {
  const manquantes = VOULUES.filter((n) => !ids[n]);
  writeFileSync(sortie, JSON.stringify(ids, null, 2));
  console.log(`actions.json : ${Object.keys(ids).length} actions.` + (manquantes.length ? ` MANQUANTES : ${manquantes.join(', ')}` : ' Toutes présentes.'));
  if (manquantes.length) process.exitCode = 1;
}

if (process.argv.includes('--local')) {
  const f = '.next/server/server-reference-manifest.json';
  if (!existsSync(f)) { console.error(`${f} introuvable : lancer « npm run build » d'abord.`); process.exit(1); }
  const man = JSON.parse(readFileSync(f, 'utf8'));
  const ids = {};
  for (const [id, e] of Object.entries(man.node || {})) if (VOULUES.includes(e.exportedName)) ids[e.exportedName] = id;
  ecrire(ids);
} else {
  const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');
  const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const KEY = process.env.SUPABASE_ANON_KEY || '';
  if (!BASE || !SB || !KEY) { console.error('BASE_URL, SUPABASE_URL et SUPABASE_ANON_KEY sont obligatoires.'); process.exit(1); }
  const comptes = JSON.parse(readFileSync(new URL('./comptes.json', import.meta.url), 'utf8'));
  const c = comptes.premium[0];

  // Session comme dans le navigateur (cookie @supabase/ssr) pour ouvrir les pages de l'application.
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (!r.ok) { console.error('Connexion du compte de test impossible.'); process.exit(1); }
  const s = await r.json();
  const ref = SB.replace(/^https?:\/\//, '').split('.')[0];
  const v = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url');
  const parts = v.length <= 3180 ? [[`sb-${ref}-auth-token`, v]] : (v.match(/.{1,3180}/g) || []).map((p, i) => [`sb-${ref}-auth-token.${i}`, p]);
  const cookie = parts.map(([k, val]) => `${k}=${val}`).join('; ');

  const pages = ['/login', '/inscription', '/app/compte', '/app/redaction', `/app/etude/${c.docPartage}`];
  const scripts = new Set();
  for (const p of pages) {
    const html = await (await fetch(`${BASE}${p}`, { headers: { cookie } })).text();
    for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)) scripts.add(new URL(m[1], BASE).href);
    for (const m of html.matchAll(/(\/_next\/static\/chunks\/[\w\-./]+\.js)/g)) scripts.add(new URL(m[1], BASE).href);
  }
  // Référence d'action dans le JavaScript client : createServerReference("<id>", …, "<nom>")
  const ids = {};
  const motif = /createServerReference\)?\(\s*"([0-9a-f]{40,})"[^)]*?"([A-Za-z_$][\w$]*)"\s*\)/g;
  for (const u of scripts) {
    const js = await (await fetch(u)).text();
    for (const m of js.matchAll(motif)) if (VOULUES.includes(m[2])) ids[m[2]] = m[1];
  }
  ecrire(ids);
  if (process.exitCode) console.error('Si des noms manquent, utiliser --local sur une build du même commit.');
}
