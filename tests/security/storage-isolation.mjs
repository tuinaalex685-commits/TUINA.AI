// Isolation du stockage des PDF (base de TEST uniquement ; refuse la production).
// Un étudiant A dépose un PDF fictif ; on vérifie ce que peuvent faire un visiteur anonyme
// (clé publique seule) et un autre étudiant B. Lancer : node --env-file=.env.test.local tests/security/storage-isolation.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL_ = process.env.TEST_SUPABASE_URL, PUB = process.env.TEST_SUPABASE_ANON_KEY, SECRET = process.env.TEST_SUPABASE_SERVICE_KEY;
if (!URL_ || !PUB || !SECRET) { console.error('Variables TEST_SUPABASE_* manquantes.'); process.exit(1); }
if (URL_.includes('mqyivcuoplcpwyjkufur')) { console.error('Refus : production.'); process.exit(1); }

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const lot = randomBytes(3).toString('hex');
const mdp = 'Isolation-Test-2026';
const mk = async (n) => {
  const email = `iso-${lot}-${n}@sjp-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: mdp, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: mdp });
  if (e2) throw e2;
  return { id: data.user.id, c };
};

const A = await mk('a'), B = await mk('b');
const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
const chemin = `${A.id}/cours-prive.pdf`;
const up = await A.c.storage.from('documents').upload(chemin, Buffer.from('%PDF-1.4 fictif'), { contentType: 'application/pdf', upsert: false });

const r = {
  'A dépose son PDF': !up.error,
  'A lit son PDF': !(await A.c.storage.from('documents').download(chemin)).error,
  'ANONYME liste le dossier de A': ((await anon.storage.from('documents').list(A.id)).data || []).length > 0,
  'ANONYME télécharge le PDF de A': !(await anon.storage.from('documents').download(chemin)).error,
  'B (autre étudiant) télécharge le PDF de A': !(await B.c.storage.from('documents').download(chemin)).error,
};
for (const [k, v] of Object.entries(r)) console.log(`${v ? 'OUI' : 'non'}  ${k}`);
const fuite = r['ANONYME liste le dossier de A'] || r['ANONYME télécharge le PDF de A'] || r['B (autre étudiant) télécharge le PDF de A'];
console.log(fuite ? '\nRÉSULTAT : FUITE — un tiers accède au PDF d’un étudiant.' : '\nRÉSULTAT : isolé — seul le propriétaire accède à son PDF.');

await admin.storage.from('documents').remove([chemin]);
await admin.auth.admin.deleteUser(A.id); await admin.auth.admin.deleteUser(B.id);
process.exit(fuite ? 2 : (r['A dépose son PDF'] && r['A lit son PDF'] ? 0 : 3));
