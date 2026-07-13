import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: docs, error: de } = await admin.from('documents').select('id, nom').eq('nom','SC');
if (de) console.log('err docs:', de.message);
const ids = (docs||[]).map(d=>d.id);
console.log('Docs test (nom=SC) actuellement en base:', ids.length);
if (ids.length) {
  const { data: jobs } = await admin.from('etude_cours')
    .select('id, pdf_id, statut_generation, retry_count, next_retry, last_error, created_at, heartbeat')
    .in('pdf_id', ids)
    .order('created_at', { ascending: false });
  for (const j of jobs||[]) {
    console.log(`  ${(j.statut_generation||'?').padEnd(10)} retry=${j.retry_count||0} next_retry=${j.next_retry?new Date(j.next_retry).toISOString().slice(11,19):'-'} err=${(j.last_error||'-').slice(0,90)}`);
  }
  const { data: mets } = await admin.from('saas_metrics').select('document_id').eq('feature','worker_master').in('document_id', ids);
  console.log('worker_master sur mes docs de test:', (mets||[]).length);
}
