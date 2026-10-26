// Prépare la base de TEST pour k6 : comptes, codes, PDF de cours. Écrit comptes.json.
//
//   node tests/charge/seed.mjs            (variables : TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_KEY, COMPTES=1100)
//   node tests/charge/seed.mjs --nettoyer (supprime tout ce que ce script a créé)
//
// Refuse de tourner sur le projet de production. Tous les comptes créés sont en @sjp-test.invalid.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';

const URL_ = process.env.TEST_SUPABASE_URL || '';
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY || '';
const N = Number(process.env.COMPTES || 1100);
const PROD_REF = 'mqyivcuoplcpwyjkufur';
const DOMAINE = '@sjp-test.invalid';
const MDP = 'MotDePasse-Test-2026';

if (!URL_ || !KEY) { console.error('TEST_SUPABASE_URL et TEST_SUPABASE_SERVICE_KEY sont obligatoires.'); process.exit(1); }
if (URL_.includes(PROD_REF)) { console.error('Refus : ce projet est la PRODUCTION.'); process.exit(1); }

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// --- PDF minimal avec du vrai texte (lisible par pdf-parse, donc analysable par le moteur) ---------
const THEMES = ['la formation du contrat', 'la responsabilite civile', 'les actes administratifs', 'la procedure penale',
  'le droit des biens', 'les regimes matrimoniaux', 'la hierarchie des normes', 'les obligations du vendeur'];
function texteCours(graine) {
  const theme = THEMES[graine % THEMES.length];
  const pages = [];
  for (let p = 1; p <= 6; p++) {
    let t = `Cours n${graine} - Chapitre ${p} : ${theme}. `;
    for (let i = 0; i < 14; i++) {
      t += `Section ${p}.${i + 1}. La notion etudiee (variante ${graine}-${p}-${i}) se definit par ses conditions, `
        + `ses exceptions et ses effets. Le juge apprecie souverainement les faits ; la doctrine distingue plusieurs regimes. `;
    }
    pages.push(t);
  }
  return pages;
}
function pdf(pages) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
  const wrap = (s) => s.match(/.{1,95}(\s|$)/g) || [s];
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const texte of pages) {
    const lignes = wrap(texte).map((l) => `(${esc(l.trim())}) '`).join('\n');
    const flux = `BT /F1 10 Tf 12 TL 50 800 Td\n${lignes}\nET`;
    objs.push(`<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`);
    const contenu = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contenu} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const off = Buffer.byteLength(out); out += `${i + 1} 0 obj\n${o}\nendobj\n`; return off; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// --- Création ---------------------------------------------------------------------------------
async function compte(prefixe, i) {
  const email = `${prefixe}-${i}${DOMAINE}`;
  const { data, error } = await db.auth.admin.createUser({ email, password: MDP, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw new Error(`${email} : ${error.message}`);
  let id = data?.user?.id;
  if (!id) {
    const { data: r } = await db.from('user_roles').select('user_id').eq('email', email).maybeSingle();
    id = r?.user_id;
  }
  return { id, email, password: MDP };
}
async function docPour(userId, nom, bytes) {
  const path = `${userId}/${nom}.pdf`;
  const up = await db.storage.from('documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(`stockage : ${up.error.message}`);
  const url = db.storage.from('documents').getPublicUrl(path).data.publicUrl;
  const { data, error } = await db.from('documents')
    .insert({ nom: `${nom}.pdf`, type: 'pdf', url, url_fichier: url, taille: bytes.length, user_id: userId })
    .select('id').single();
  if (error) throw new Error(`document : ${error.message}`);
  return data.id;
}
const code = () => 'CHARGE-' + randomBytes(6).toString('hex').toUpperCase();
async function parLots(n, f, lot = 20) {
  const out = [];
  for (let i = 0; i < n; i += lot) {
    out.push(...await Promise.all(Array.from({ length: Math.min(lot, n - i) }, (_, k) => f(i + k))));
    process.stdout.write(`\r  ${Math.min(i + lot, n)}/${n}`);
  }
  process.stdout.write('\n');
  return out;
}

async function remplir() {
  const partage = pdf(texteCours(0)); // même contenu pour tous : mutualisation attendue
  const plusTard = new Date(Date.now() + 30 * 86400000).toISOString();
  const passe = new Date(Date.now() - 3600000).toISOString();

  console.log('Comptes Premium (cours personnel + cours partagé)…');
  const premium = await parLots(N, async (i) => {
    const c = await compte('premium', i);
    await db.from('access_codes').upsert({ code: code(), email: c.email, status: 'active', expires_at: plusTard }, { onConflict: 'email' });
    return { ...c, docDistinct: await docPour(c.id, `cours-perso-${i}`, pdf(texteCours(i + 1))), docPartage: await docPour(c.id, 'cours-partage', partage) };
  });

  console.log('Comptes Free avec un code chacun…');
  const codes = await parLots(N, async (i) => {
    const c = await compte('code', i);
    const k = code();
    await db.from('access_codes').insert({ code: k, status: 'active' });
    return { ...c, code: k };
  });

  console.log('Comptes Free pour le même code…');
  const memeCode = code();
  await db.from('access_codes').insert({ code: memeCode, status: 'active' });
  const meme = await parLots(Math.min(N, 300), (i) => compte('meme', i));

  console.log('Comptes à l’abonnement expiré…');
  const expire = await parLots(N, async (i) => {
    const c = await compte('expire', i);
    await db.from('access_codes').upsert({ code: code(), email: c.email, status: 'active', expires_at: passe }, { onConflict: 'email' });
    return { ...c, doc: await docPour(c.id, 'cours-expire', partage) };
  });

  writeFileSync(new URL('./comptes.json', import.meta.url), JSON.stringify({
    premium, code: codes, meme_code: { code: memeCode, comptes: meme }, expire, genere_le: new Date().toISOString(), lot: randomUUID(),
  }));
  console.log('comptes.json écrit (à ne jamais publier : mots de passe de test).');
}

async function nettoyer() {
  // Liste complète d'abord : supprimer pendant la pagination ferait sauter des comptes.
  const cibles = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    cibles.push(...data.users.filter((u) => u.email?.endsWith(DOMAINE)));
    if (data.users.length < 1000) break;
  }
  await parLots(cibles.length, async (i) => {
    const u = cibles[i];
    const { data: files } = await db.storage.from('documents').list(u.id);
    if (files?.length) await db.storage.from('documents').remove(files.map((f) => `${u.id}/${f.name}`));
    await db.auth.admin.deleteUser(u.id);
  });
  await db.from('access_codes').delete().like('code', 'CHARGE-%');
  console.log(`Données de test supprimées (${cibles.length} comptes).`);
}

(process.argv.includes('--nettoyer') ? nettoyer() : remplir()).catch((e) => { console.error(e.message || e); process.exit(1); });
