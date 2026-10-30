import { ACTIVITE_PREFIXE, ETAPES, type Activite, type Acteur, type Bloc, type BrancheSynthese, type CarteMentale, type CleEtape, type EtapeLecon, type NiveauActivite, type Origine, type PlanSequence, type Sequence, type Synthese } from './types';

/**
 * Validation et normalisation de TOUT ce que renvoie l'IA, avant enregistrement.
 * Rien d'incomplet n'arrive à l'écran : bloc vide retiré, QCM dont la bonne réponse n'existe
 * pas rejeté, dessin dont les acteurs ne correspondent pas rejeté, longueurs bornées.
 * Une sortie inexploitable lève une erreur (le job réessaie).
 */

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, maxItems = 30, max = 600) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, maxItems);
const ints = (v: unknown, maxPage: number) =>
  Array.from(new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= maxPage))).slice(0, 40);
const origine = (v: unknown): Origine | undefined => (v === 'cours' || v === 'explication' || v === 'complement' ? v : undefined);
const GENRES = new Set<Acteur['genre']>(['personne', 'juge', 'avocat', 'institution', 'groupe']);

export function normalizeBloc(raw: any, maxPage: number): Bloc | null {
  if (!raw || typeof raw !== 'object') return null;
  const legende = str(raw.legende, 500) || undefined;
  switch (raw.type) {
    case 'titre': return str(raw.texte || raw.titre, 200) ? { type: 'titre', texte: str(raw.texte || raw.titre, 200) } : null;
    case 'paragraphe': return str(raw.texte) ? { type: 'paragraphe', texte: str(raw.texte), origine: origine(raw.origine), pages: ints(raw.pages, maxPage) } : null;
    case 'definition':
      return str(raw.terme, 200) && str(raw.definition)
        ? { type: 'definition', terme: str(raw.terme, 200), definition: str(raw.definition), reformulation: str(raw.reformulation) || undefined, origine: origine(raw.origine), pages: ints(raw.pages, maxPage) }
        : null;
    case 'termes': {
      const items = (Array.isArray(raw.termes) ? raw.termes : [])
        .map((t: any) => ({ terme: str(t?.terme, 120), sens: str(t?.sens, 600) }))
        .filter((t: { terme: string; sens: string }) => t.terme && t.sens).slice(0, 10);
      return items.length ? { type: 'termes', items } : null;
    }
    case 'exemple': return str(raw.texte) ? { type: 'exemple', titre: str(raw.titre, 200) || undefined, texte: str(raw.texte) } : null;
    case 'piege': return str(raw.texte) ? { type: 'piege', texte: str(raw.texte) } : null;
    case 'attention': return str(raw.texte) ? { type: 'attention', texte: str(raw.texte) } : null;
    case 'incertitude': return str(raw.texte) ? { type: 'incertitude', texte: str(raw.texte) } : null;
    case 'liste': {
      let items = strs(raw.items);
      if (!items.length && Array.isArray(raw.termes)) items = raw.termes.map((t: any) => [str(t?.terme, 120), str(t?.sens, 500)].filter(Boolean).join(' : ')).filter(Boolean).slice(0, 30);
      if (!items.length && Array.isArray(raw.etapes)) items = raw.etapes.map((e: any) => [str(e?.nom, 150), str(e?.detail, 500)].filter(Boolean).join(' : ')).filter(Boolean).slice(0, 30);
      return items.length ? { type: 'liste', titre: str(raw.titre, 200) || undefined, items } : null;
    }
    case 'scene': {
      // Un dessin n'est gardé que s'il est cohérent : 2 à 4 acteurs distincts, des actions qui relient
      // des acteurs existants, et une légende (ce qu'il montre et ce qu'il faut en comprendre).
      const vus = new Set<string>();
      const acteurs: Acteur[] = (Array.isArray(raw.acteurs) ? raw.acteurs : [])
        .map((a: any) => ({
          id: str(a?.id, 20), nom: str(a?.nom, 40), role: str(a?.role, 60),
          genre: GENRES.has(a?.genre) ? a.genre : 'personne', dit: str(a?.dit, 120) || undefined,
        }))
        .filter((a: Acteur) => a.id && a.nom && !vus.has(a.id) && vus.add(a.id))
        .slice(0, 4);
      const ids = new Set(acteurs.map((a) => a.id));
      const relations = (Array.isArray(raw.relations) ? raw.relations : [])
        .map((r: any) => ({ de: str(r?.de, 20), vers: str(r?.vers, 20), action: str(r?.action, 80) }))
        .filter((r: { de: string; vers: string; action: string }) => ids.has(r.de) && ids.has(r.vers) && r.de !== r.vers && r.action)
        .slice(0, 5);
      return acteurs.length >= 2 && relations.length >= 1 && legende
        ? { type: 'scene', titre: str(raw.titre, 200) || 'La situation', acteurs, relations, legende }
        : null;
    }
    case 'comparaison': {
      const cotes = (Array.isArray(raw.cotes) ? raw.cotes : [])
        .map((c: any) => ({ titre: str(c?.titre, 120), situation: str(c?.situation, 600), consequence: str(c?.consequence, 400) }))
        .filter((c: { titre: string; situation: string }) => c.titre && c.situation).slice(0, 3);
      return cotes.length >= 2 && legende && str(raw.critere, 300)
        ? { type: 'comparaison', titre: str(raw.titre, 200) || 'Comparer', cotes, critere: str(raw.critere, 300), legende }
        : null;
    }
    case 'tableau': {
      const colonnes = strs(raw.colonnes, 6, 120);
      const lignes = (Array.isArray(raw.lignes) ? raw.lignes : [])
        .map((l: unknown) => strs(l, colonnes.length || 6, 500))
        .filter((l: string[]) => l.length > 0)
        .map((l: string[]) => colonnes.length ? [...l, ...Array(Math.max(0, colonnes.length - l.length)).fill('')].slice(0, colonnes.length) : l)
        .slice(0, 20);
      return colonnes.length >= 2 && lignes.length ? { type: 'tableau', titre: str(raw.titre, 200) || 'Comparaison', colonnes, lignes, legende } : null;
    }
    case 'arbre': {
      const branches = (Array.isArray(raw.branches) ? raw.branches : [])
        .map((b: any) => ({ condition: str(b?.condition, 300), resultat: str(b?.resultat, 400) }))
        .filter((b: { condition: string; resultat: string }) => b.condition && b.resultat).slice(0, 8);
      return str(raw.question, 300) && branches.length >= 2 ? { type: 'arbre', titre: str(raw.titre, 200) || 'Arbre de décision', question: str(raw.question, 300), branches, legende } : null;
    }
    case 'processus': {
      const etapes = (Array.isArray(raw.etapes) ? raw.etapes : [])
        .map((e: any) => ({ nom: str(e?.nom, 150), detail: str(e?.detail, 500) }))
        .filter((e: { nom: string }) => e.nom).slice(0, 10);
      return etapes.length >= 2 ? { type: 'processus', titre: str(raw.titre, 200) || 'Étapes', etapes, legende } : null;
    }
    case 'frise': {
      const jalons = (Array.isArray(raw.jalons) ? raw.jalons : [])
        .map((j: any) => ({ date: str(j?.date, 60), evenement: str(j?.evenement, 400) }))
        .filter((j: { date: string; evenement: string }) => j.date && j.evenement).slice(0, 14);
      return jalons.length >= 2 ? { type: 'frise', titre: str(raw.titre, 200) || 'Chronologie', jalons, legende } : null;
    }
    default: return null;
  }
}

const blocs = (v: unknown, maxPage: number) =>
  (Array.isArray(v) ? v : []).map((b) => normalizeBloc(b, maxPage)).filter((b): b is Bloc => !!b).slice(0, 40);

export function normalizeCarteMentale(raw: any, modulesValides?: Set<string>): CarteMentale {
  const types = new Set(['notion', 'regle', 'condition', 'exception', 'consequence']);
  const noeuds = (Array.isArray(raw?.noeuds) ? raw.noeuds : [])
    .map((n: any) => ({
      id: str(n?.id, 40), label: str(n?.label, 160), type: types.has(n?.type) ? n.type : 'notion', parent: str(n?.parent, 40) || null,
      lien: str(n?.lien, 60) || undefined, explication: str(n?.explication, 500) || undefined,
      module: modulesValides && modulesValides.has(str(n?.module, 10)) ? str(n?.module, 10) : undefined,
    }))
    .filter((n: { id: string; label: string }) => n.id && n.label)
    .filter((n: { id: string }, i: number, all: { id: string }[]) => all.findIndex((x) => x.id === n.id) === i) // ids uniques
    .slice(0, 60);
  const ids = new Set(noeuds.map((n: { id: string }) => n.id));
  for (const n of noeuds) if (n.parent && (!ids.has(n.parent) || n.parent === n.id)) n.parent = null;
  // Cycles (a → b → a) : rattachés au centre, pour qu'un arbre reste un arbre.
  const parentDe = new Map(noeuds.map((n: { id: string; parent: string | null }) => [n.id, n.parent]));
  for (const n of noeuds) {
    const vus = new Set<string>([n.id]);
    let p = n.parent;
    while (p) { if (vus.has(p)) { n.parent = null; break; } vus.add(p); p = parentDe.get(p) ?? null; }
  }
  return { centre: str(raw?.centre, 160) || 'Le cours', noeuds };
}

// ---------------------------------------------------------------------------
// Module (analyse) : leçons du module, carte, notions comprises
// ---------------------------------------------------------------------------
export interface NotionAnalysee {
  nom: string; niveau: string; definition_cours: string; sens: string; probleme: string; fonctionnement: string;
  liees: string[]; prerequis: string[]; confusions: string[]; exemples: string[]; pages: number[];
}

export interface AnalyseModule {
  titre: string;
  idee_centrale: string;
  notions: NotionAnalysee[];
  distinctions: { a: string; b: string; critere: string }[];
  pieges: string[];
  ambiguites: string[];
  lecons: Omit<PlanSequence, 'ordre'>[];
  carte: CarteMentale;
}

/**
 * Normalise l'analyse d'un module. Les pages d'une leçon sont ramenées à celles du module ; une
 * leçon sans page reçoit tout le module (jamais de leçon sans source). Au plus `budget` leçons.
 */
export function normalizeModule(raw: any, mod: { id: string; titre: string; pages: number[] }, budget: number): AnalyseModule {
  const dansModule = new Set(mod.pages);
  const maxPage = Math.max(...mod.pages);
  const pagesModule = (v: unknown) => ints(v, maxPage).filter((p) => dansModule.has(p));
  const notions: NotionAnalysee[] = (Array.isArray(raw?.notions) ? raw.notions : [])
    .map((n: any) => ({
      nom: str(n?.nom, 160), niveau: str(n?.niveau, 20) || 'importante', definition_cours: str(n?.definition_cours, 1500),
      sens: str(n?.sens, 1000), probleme: str(n?.probleme, 800), fonctionnement: str(n?.fonctionnement, 1200),
      liees: strs(n?.liees, 8, 160), prerequis: strs(n?.prerequis, 6, 160), confusions: strs(n?.confusions, 6, 300),
      exemples: strs(n?.exemples, 4, 400), pages: pagesModule(n?.pages),
    }))
    .filter((n: NotionAnalysee) => n.nom && n.sens)
    .slice(0, 40);
  const lecons = (Array.isArray(raw?.lecons) ? raw.lecons : [])
    .map((l: any) => {
      const pages = pagesModule(l?.pages);
      return {
        titre: str(l?.titre, 200), objectif: str(l?.objectif, 600), accroche: str(l?.accroche, 600) || undefined,
        notions: strs(l?.notions, 10, 200), pages: pages.length ? pages : mod.pages, module: mod.id,
      };
    })
    .filter((l: { titre: string; objectif: string }) => l.titre && l.objectif)
    .slice(0, Math.max(1, budget));
  if (lecons.length === 0) throw new Error(`Module ${mod.id} : aucune leçon exploitable.`);
  return {
    titre: str(raw?.titre, 200) || mod.titre,
    idee_centrale: str(raw?.idee_centrale, 800),
    notions,
    distinctions: (Array.isArray(raw?.distinctions) ? raw.distinctions : [])
      .map((d: any) => ({ a: str(d?.a, 160), b: str(d?.b, 160), critere: str(d?.critere, 500) }))
      .filter((d: { a: string; b: string; critere: string }) => d.a && d.b && d.critere).slice(0, 12),
    pieges: strs(raw?.pieges, 10, 500),
    ambiguites: strs(raw?.ambiguites, 8, 500),
    lecons,
    carte: normalizeCarteMentale(raw?.carte),
  };
}

/** Plan global du parcours : les leçons de tous les modules, numérotées dans l'ordre (60 au plus). */
export function planDepuisModules(modules: AnalyseModule[], max = 60): PlanSequence[] {
  const plan = modules.flatMap((m) => m.lecons).slice(0, max).map((l, i) => ({ ...l, ordre: i + 1 }));
  if (plan.length === 0) throw new Error('Plan du parcours invalide : aucune leçon.');
  return plan;
}

// ---------------------------------------------------------------------------
// Synthèse v4 (introduction pédagogique)
// ---------------------------------------------------------------------------
export function normalizeSynthese(raw: any, moduleIds: string[]): Synthese {
  const valides = new Set(moduleIds);
  const dejaPris = new Set<string>();
  const branches: BrancheSynthese[] = (Array.isArray(raw?.branches) ? raw.branches : [])
    .map((b: any, i: number) => ({
      id: `b${i + 1}`, titre: str(b?.titre, 200), idee: str(b?.idee, 800), simple: str(b?.simple, 1500), liens: str(b?.liens, 1000),
      exemple: str(b?.exemple, 1000) || undefined, avant_de_commencer: str(b?.avant_de_commencer, 800),
      modules: strs(b?.modules, 60, 10).filter((m) => valides.has(m) && !dejaPris.has(m) && dejaPris.add(m)),
    }))
    .filter((b: BrancheSynthese) => b.titre && b.idee && b.simple)
    .slice(0, 8);
  if (branches.length === 0) throw new Error('Synthèse invalide : aucune branche exploitable.');
  // Modules oubliés par le modèle : rattachés à la branche qui précède (l'ordre du cours est conservé).
  for (const m of moduleIds) {
    if (dejaPris.has(m)) continue;
    const idx = Math.max(0, moduleIds.indexOf(m));
    const cible = [...branches].reverse().find((b) => b.modules.some((x) => moduleIds.indexOf(x) < idx)) ?? branches[0];
    cible.modules.push(m);
    cible.modules.sort((a, b) => moduleIds.indexOf(a) - moduleIds.indexOf(b));
  }
  const carte = normalizeCarteMentale(raw?.carte, valides);
  return {
    titre: str(raw?.titre, 200) || 'Ton cours',
    presentation: str(raw?.presentation, 2500),
    pourquoi: str(raw?.pourquoi, 1500),
    questions: (Array.isArray(raw?.questions) ? raw.questions : [])
      .map((q: any) => ({ question: str(q?.question, 300), reponse: str(q?.reponse, 600), ou: str(q?.ou, 200) }))
      .filter((q: { question: string; reponse: string }) => q.question && q.reponse).slice(0, 10),
    branches,
    carte: carte.noeuds.length ? carte : null,
    pieges: strs(raw?.pieges, 8, 500),
    a_retenir: strs(raw?.a_retenir, 12, 400),
    a_approfondir: strs(raw?.a_approfondir, 8, 400),
  };
}

// ---------------------------------------------------------------------------
// Leçon v4
// ---------------------------------------------------------------------------
const NIVEAUX: NiveauActivite[] = ['comprendre', 'distinguer', 'appliquer', 'examen'];
const ORDRE_ETAPES = ETAPES.map((e) => e.cle);

export function normalizeSequence(raw: any, ordre: number, maxPage: number): Sequence {
  const seen = new Set<string>();
  const activites: Activite[] = [];
  for (const a of Array.isArray(raw?.activites) ? raw.activites : []) {
    // Identifiant préfixé par la version : une réponse de l'ancien parcours ne compte jamais ici.
    let id = `${ACTIVITE_PREFIXE}${str(a?.id, 12).replace(/[^a-z0-9_-]/gi, '') || `a${activites.length + 1}`}`;
    for (let k = activites.length + 1; seen.has(id); k++) id = `${ACTIVITE_PREFIXE}x${k}`;
    const base = {
      id, notion: str(a?.notion, 200) || 'Notion', consigne: str(a?.consigne, 1200), autre_explication: str(a?.autre_explication, 2000),
      niveau: NIVEAUX.includes(a?.niveau) ? a.niveau as NiveauActivite : undefined,
      explication_simple: str(a?.explication_simple, 2000) || undefined, prerequis: str(a?.prerequis, 400) || undefined,
    };
    if (!base.consigne) continue;
    if (a?.type === 'choix') {
      // Format v4.1 : chaque proposition dit elle-même si elle est juste (pas d'index à deviner).
      if (Array.isArray(a?.propositions)) {
        const props = a.propositions.map((p: any) => ({ texte: str(p?.texte, 400), juste: p?.juste === true, pourquoi: str(p?.pourquoi, 800) }))
          .filter((p: { texte: string }) => p.texte).slice(0, 5);
        const justes = props.filter((p: { juste: boolean }) => p.juste).length;
        if (props.length < 2 || justes !== 1) continue; // il faut exactement une bonne proposition
        activites.push({ ...base, type: 'choix', choix: props.map((p: { texte: string }) => p.texte), bonne: props.findIndex((p: { juste: boolean }) => p.juste), explication: str(a?.explication, 1500), pourquoi_faux: props.map((p: { pourquoi: string }) => p.pourquoi) });
        seen.add(id);
        if (activites.length >= 5) break;
        continue;
      }
      const choix = strs(a?.choix, 5, 400);
      const bonne = Number(a?.bonne);
      if (choix.length < 2 || !Number.isInteger(bonne) || bonne < 0 || bonne >= choix.length) continue; // bonne réponse absente : rejet
      const pf = strs(a?.pourquoi_faux, choix.length, 800);
      activites.push({ ...base, type: 'choix', choix, bonne, explication: str(a?.explication, 1500), pourquoi_faux: choix.map((_, i) => pf[i] || '') });
    } else if (a?.type === 'ouverte') {
      const attendus = strs(a?.attendus, 6, 400);
      if (attendus.length === 0) continue;
      activites.push({ ...base, type: 'ouverte', attendus, erreurs_typiques: strs(a?.erreurs_typiques, 6, 400), reponse_modele: str(a?.reponse_modele, 1500) });
    } else continue;
    seen.add(id);
    if (activites.length >= 5) break;
  }
  if (activites.length === 0) throw new Error('Leçon invalide : aucune vérification exploitable.');
  // Difficulté croissante, quel que soit l'ordre renvoyé par le modèle.
  activites.sort((x, y) => (x.niveau ? NIVEAUX.indexOf(x.niveau) : 1) - (y.niveau ? NIVEAUX.indexOf(y.niveau) : 1));

  // Étapes : clés connues, dans l'ordre pédagogique, une seule fois chacune, jamais vides.
  const parCle = new Map<CleEtape, Bloc[]>();
  for (const e of Array.isArray(raw?.etapes) ? raw.etapes : []) {
    const cle = e?.cle as CleEtape;
    if (!ORDRE_ETAPES.includes(cle)) continue;
    parCle.set(cle, [...(parCle.get(cle) || []), ...blocs(e?.blocs, maxPage)]);
  }
  const etapes: EtapeLecon[] = ORDRE_ETAPES.filter((c) => (parCle.get(c) || []).length > 0).map((cle) => ({ cle, blocs: parCle.get(cle)! }));
  // Un dessin par leçon au plus : le premier est gardé, les suivants retirés (pertinence > quantité).
  let dessin = false;
  for (const e of etapes) e.blocs = e.blocs.filter((b) => (b.type === 'scene' || b.type === 'comparaison') ? (dessin ? false : (dessin = true)) : true);

  if (!etapes.some((e) => e.cle === 'comprendre')) throw new Error('Leçon invalide : pas d’explication de fond.');
  if (!etapes.some((e) => e.cle === 'formuler')) throw new Error('Leçon invalide : pas de formulation juridique.');
  const situation = str(raw?.accroche?.situation, 1200);
  const question = str(raw?.accroche?.question, 400);
  return {
    ordre,
    titre: str(raw?.titre, 200) || `Leçon ${ordre}`,
    objectif: str(raw?.objectif, 600),
    blocs: [],
    liens: strs(raw?.liens, 4, 400),
    activites,
    accroche: situation ? { situation, question } : undefined,
    etapes,
    savoir_expliquer: str(raw?.savoir_expliquer, 1500) || undefined,
    suite: str(raw?.suite, 600) || undefined,
  };
}
