/**
 * Structure intellectuelle d'un cours : du texte page par page aux MODULES pédagogiques.
 *
 * Aucune IA ici (gratuit, déterministe, testable). On repère le plan réel de l'auteur
 * (parties, titres, chapitres, sections), puis on en tire des modules de taille raisonnable :
 * chaque module sera compris par un appel d'analyse, puis découpé en leçons.
 * Un cours sans titres reconnaissables est découpé par blocs de pages (repli honnête).
 */

export type NiveauTitre = 1 | 2 | 3 | 4;

export interface Titre {
  page: number;          // 1 = première page
  niveau: NiveauTitre;   // 1 partie / introduction, 2 titre, 3 chapitre, 4 section
  texte: string;
}

export interface Module {
  id: string;            // m1, m2…
  titre: string;
  chemin: string[];      // titres englobants (partie, titre) pour situer le module
  pages: number[];       // pages couvertes, dans l'ordre
  caracteres: number;
}

const MOTIFS: { re: RegExp; niveau: NiveauTitre; numero?: boolean }[] = [
  { re: /^(PREMI[EÈ]RE?|DEUXI[EÈ]ME|TROISI[EÈ]ME|QUATRI[EÈ]ME|CINQUI[EÈ]ME|SIXI[EÈ]ME|SEPTI[EÈ]ME|HUITI[EÈ]ME|NEUVI[EÈ]ME|DIXI[EÈ]ME)\s+PARTIE\b/i, niveau: 1 },
  { re: /^PARTIE\s+(\S+)/i, niveau: 1, numero: true },
  { re: /^(INTRODUCTION|CONCLUSION)\s+G[EÉ]N[EÉ]RALE\b/i, niveau: 1 },
  { re: /^TITRE\s+(\S+)/i, niveau: 2, numero: true },
  { re: /^(?:CHAPITRE|LE[CÇ]ON|TH[EÈ]ME)\s+(\S+)/i, niveau: 3, numero: true },
  { re: /^SECTION\s+(\S+)/i, niveau: 4, numero: true },
];

/**
 * Le mot qui suit « Partie », « Titre », « Chapitre »… doit être une vraie numérotation :
 * chiffres romains EN MAJUSCULES (« partie l'ait sollicitée » n'est pas un titre), nombre,
 * « premier », « préliminaire », « unique ».
 */
function estNumero(mot: string): boolean {
  const m = mot.replace(/[:.,–—-]+$/, '');
  return /^[IVXL]+$/.test(m) || /^\d{1,2}(er|re|e|ère)?$/i.test(m) || /^(premi[eè]re?|pr[eé]liminaire|unique)$/i.test(m);
}

function motif(ligne: string) {
  for (const x of MOTIFS) {
    const r = x.re.exec(ligne);
    if (r && (!x.numero || estNumero(r[1]))) return x;
  }
  return null;
}

/** Une page de sommaire : plusieurs lignes « titre ........ 12 ». Ses titres ne délimitent rien. */
function estSommaire(page: string): boolean {
  return (page.match(/\.{5,}|…{3,}/g) || []).length >= 4;
}

const propre = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

/**
 * Titres du plan, dans l'ordre du document. Un titre coupé sur deux lignes (« TITRE 1 : … DE »
 * puis « L'ACTION EN JUSTICE ») est recollé quand la ligne suivante est elle aussi en capitales.
 */
export function detecterTitres(pages: string[]): Titre[] {
  const out: Titre[] = [];
  pages.forEach((texte, i) => {
    if (!texte || estSommaire(texte)) return;
    const lignes = texte.split('\n').map((l) => l.trim());
    lignes.forEach((l, k) => {
      if (l.length < 6 || l.length > 160 || /\.{4,}/.test(l)) return;
      const m = motif(l);
      if (!m) return;
      let t = l;
      const suite = lignes[k + 1] || '';
      const enCapitales = (s: string) => s.length > 2 && s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s);
      if (enCapitales(l) && enCapitales(suite) && suite.length < 90 && !motif(suite)) t = `${l} ${suite}`;
      out.push({ page: i + 1, niveau: m.niveau, texte: propre(t).slice(0, 160) });
    });
  });
  return out;
}

/**
 * Taille d'un ensemble de pages. Les longueurs sont calculées UNE fois par tableau de pages
 * (mémoïsées) : sans cela, le plafond de modules recalculait tout le texte à chaque tour,
 * ce qui devenait quadratique sur un PDF de plusieurs milliers de pages.
 */
const longueurs = new WeakMap<string[], number[]>();
function tailles(pages: string[]): number[] {
  let t = longueurs.get(pages);
  if (!t) { t = pages.map((p) => (p || '').replace(/\s+/g, ' ').length); longueurs.set(pages, t); }
  return t;
}
const taille = (pages: string[], nums: number[]) => { const t = tailles(pages); return nums.reduce((n, p) => n + (t[p - 1] || 0), 0); };
const plage = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** Découpe une suite de pages en morceaux d'environ `cible` caractères, sans couper une page. */
function decouperPages(pages: string[], nums: number[], cible: number): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let n = 0;
  const t0 = tailles(pages);
  for (const p of nums) {
    const t = t0[p - 1] || 0;
    if (cur.length && n + t > cible) { out.push(cur); cur = []; n = 0; }
    cur.push(p);
    n += t;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface OptionsModules {
  min?: number;          // en dessous (caractères), un morceau est fusionné avec le suivant
  max?: number;          // au-dessus, un module est subdivisé (sections, sinon pages)
  maxModules?: number;   // plafond du nombre d'appels d'analyse
}

/**
 * Modules pédagogiques d'un cours.
 *  1. Frontières = parties, titres et chapitres (le plan de l'auteur) ; pages de sommaire exclues.
 *  2. Morceau trop petit (une page d'annonce de partie…) : fusionné avec le suivant.
 *  3. Morceau trop gros : subdivisé par ses sections, sinon par pages.
 *  4. Aucun titre exploitable : blocs de pages réguliers.
 */
export function construireModules(pages: string[], opts: OptionsModules = {}): Module[] {
  const min = opts.min ?? 8000;
  const max = opts.max ?? 70000;
  const maxModules = opts.maxModules ?? 40;
  const total = pages.length;
  const contenu = plage(1, total).filter((p) => (pages[p - 1] || '').trim() && !estSommaire(pages[p - 1]));
  if (contenu.length === 0) return [];

  const titres = detecterTitres(pages);
  const frontieres = titres.filter((t) => t.niveau <= 3);
  type Morceau = { titre: string; chemin: string[]; pages: number[]; sections: Titre[] };
  let morceaux: Morceau[] = [];

  if (frontieres.length >= 2) {
    // Chemin courant (partie > titre) pour situer chaque chapitre.
    const chemin: Record<number, string> = {};
    const debuts = Array.from(new Set(frontieres.map((f) => f.page))).sort((a, b) => a - b);
    debuts.forEach((pageTitre, i) => {
      // Les pages avant le premier titre (abréviations, avant-propos…) rejoignent le premier morceau.
      const debut = i === 0 ? Math.min(pageTitre, contenu[0]) : pageTitre;
      const fin = (debuts[i + 1] ?? total + 1) - 1;
      const ici = frontieres.filter((f) => f.page === pageTitre);
      for (const f of ici) {
        chemin[f.niveau] = f.texte;
        for (let n = f.niveau + 1; n <= 3; n++) delete chemin[n];
      }
      const plusFin = ici.reduce((a, b) => (b.niveau >= a.niveau ? b : a), ici[0]);
      const nums = plage(debut, fin).filter((p) => contenu.includes(p));
      if (!nums.length) return;
      const englobants = [1, 2].map((n) => chemin[n]).filter((t): t is string => !!t && t !== plusFin.texte);
      morceaux.push({
        titre: plusFin.texte || `Pages ${nums[0]} à ${nums[nums.length - 1]}`,
        chemin: englobants,
        pages: nums,
        sections: titres.filter((t) => t.niveau === 4 && t.page >= debut && t.page <= fin),
      });
    });
  } else {
    morceaux = decouperPages(pages, contenu, Math.min(max, 45000)).map((nums) => ({
      titre: `Pages ${nums[0]} à ${nums[nums.length - 1]}`, chemin: [], pages: nums, sections: [],
    }));
  }

  // 2. Fusion des morceaux trop petits avec le suivant (ou le précédent pour le dernier).
  const fusion: Morceau[] = [];
  for (let i = 0; i < morceaux.length; i++) {
    const m = morceaux[i];
    if (taille(pages, m.pages) < min && i < morceaux.length - 1) {
      const next = morceaux[i + 1];
      morceaux[i + 1] = { ...next, chemin: next.chemin.length ? next.chemin : m.chemin, pages: [...m.pages, ...next.pages], sections: [...m.sections, ...next.sections] };
      continue;
    }
    if (taille(pages, m.pages) < min && fusion.length) {
      const prev = fusion[fusion.length - 1];
      fusion[fusion.length - 1] = { ...prev, pages: [...prev.pages, ...m.pages], sections: [...prev.sections, ...m.sections] };
      continue;
    }
    fusion.push(m);
  }

  // 3. Subdivision des morceaux trop gros : par sections, puis par pages.
  const finaux: Morceau[] = [];
  for (const m of fusion) {
    if (taille(pages, m.pages) <= max) { finaux.push(m); continue; }
    const coupes = Array.from(new Set(m.sections.map((s) => s.page))).filter((p) => p > m.pages[0]).sort((a, b) => a - b);
    let parties: number[][] = [];
    if (coupes.length) {
      const bornes = [m.pages[0], ...coupes];
      parties = bornes.map((b, i) => m.pages.filter((p) => p >= b && p < (bornes[i + 1] ?? Infinity))).filter((x) => x.length);
    } else parties = [m.pages];
    const decoupe = parties.flatMap((nums) => (taille(pages, nums) > max ? decouperPages(pages, nums, Math.round(max * 0.65)) : [nums]));
    decoupe.forEach((nums, k) => {
      const sec = m.sections.find((s) => s.page === nums[0]);
      finaux.push({
        titre: decoupe.length > 1 ? (sec ? `${m.titre} — ${sec.texte}` : `${m.titre} (${k + 1}/${decoupe.length})`) : m.titre,
        chemin: m.chemin, pages: nums, sections: [],
      });
    });
  }

  // 4. Plafond : on fusionne les deux voisins les plus légers jusqu'à respecter le nombre maximal,
  //    de préférence à l'intérieur d'une même partie (on ne mélange pas deux titres du cours).
  while (finaux.length > maxModules) {
    let best = 0;
    let bestSize = Infinity;
    for (let i = 0; i < finaux.length - 1; i++) {
      const memeChemin = finaux[i].chemin.join('|') === finaux[i + 1].chemin.join('|');
      const s = (taille(pages, finaux[i].pages) + taille(pages, finaux[i + 1].pages)) * (memeChemin ? 1 : 3);
      if (s < bestSize) { bestSize = s; best = i; }
    }
    const a = finaux[best], b = finaux[best + 1];
    finaux.splice(best, 2, { titre: `${a.titre} ; ${b.titre}`.slice(0, 200), chemin: a.chemin, pages: [...a.pages, ...b.pages], sections: [] });
  }

  return finaux.map((m, i) => ({ id: `m${i + 1}`, titre: m.titre.slice(0, 200), chemin: m.chemin.slice(0, 2), pages: m.pages, caracteres: taille(pages, m.pages) }));
}

/**
 * Nombre de leçons par module : proportionnel à la matière réelle (≈ une leçon pour 6 000
 * caractères, soit 2 pages denses), au moins 1, au plus `parModule`, et `total` au maximum
 * pour tout le cours (les plus gros modules cèdent d'abord).
 */
export function repartirLecons(modules: Pick<Module, 'caracteres'>[], total = 60, parModule = 6, parLecon = 6000): number[] {
  const budget = modules.map((m) => Math.min(parModule, Math.max(1, Math.round(m.caracteres / parLecon))));
  let somme = budget.reduce((a, b) => a + b, 0);
  while (somme > total) {
    let i = 0;
    for (let k = 1; k < budget.length; k++) if (budget[k] > budget[i] || (budget[k] === budget[i] && modules[k].caracteres < modules[i].caracteres)) i = k;
    if (budget[i] <= 1) break;
    budget[i]--;
    somme--;
  }
  return budget;
}
