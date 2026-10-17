import crypto from 'crypto';
// @ts-expect-error pdf-parse n'a pas de types fournis
import pdfParse from 'pdf-parse';
import type { Couverture } from './types';

/**
 * Extraction du texte d'un PDF PAGE PAR PAGE, avec un rapport de couverture honnête.
 * Côté serveur uniquement. Aucune IA ici : un PDF scanné est détecté AVANT tout appel payant.
 */

/** Erreur définitive : réessayer ne changera rien (PDF scanné, vide…). Le worker n'insiste pas. */
export class NonRetryableError extends Error {}

const MIN_PAGE_CHARS = 40;        // en dessous, la page est considérée sans texte exploitable
const MIN_TOTAL_CHARS = 1500;     // en dessous, il n'y a pas de quoi bâtir une étude fiable
const MIN_READABLE_RATIO = 0.5;   // au moins la moitié des pages doivent avoir du texte

export interface PagesExtraites {
  pages: string[];               // index 0 = page 1
  couverture: Couverture;
  hash: string;                  // empreinte du texte NORMALISÉ (clé de mutualisation)
}

/**
 * Texte normalisé pour l'empreinte : espaces unifiés, numéros de page isolés retirés.
 * Deux exports d'un même cours (mise en page différente, page de garde en plus) ont ainsi plus
 * de chances d'avoir la même empreinte, sans jamais confondre deux textes différents.
 */
export function normalizeForHash(pages: string[]): string {
  return pages
    .map((p) => p.split('\n').filter((l) => !/^\s*(page\s*)?\d{1,4}\s*(\/\s*\d{1,4})?\s*$/i.test(l)).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractPages(buffer: Buffer): Promise<PagesExtraites> {
  const pages: string[] = [];
  const pagerender = async (pageData: any) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let lastY: number | undefined;
    let text = '';
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform?.[5];
      text += lastY === undefined || lastY === y ? item.str : `\n${item.str}`;
      lastY = y;
    }
    pages[pageData.pageIndex] = text;
    return text;
  };
  const parsed = await pdfParse(buffer, { pagerender });
  const total = Number(parsed.numpages) || pages.length;
  for (let i = 0; i < total; i++) if (typeof pages[i] !== 'string') pages[i] = '';

  const vides: number[] = [];
  let caracteres = 0;
  pages.forEach((p, i) => {
    const n = p.replace(/\s+/g, '').length;
    caracteres += n;
    if (n < MIN_PAGE_CHARS) vides.push(i + 1);
  });
  const lues = total - vides.length;

  // E-03 : pas d'étude inventée à partir de quelques fragments.
  if (caracteres < MIN_TOTAL_CHARS || (total > 0 && lues / total < MIN_READABLE_RATIO)) {
    throw new NonRetryableError(
      'PDF_SCANNE: Ce PDF semble être un document scanné : son texte n’est pas lisible par SJP. ' +
      'Importe une version où le texte est sélectionnable (export depuis Word ou un PDF passé à la reconnaissance de texte, « OCR »).'
    );
  }

  const hash = crypto.createHash('sha256').update(normalizeForHash(pages)).digest('hex');
  return {
    pages,
    couverture: { pages_total: total, pages_lues: lues, pages_vides: vides, caracteres, tronque: false },
    hash,
  };
}

/**
 * Découpe en segments d'environ `target` caractères, sans couper une page, pour l'analyse
 * section par section (mémoire de travail : chaque segment connaît ses numéros de page).
 */
export function segmenter(pages: string[], target = 14000): { pages: number[]; texte: string }[] {
  const segments: { pages: number[]; texte: string }[] = [];
  let cur: { pages: number[]; texte: string } = { pages: [], texte: '' };
  pages.forEach((p, i) => {
    const t = p.trim();
    if (!t) return;
    if (cur.texte.length > 0 && cur.texte.length + t.length > target) {
      segments.push(cur);
      cur = { pages: [], texte: '' };
    }
    cur.pages.push(i + 1);
    cur.texte += `\n[[page ${i + 1}]]\n${t}`;
  });
  if (cur.texte) segments.push(cur);
  return segments;
}

/** Extrait du cours couvrant des pages données (pour générer une séquence), borné en taille. */
export function extraitPages(pages: string[], numeros: number[], max = 30000): string {
  const set = Array.from(new Set(numeros)).filter((n) => n >= 1 && n <= pages.length).sort((a, b) => a - b);
  let out = '';
  for (const n of set) {
    const chunk = `\n[[page ${n}]]\n${(pages[n - 1] || '').trim()}`;
    if (out.length + chunk.length > max) break;
    out += chunk;
  }
  return out;
}
