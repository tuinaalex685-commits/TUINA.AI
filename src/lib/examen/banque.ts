// Banque de questions d'examen : validation question par question et plan (pur, testable).
import { EXAMEN_TYPES, EXAMEN_DIFFICULTES } from '@/lib/config/examen';

export type ExamenStructure = { section_ordre: number; section_titre: string; themes: { theme_ordre: number; titre: string }[] }[];

// VALIDATION SERVEUR question par question AVANT mise en cache : une question malformée est
// ÉCARTÉE (jamais un examen cassé) ; sous le minimum, la banque entière est refusée (erreur
// permanente → pas de cache bancal, pas de boucle de retry).
/**
 * Plan déduit des questions (examen sans Étude guidée) : un thème = (section_ordre, theme_ordre)
 * avec les titres de sa première question. Numéros et titres bornés ; un titre oublié par l'IA
 * devient « Partie n » / « Thème n » plutôt que de faire écarter la question (et la banque).
 */
export function planDesQuestions(raw: any[]): ExamenStructure {
  const sections = new Map<number, { titre: string; themes: Map<number, string> }>();
  for (const q of Array.isArray(raw) ? raw : []) {
    const s = Number(q?.section_ordre), t = Number(q?.theme_ordre);
    if (!Number.isInteger(s) || !Number.isInteger(t) || s < 1 || t < 1 || s > 20 || t > 20) continue;
    const st = (typeof q?.section_titre === 'string' ? q.section_titre.trim().slice(0, 200) : '') || `Partie ${s}`;
    const tt = (typeof q?.theme_titre === 'string' ? q.theme_titre.trim().slice(0, 200) : '') || `Thème ${t}`;
    const sec = sections.get(s) ?? { titre: st, themes: new Map<number, string>() };
    if (!sec.themes.has(t)) sec.themes.set(t, tt);
    sections.set(s, sec);
  }
  return [...sections.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => ({
    section_ordre: s, section_titre: v.titre,
    themes: [...v.themes.entries()].sort((a, b) => a[0] - b[0]).map(([t, titre]) => ({ theme_ordre: t, titre })),
  }));
}

export function validateExamenQuestions(raw: any[], structure: ExamenStructure | null): any[] {
  const plan = structure ?? planDesQuestions(raw);
  // Titres de chaque thème, stockés AVEC la question : l'analyse par thème les retrouve même sans Étude.
  const titres = new Map<string, { section_titre: string; theme_titre: string }>();
  for (const s of plan) for (const t of s.themes) titres.set(`${s.section_ordre}:${t.theme_ordre}`, { section_titre: s.section_titre, theme_titre: t.titre });
  const clean = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const out: any[] = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    if (!q || typeof q !== 'object') continue;
    if (!EXAMEN_TYPES.includes(q.type) || !EXAMEN_DIFFICULTES.includes(q.difficulte)) continue;
    const theme = titres.get(`${q.section_ordre}:${q.theme_ordre}`);
    if (!theme) continue;
    const question = clean(q.question);
    if (question.length < 10) continue;
    const base = {
      type: q.type, difficulte: q.difficulte,
      section_ordre: q.section_ordre, theme_ordre: q.theme_ordre, ...theme,
      question, explication: clean(q.explication)
    };
    if (q.type === 'qcm') {
      const options = Array.isArray(q.options) ? q.options.map(clean).filter(Boolean) : [];
      const correct = Number(q.correct);
      if (options.length !== 4 || new Set(options).size !== 4) continue;
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) continue;
      out.push({ ...base, options, correct });
    } else if (q.type === 'vrai_faux') {
      const correct = Number(q.correct);
      if (correct !== 0 && correct !== 1) continue;
      out.push({ ...base, correct });
    } else if (q.type === 'trous') {
      const reponses = Array.isArray(q.reponses_trous) ? q.reponses_trous.map(clean).filter(Boolean) : [];
      const blancs = (question.match(/_{3,}/g) || []).length;
      if (reponses.length === 0 || blancs !== reponses.length) continue;
      out.push({ ...base, reponses_trous: reponses });
    } else if (q.type === 'association') {
      const paires = (Array.isArray(q.paires) ? q.paires : [])
        .map((p: any) => ({ gauche: clean(p?.gauche), droite: clean(p?.droite) }))
        .filter((p: any) => p.gauche && p.droite);
      if (paires.length < 3 || paires.length > 6) continue;
      if (new Set(paires.map((p: any) => p.gauche)).size !== paires.length) continue;
      out.push({ ...base, paires });
    } else if (q.type === 'classement') {
      const elements = Array.isArray(q.elements_ordonnes) ? q.elements_ordonnes.map(clean).filter(Boolean) : [];
      if (elements.length < 3 || elements.length > 6 || new Set(elements).size !== elements.length) continue;
      out.push({ ...base, elements_ordonnes: elements });
    }
  }
  return out;
}

