import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * ACCÈS AUX PDF DU BUCKET `documents` — côté serveur uniquement.
 *
 * Deux règles :
 *  1. Le serveur ne télécharge JAMAIS une URL libre. `documents.url_fichier` est écrit par le
 *     navigateur : faire `fetch(url_fichier)` permettait de faire appeler au serveur n'importe
 *     quelle adresse (SSRF) ou d'injecter un texte arbitraire. On n'en extrait que le CHEMIN dans
 *     le bucket, et ce chemin doit commencer par le dossier du propriétaire du document.
 *  2. Les liens montrés aux étudiants sont des URL SIGNÉES à durée courte, qui fonctionnent
 *     que le bucket soit public ou privé : le passage du bucket en privé (migration SQL) ne
 *     casse donc aucun écran.
 */

const BUCKET = 'documents';
const SIGNED_URL_TTL_S = 60 * 60; // 1 h : le temps de lire ou télécharger un cours

/** Chemin dans le bucket à partir d'une URL Supabase Storage (publique, signée ou authentifiée). */
export function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?#]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]);
  if (path.includes('..') || path.startsWith('/')) return null;
  return path;
}

/** Télécharge le PDF d'un document, après avoir vérifié qu'il est rangé dans le dossier de son propriétaire. */
export async function downloadDocumentPdf(doc: { url_fichier?: string | null; user_id?: string | null }): Promise<Buffer> {
  const path = extractStoragePath(doc.url_fichier);
  if (!path || !doc.user_id || !path.startsWith(`${doc.user_id}/`)) {
    throw new Error('Source du document non autorisée.');
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Téléchargement du PDF impossible : ${error?.message || 'fichier absent'}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Remplace `url_fichier` par une URL signée (une seule requête pour toute la liste).
 * Ne signe QUE les fichiers rangés dans le dossier du propriétaire du document : une ligne dont
 * l'URL viserait le dossier d'un autre utilisateur (anciennes insertions faites par le navigateur)
 * n'obtient pas de lien.
 */
export async function withSignedUrls<T extends { url_fichier?: string | null; user_id?: string | null }>(docs: T[]): Promise<T[]> {
  const paths = docs.map((d) => {
    const p = extractStoragePath(d.url_fichier);
    return p && d.user_id && p.startsWith(`${d.user_id}/`) ? p : null;
  });
  const wanted = paths.filter((p): p is string => !!p);
  const unsigned = () => docs.map((d) => ({ ...d, url_fichier: null }));
  if (wanted.length === 0) return unsigned();

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(wanted, SIGNED_URL_TTL_S);
  if (error || !data) {
    console.error('[storage] signature des URL impossible:', error?.message);
    return unsigned();
  }
  const byPath = new Map(data.map((s) => [s.path, s.signedUrl]));
  return docs.map((d, i) => {
    const p = paths[i];
    const signed = p ? byPath.get(p) : null;
    return { ...d, url_fichier: signed ?? null };
  });
}
