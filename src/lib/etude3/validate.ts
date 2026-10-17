import type { Activite, Bloc, CarteMentale, Origine, PlanSequence, Sequence, Synthese } from './types';

/**
 * Validation et normalisation de TOUT ce que renvoie l'IA, avant enregistrement.
 * Rien d'incomplet n'arrive à l'écran : bloc vide retiré, QCM dont la bonne réponse n'existe
 * pas rejeté, longueurs bornées. Une sortie inexploitable lève une erreur (le job réessaie).
 */

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, maxItems = 30, max = 600) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, maxItems);
const ints = (v: unknown, maxPage: number) =>
  Array.from(new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= maxPage))).slice(0, 40);
const origine = (v: unknown): Origine | undefined => (v === 'cours' || v === 'explication' || v === 'complement' ? v : undefined);

export function normalizeBloc(raw: any, maxPage: number): Bloc | null {
  if (!raw || typeof raw !== 'object') return null;
  const legende = str(raw.legende, 400) || undefined;
  switch (raw.type) {
    case 'titre': return str(raw.texte || raw.titre, 200) ? { type: 'titre', texte: str(raw.texte || raw.titre, 200) } : null;
    case 'paragraphe': return str(raw.texte) ? { type: 'paragraphe', texte: str(raw.texte), origine: origine(raw.origine), pages: ints(raw.pages, maxPage) } : null;
    case 'definition':
      return str(raw.terme, 200) && str(raw.definition)
        ? { type: 'definition', terme: str(raw.terme, 200), definition: str(raw.definition), reformulation: str(raw.reformulation) || undefined, origine: origine(raw.origine), pages: ints(raw.pages, maxPage) }
        : null;
    case 'exemple': return str(raw.texte) ? { type: 'exemple', titre: str(raw.titre, 200) || undefined, texte: str(raw.texte) } : null;
    case 'piege': return str(raw.texte) ? { type: 'piege', texte: str(raw.texte) } : null;
    case 'attention': return str(raw.texte) ? { type: 'attention', texte: str(raw.texte) } : null;
    case 'incertitude': return str(raw.texte) ? { type: 'incertitude', texte: str(raw.texte) } : null;
    case 'liste': { const items = strs(raw.items); return items.length ? { type: 'liste', titre: str(raw.titre, 200) || undefined, items } : null; }
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
  (Array.isArray(v) ? v : []).map((b) => normalizeBloc(b, maxPage)).filter((b): b is Bloc => !!b).slice(0, 80);

export function normalizeSynthese(raw: any, maxPage: number): Synthese {
  const sections = (Array.isArray(raw?.sections) ? raw.sections : [])
    .map((s: any, i: number) => ({ id: `s${i + 1}`, titre: str(s?.titre, 200), idee_centrale: str(s?.idee_centrale, 800) || undefined, blocs: blocs(s?.blocs, maxPage) }))
    .filter((s: { titre: string; blocs: Bloc[] }) => s.titre && s.blocs.length > 0)
    .slice(0, 20);
  if (sections.length === 0) throw new Error('Synthèse invalide : aucune section exploitable.');
  return {
    titre: str(raw?.titre, 200) || 'Synthèse du cours',
    presentation: str(raw?.presentation, 2000),
    plan: strs(raw?.plan, 20, 200),
    sections,
    fiche_memo: strs(raw?.fiche_memo, 30, 400),
    a_approfondir: strs(raw?.a_approfondir, 12, 400),
  };
}

export function normalizePlan(raw: any, maxPage: number): PlanSequence[] {
  const plan = (Array.isArray(raw) ? raw : [])
    .map((s: any) => ({ titre: str(s?.titre, 200), objectif: str(s?.objectif, 600), notions: strs(s?.notions, 12, 200), pages: ints(s?.pages, maxPage) }))
    .filter((s: { titre: string; objectif: string }) => s.titre && s.objectif)
    .slice(0, 12)
    .map((s: Omit<PlanSequence, 'ordre'>, i: number) => ({ ...s, ordre: i + 1 }));
  if (plan.length === 0) throw new Error('Plan du parcours invalide : aucune séquence.');
  return plan;
}

export function normalizeCarteMentale(raw: any): CarteMentale {
  const types = new Set(['notion', 'regle', 'condition', 'exception', 'consequence']);
  const noeuds = (Array.isArray(raw?.noeuds) ? raw.noeuds : [])
    .map((n: any) => ({ id: str(n?.id, 40), label: str(n?.label, 160), type: types.has(n?.type) ? n.type : 'notion', parent: str(n?.parent, 40) || null }))
    .filter((n: { id: string; label: string }) => n.id && n.label)
    .slice(0, 60);
  const ids = new Set(noeuds.map((n: { id: string }) => n.id));
  for (const n of noeuds) if (n.parent && (!ids.has(n.parent) || n.parent === n.id)) n.parent = null;
  return { centre: str(raw?.centre, 160) || 'Le cours', noeuds };
}

export function normalizeSequence(raw: any, ordre: number, maxPage: number): Sequence {
  const seen = new Set<string>();
  const activites: Activite[] = [];
  for (const a of Array.isArray(raw?.activites) ? raw.activites : []) {
    let id = str(a?.id, 20).replace(/[^a-z0-9_-]/gi, '') || `a${activites.length + 1}`;
    if (seen.has(id)) id = `a${activites.length + 1}`;
    const base = { id, notion: str(a?.notion, 200) || 'Notion', consigne: str(a?.consigne, 1200), autre_explication: str(a?.autre_explication, 2000) };
    if (!base.consigne) continue;
    if (a?.type === 'choix') {
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
  const contenu = blocs(raw?.blocs, maxPage);
  if (contenu.length === 0) throw new Error('Séquence invalide : aucune explication exploitable.');
  if (activites.length === 0) throw new Error('Séquence invalide : aucune activité exploitable.');
  return { ordre, titre: str(raw?.titre, 200) || `Séquence ${ordre}`, objectif: str(raw?.objectif, 600), blocs: contenu, liens: strs(raw?.liens, 6, 400), activites };
}
