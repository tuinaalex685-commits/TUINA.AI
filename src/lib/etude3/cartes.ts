import type { CarteMentale, ModuleCours, PlanSequence } from './types';

/** Cartes consultables d'un cours : la vue d'ensemble, puis une carte par module (dans l'ordre). */
export function vuesDuCours(generale: CarteMentale | null, modules: ModuleCours[], titreCours: string) {
  const vues: { id: string; titre: string; groupe?: string; carte: CarteMentale }[] = [];
  if (generale?.noeuds.length) vues.push({ id: 'ensemble', titre: 'Vue d’ensemble du cours', carte: generale });
  for (const m of modules) {
    if (!m.carte?.noeuds.length) continue;
    vues.push({ id: m.id, titre: m.titre, groupe: m.chemin[0] || titreCours, carte: m.carte });
  }
  return vues;
}

/** Leçons réduites à ce dont la carte a besoin pour proposer « Où l'apprendre ». */
export const leconsPourCarte = (plan: PlanSequence[]) =>
  plan.map((p) => ({ ordre: p.ordre, titre: p.titre, module: p.module, notions: p.notions }));

/** Première et dernière leçon d'un ensemble de modules (pour « leçons 4 à 9 »). */
export function bornesLecons(plan: PlanSequence[], modules: string[]) {
  const ordres = plan.filter((p) => p.module && modules.includes(p.module)).map((p) => p.ordre);
  return ordres.length ? { de: Math.min(...ordres), a: Math.max(...ordres) } : null;
}
