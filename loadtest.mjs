import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config({ path: '.env.local', quiet: true });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = 'https://tuina-ai.vercel.app';
const USER = '0f35e7bb-0849-4a94-a5f3-6acdaf2b0e4d';
const DOC = 'ddf1172a-47d0-4f83-9681-942f54e20cb8';
const sha256 = (x) => crypto.createHash('sha256').update(x || '').digest('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const N = Number(process.argv[2] || 12);
const TYPE = 'qcm', COUNT = 5;

async function countGemini(sinceIso, feature) {
  const { count } = await s.from('saas_metrics').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso).eq('feature', feature);
  return count || 0;
}

async function run() {
  // 0. cache froid : supprimer l'entree evaluation_cache de ce contenu
  const { data: doc } = await s.from('documents').select('extracted_text').eq('id', DOC).single();
  const srcHash = sha256(doc.extracted_text);
  await s.from('evaluation_cache').delete().eq('source_hash', srcHash).eq('type', TYPE).eq('count', COUNT);
  // nettoyer d'eventuels jobs/evals de test precedents
  await s.from('ai_jobs').delete().eq('user_id', USER).eq('type', 'evaluation');

  const startIso = new Date().toISOString();
  const t0 = Date.now();

  // 1. Enqueue N jobs identiques
  const rows = Array.from({ length: N }, () => ({ user_id: USER, type: 'evaluation', status: 'queued', payload: { documentId: DOC, type: TYPE, count: COUNT, documentName: 'LOADTEST' } }));
  const { data: jobs, error } = await s.from('ai_jobs').insert(rows).select('id');
  if (error) { console.log('enqueue err', error.message); return; }
  const ids = jobs.map(j => j.id);
  console.log(`[${N} jobs enqueues] cache vide. Declenchement de ${N} workers concurrents...`);

  // 2. Declencher N workers concurrents (chacun lease 1 job)
  await Promise.all(ids.map(() =>
    fetch(`${BASE}/api/worker/ai`, { method: 'POST' }).then(r => r.text()).catch(() => 'net-err')
  ));

  // 3. Attendre l'etat terminal
  let done = 0, err = 0;
  for (let i = 0; i < 60; i++) {
    const { data: st } = await s.from('ai_jobs').select('status').in('id', ids);
    done = st.filter(x => x.status === 'done').length;
    err = st.filter(x => x.status === 'error').length;
    const proc = st.filter(x => x.status === 'processing').length;
    const q = st.filter(x => x.status === 'queued').length;
    if (done + err === N) break;
    if (i % 3 === 0) console.log(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s  done=${done} error=${err} processing=${proc} queued=${q}`);
    // relancer un worker pour drainer la file (comme le ferait le cron)
    fetch(`${BASE}/api/worker/ai`, { method: 'POST' }).catch(() => {});
    await sleep(3000);
  }

  // 4. Mesures
  const geminiCalls = await countGemini(startIso, 'evaluate_qcm');
  const { data: finalJobs } = await s.from('ai_jobs').select('id,status,error,result,created_at,updated_at').in('id', ids);
  const times = finalJobs.filter(j => j.status === 'done').map(j => (new Date(j.updated_at) - new Date(j.created_at)) / 1000);
  const evalIds = finalJobs.map(j => j.result?.evaluationId).filter(Boolean);
  const distinctEvals = new Set(evalIds).size;
  const attempts = await s.from('ai_jobs').select('attempts').in('id', ids);

  console.log('\n===== RESULTATS =====');
  console.log(`Jobs crees      : ${N}`);
  console.log(`Jobs done       : ${done}`);
  console.log(`Jobs error      : ${err}`);
  console.log(`Appels Gemini   : ${geminiCalls}   <-- ${geminiCalls === 1 ? 'DEDUP OK (1 seul)' : geminiCalls <= 3 ? 'quasi-dedup' : 'THUNDERING HERD'}`);
  console.log(`Evaluations creees: ${evalIds.length} (distinctes: ${distinctEvals})`);
  console.log(`Temps done (s)  : min=${Math.min(...times).toFixed(0)} avg=${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} max=${Math.max(...times).toFixed(0)}`);
  const errs = finalJobs.filter(j => j.status === 'error').map(j => j.error);
  if (errs.length) console.log('Erreurs:', errs.slice(0, 5));

  // 5. Cleanup
  await s.from('ai_jobs').delete().in('id', ids);
  if (evalIds.length) await s.from('evaluations').delete().in('id', evalIds);
  console.log('(nettoye)');
}
run().catch(e => { console.error(e); process.exit(1); });
