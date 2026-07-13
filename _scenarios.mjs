import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; import crypto from 'crypto';
dotenv.config({ path: '.env.local', quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = 'https://tuina-ai.vercel.app';
const ref = URL.match(/https:\/\/([^.]+)\./)[1];
const sha256 = x => crypto.createHash('sha256').update(x || '').digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = (max) => sleep(Math.floor(Math.random() * max));
const cleanup = [];

const { data: srcDoc } = await admin.from('documents').select('extracted_text').not('extracted_text', 'is', null).limit(1).single();
const SRCTEXT = srcDoc.extracted_text;

// Fetch increvable : retry/backoff sur erreurs réseau transitoires (undici "fetch failed", ECONNRESET, timeout).
// Ne masque PAS les erreurs applicatives (un HTTP 4xx/5xx est renvoyé tel quel, pas de retry).
async function netFetch(url, opts = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1) + Math.floor(Math.random() * 300));
    }
  }
  throw lastErr;
}

// Retry generique sur hoquet DNS/reseau local (ENOTFOUND, fetch failed) pour tout appel Supabase.
// Les appels Supabase ne "throw" que sur echec reseau (les erreurs DB reviennent dans {error}).
async function rt(fn, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; await sleep(600 * (i + 1) + Math.floor(Math.random() * 300)); }
  }
  throw lastErr;
}

async function mkStudent(tag) {
  const email = `sc_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`, password = 'Test123456!';
  const { data: c } = await rt(() => admin.auth.admin.createUser({ email, password, email_confirm: true }));
  const uid = c.user.id;
  await rt(() => admin.from('user_roles').insert({ user_id: uid, email, role: 'student' }));
  await rt(() => admin.from('access_codes').insert({ code: `SC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, email, status: 'active' }));
  const pub = createClient(URL, ANON);
  const { data: s } = await rt(() => pub.auth.signInWithPassword({ email, password }));
  const payload = 'base64-' + Buffer.from(JSON.stringify(s.session)).toString('base64');
  const base = `sb-${ref}-auth-token`; const MAX = 3180; const parts = [];
  if (payload.length <= MAX) parts.push(`${base}=${payload}`); else for (let i = 0, n = 0; i < payload.length; i += MAX, n++) parts.push(`${base}.${n}=${payload.slice(i, i + MAX)}`);
  cleanup.push(async () => { await admin.from('access_codes').delete().eq('email', email); await admin.from('user_roles').delete().eq('user_id', uid); await admin.auth.admin.deleteUser(uid); });
  return { uid, email, cookie: parts.join('; ') };
}
async function mkDoc(uid, text) {
  const { data: d } = await rt(() => admin.from('documents').insert({ user_id: uid, nom: 'SC', url: 'https://x', url_fichier: 'https://x', type: 'pdf', extracted_text: text }).select('id').single());
  cleanup.push(async () => {
    const { data: c } = await admin.from('etude_cours').select('id').eq('pdf_id', d.id);
    for (const cc of c || []) await admin.from('etude_sections').delete().eq('cours_id', cc.id);
    await admin.from('etude_cours').delete().eq('pdf_id', d.id);
    await admin.from('documents').delete().eq('id', d.id);
    await admin.from('etude_generation_locks').delete().eq('hash', sha256(text));
  });
  return d.id;
}
const af = (path, cookie, opts = {}) => netFetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), Cookie: cookie }, redirect: 'manual' });
const pokeWorker = () => netFetch(`${BASE}/api/worker/process`, { method: 'POST' }, 2).catch(() => {});
// Comptage EXACT : appels Gemini reussis (worker_master) attribues UNIQUEMENT aux document_id de MES
// docs de test. Immunise contre les vrais utilisateurs qui genereraient une Etude pendant le test.
// Lecture admin resiliente : retry sur hoquet DNS/reseau local (ENOTFOUND, fetch failed). Renvoie data|null.
async function adminRetry(fn, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const { data } = await fn(); return data; }
    catch (e) { await sleep(600 * (i + 1)); }
  }
  return null;
}
async function geminiForDocs(docIds) {
  if (!docIds.length) return 0;
  const { count } = await rt(() => admin.from('saas_metrics').select('id', { count: 'exact', head: true }).eq('feature', 'worker_master').in('document_id', docIds));
  return count || 0;
}
// Nettoyage des docs de test residuels d'anciens runs (evite toute contamination de mesure).
async function purgeLeftovers() {
  const { data: docs } = await admin.from('documents').select('id').eq('nom', 'SC');
  for (const d of docs || []) {
    const { data: c } = await admin.from('etude_cours').select('id').eq('pdf_id', d.id);
    for (const cc of c || []) await admin.from('etude_sections').delete().eq('cours_id', cc.id);
    await admin.from('etude_cours').delete().eq('pdf_id', d.id);
    await admin.from('documents').delete().eq('id', d.id);
  }
  await admin.from('etude_generation_locks').delete().lt('expires_at', new Date().toISOString());
  console.log(`(nettoyage prealable: ${(docs || []).length} doc(s) de test residuel(s) supprime(s))`);
}

// Flux complet d'un utilisateur : generate -> poll status -> charger la vraie page (comme le reload frontend).
async function userFlow(student, docId) {
  const t0 = Date.now();
  await jitter(500); // étalement léger des départs concurrents (évite le hammering exact au même instant)
  let gr, gd;
  try {
    gr = await af('/api/etude/generate', student.cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId: docId }) });
  } catch (e) { return { error: `generate reseau: ${e.message}` }; }
  try { gd = await gr.json(); } catch { return { error: `generate HTTP ${gr.status}` }; }
  if (!gd.coursId && gd.status !== 'pret') return { error: `generate: ${JSON.stringify(gd)}` };
  pokeWorker();
  let status = gd.status, tPret = null;
  for (let i = 0; i < 120 && status !== 'pret'; i++) { // patience 300s (laisse l'auto-guerison operer)
    await sleep(2500);
    let sr; try { sr = await af(`/api/etude/status?coursId=${gd.coursId}`, student.cookie); status = (await sr.json()).status; } catch { status = '?'; }
    if (status === 'pret') { tPret = Date.now(); break; }
    if (status === 'erreur') return { error: 'job erreur', tPret: null };
    pokeWorker();
  }
  if (status !== 'pret') return { error: 'timeout (jamais pret)', stuck: true };
  // Charger la vraie page (comme le reload le ferait). Lectures admin resilientes (retry sur hoquet DNS/reseau local).
  const cours = await adminRetry(() => admin.from('etude_cours').select('id').eq('pdf_id', docId).single());
  if (!cours) return { error: 'lecture cours impossible (reseau)', tPretMs: tPret - t0 };
  const secs = await adminRetry(() => admin.from('etude_sections').select('titre').eq('cours_id', cours.id).order('ordre').limit(1));
  const marker = secs?.[0]?.titre;
  const pr = await af(`/app/etude/${docId}`, student.cookie);
  const html = await pr.text();
  const rendered = pr.status === 200 && marker && html.includes(marker) && !html.includes('assemblage de votre cours');
  return { tPretMs: tPret - t0, tRenderMs: Date.now() - t0, rendered, httpStatus: pr.status, error: null };
}

function pass(b) { return b ? 'PASS ✅' : 'FAIL ❌'; }

// ---- SCENARIO 1 : 1 user, nouveau PDF, affichage auto ----
async function scenario1() {
  console.log('\n===== SCENARIO 1 : 1 user importe un nouveau PDF (affichage auto sans refresh) =====');
  const st = await mkStudent('s1'); const doc = await mkDoc(st.uid, SRCTEXT + `\n[S1 ${Date.now()}]`);
  const r = await userFlow(st, doc);
  const g = await geminiForDocs([doc]);
  console.log(`  Gemini=${g} | pret=${r.tPretMs ? (r.tPretMs / 1000).toFixed(0) + 's' : '-'} | rendu page=${r.rendered} | http=${r.httpStatus} | err=${r.error || 'aucune'}`);
  const ok = r.rendered && !r.error && g === 1;
  console.log(`  => ${pass(ok)}`);
  return ok;
}

// ---- Générique N users concurrents ----
async function scenarioN(title, n, sameContent) {
  console.log(`\n===== ${title} =====`);
  const commonMarker = `[SAME ${Date.now()}_${Math.random()}]`;
  const students = []; const docs = [];
  for (let i = 0; i < n; i++) { const st = await mkStudent('sn'); students.push(st); docs.push(await mkDoc(st.uid, SRCTEXT + (sameContent ? `\n${commonMarker}` : `\n[DIFF ${Date.now()}-${i}-${Math.random()}]`))); }
  const results = await Promise.all(students.map((st, i) => userFlow(st, docs[i]).catch(e => ({ error: e.message }))));
  const g = await geminiForDocs(docs);
  const rendered = results.filter(r => r.rendered).length;
  const stuck = results.filter(r => r.stuck).length;
  const errs = results.filter(r => r.error).map(r => r.error);
  const times = results.filter(r => r.tPretMs).map(r => r.tPretMs / 1000);
  console.log(`  Rendus=${rendered}/${n} | Bloques95%=${stuck} | Gemini=${g} | temps pret min/max=${times.length ? Math.min(...times).toFixed(0) + '/' + Math.max(...times).toFixed(0) + 's' : '-'}`);
  if (errs.length) console.log(`  Erreurs: ${errs.slice(0, 10).join(' | ')}`);
  return { rendered, n, g, stuck, errs };
}

// ---- SCENARIO 4 : 10 users simultanes, mixte (5 meme PDF + 5 PDF differents) ----
async function scenario4() {
  console.log('\n===== SCENARIO 4 : 10 users simultanes (5 MEME PDF + 5 PDF DIFFERENTS) — aucun bloque a 95% =====');
  const commonMarker = `[S4SAME ${Date.now()}_${Math.random()}]`;
  const students = []; const docs = [];
  for (let i = 0; i < 10; i++) {
    const st = await mkStudent('s4'); students.push(st);
    const same = i < 5;
    docs.push(await mkDoc(st.uid, SRCTEXT + (same ? `\n${commonMarker}` : `\n[S4DIFF ${Date.now()}-${i}-${Math.random()}]`)));
  }
  const results = await Promise.all(students.map((st, i) => userFlow(st, docs[i]).catch(e => ({ error: e.message }))));
  const g = await geminiForDocs(docs);
  const rendered = results.filter(r => r.rendered).length;
  const stuck = results.filter(r => r.stuck).length;
  const errs = results.filter(r => r.error).map(r => r.error);
  const times = results.filter(r => r.tPretMs).map(r => r.tPretMs / 1000);
  console.log(`  Rendus=${rendered}/10 | Bloques95%=${stuck} | Gemini=${g} (attendu ~6 : 1 groupe meme + 5 differents) | temps pret min/max=${times.length ? Math.min(...times).toFixed(0) + '/' + Math.max(...times).toFixed(0) + 's' : '-'}`);
  if (errs.length) console.log(`  Erreurs: ${errs.slice(0, 10).join(' | ')}`);
  const ok = rendered === 10 && stuck === 0;
  console.log(`  => ${pass(ok)} (rendus=${rendered}/10, bloques=${stuck})`);
  return ok;
}

// ---- SCENARIO 5 : ancien cours ouvre instantanement ----
async function scenario5() {
  console.log('\n===== SCENARIO 5 : ancien cours (deja genere) ouvre instantanement =====');
  const st = await mkStudent('s5'); const doc = await mkDoc(st.uid, SRCTEXT + `\n[S5 ${Date.now()}]`);
  const gr = await af('/api/etude/generate', st.cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId: doc }) });
  const gd = await gr.json();
  pokeWorker();
  let status = ''; for (let i = 0; i < 90 && status !== 'pret'; i++) { await sleep(2500); const sr = await af(`/api/etude/status?coursId=${gd.coursId}`, st.cookie); status = (await sr.json()).status; if (status !== 'pret') pokeWorker(); }
  if (status !== 'pret') { console.log('  => FAIL ❌ (pre-generation jamais prete)'); return false; }
  const cours = await adminRetry(() => admin.from('etude_cours').select('id').eq('pdf_id', doc).single());
  if (!cours) { console.log('  => FAIL ❌ (lecture cours impossible - reseau)'); return false; }
  const secs = await adminRetry(() => admin.from('etude_sections').select('titre').eq('cours_id', cours.id).order('ordre').limit(1));
  const t0 = Date.now();
  const pr = await af(`/app/etude/${doc}`, st.cookie); const html = await pr.text();
  const dt = Date.now() - t0;
  const rendered = pr.status === 200 && secs?.[0] && html.includes(secs[0].titre) && !html.includes('assemblage de votre cours');
  const ok = rendered && dt < 5000;
  console.log(`  Ouverture ancien cours: ${dt}ms | rendu=${rendered} | http=${pr.status}`);
  console.log(`  => ${pass(ok)}`);
  return ok;
}

async function run() {
  const verdicts = {};
  const gap = () => sleep(25000); // espacement entre scenarios : laisse Gemini se liberer (steady-state realiste)
  try {
    await purgeLeftovers();
    verdicts['1'] = await scenario1();
    await gap();

    const r2 = await scenarioN('SCENARIO 2 : 2 users, PDF DIFFERENTS (les deux recoivent leur resultat)', 2, false);
    verdicts['2'] = r2.rendered === 2 && r2.stuck === 0;
    console.log(`  => ${pass(verdicts['2'])} (rendus=${r2.rendered}/2, Gemini=${r2.g})`);
    await gap();

    const r3 = await scenarioN('SCENARIO 3 : 2 users, MEME PDF (Gemini=1 attendu, les deux recoivent leur etude)', 2, true);
    verdicts['3'] = r3.rendered === 2 && r3.g === 1 && r3.stuck === 0;
    console.log(`  => ${pass(verdicts['3'])} (rendus=${r3.rendered}/2, Gemini=${r3.g})`);
    await gap();

    verdicts['4'] = await scenario4();
    await gap();

    verdicts['5'] = await scenario5();
  } finally {
    console.log('\nNettoyage...');
    for (const c of cleanup) { try { await c(); } catch {} }
    console.log('OK nettoye.');
    console.log('\n========== RECAPITULATIF ==========');
    for (const k of ['1', '2', '3', '4', '5']) console.log(`  Scenario ${k}: ${verdicts[k] === undefined ? 'NON EXECUTE' : pass(verdicts[k])}`);
    const all = ['1', '2', '3', '4', '5'].every(k => verdicts[k]);
    console.log(`\n  VERDICT GLOBAL: ${all ? 'TOUS PASS ✅ — correctif valide' : 'AU MOINS UN FAIL ❌ — correctif NON valide'}`);
  }
}
run().catch(e => { console.error(e); process.exit(1); });
