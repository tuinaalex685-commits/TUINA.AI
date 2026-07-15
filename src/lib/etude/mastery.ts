import { createClient } from '@/lib/supabase/server';
import { estMaitrise } from '@/lib/config/mastery';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ThemeMastery {
  id: string;
  titre: string;
  ordre: number;
  score: number;
  maitrise: boolean;
}

export interface SectionMastery {
  id: string;
  titre: string;
  ordre: number;
  themes: ThemeMastery[];
}

export interface CoursMastery {
  coursId: string;
  /** pdf_id du document source, pour lier vers le lecteur Étude (/app/etude/[pdfId]). */
  pdfId: string | null;
  nom: string;
  totalThemes: number;
  themesMaitrises: number;
  /** Maîtrise du cours (0-100) : moyenne des scores, thèmes non commencés comptés à 0. */
  pourcentage: number;
  sections: SectionMastery[];
}

export interface GlobalMastery {
  totalThemes: number;
  pourcentageGlobal: number;
  themesMaitrises: number;
  themesARenforcer: number;
}

/**
 * Détail de la maîtrise par cours étudié (cours → sections → thèmes), pour les
 * vues de progression. Lecture seule (vue dérivée `theme_mastery` + tables
 * Étude), aucune écriture. Le client doit être scopé utilisateur (la vue est en
 * security_invoker → RLS owner-only de etude_progression_themes). Requêtes
 * enchaînées par paliers pour ne dépendre d'aucun embedding PostgREST.
 */
export async function getCoursMasteryBreakdown(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CoursMastery[]> {
  // 1. Cours commencés par l'utilisateur (RLS owner-only).
  const { data: progCours } = await supabase
    .from('etude_progression_cours')
    .select('cours_id')
    .eq('user_id', userId);

  const coursIds = (progCours || []).map((c: any) => c.cours_id);
  if (coursIds.length === 0) return [];

  // 2. etude_cours -> pdf_id (lecture publique).
  const { data: coursRows } = await supabase
    .from('etude_cours')
    .select('id, pdf_id')
    .in('id', coursIds);

  const pdfByCours = new Map<string, string | null>((coursRows || []).map((c: any) => [c.id, c.pdf_id ?? null]));
  const pdfIds = (coursRows || []).map((c: any) => c.pdf_id).filter(Boolean);

  // 3. documents -> nom (RLS owner-only).
  const nomByPdf = new Map<string, string>();
  if (pdfIds.length > 0) {
    const { data: docs } = await supabase.from('documents').select('id, nom').in('id', pdfIds);
    for (const d of docs || []) nomByPdf.set((d as any).id, (d as any).nom);
  }

  // 4. Sections (lecture publique).
  const { data: sections } = await supabase
    .from('etude_sections')
    .select('id, cours_id, ordre, titre')
    .in('cours_id', coursIds);

  const sectionIds = (sections || []).map((s: any) => s.id);

  // 5. Thèmes.
  let themes: any[] = [];
  if (sectionIds.length > 0) {
    const { data } = await supabase
      .from('etude_themes')
      .select('id, section_id, ordre, titre')
      .in('section_id', sectionIds);
    themes = data || [];
  }
  const themeIds = themes.map((t: any) => t.id);

  // 6. Scores de maîtrise (vue dérivée). Absent = thème non commencé = 0.
  let mastery: any[] = [];
  if (themeIds.length > 0) {
    const { data } = await supabase
      .from('theme_mastery')
      .select('theme_id, score')
      .eq('user_id', userId)
      .in('theme_id', themeIds);
    mastery = data || [];
  }
  const scoreByTheme = new Map<string, number>(mastery.map((m: any) => [m.theme_id, m.score]));

  // Regroupement thèmes -> section.
  const themesBySection = new Map<string, ThemeMastery[]>();
  for (const t of themes) {
    const score = scoreByTheme.get(t.id) ?? 0;
    const arr = themesBySection.get(t.section_id) || [];
    arr.push({ id: t.id, titre: t.titre, ordre: t.ordre, score, maitrise: estMaitrise(score) });
    themesBySection.set(t.section_id, arr);
  }

  // Regroupement sections -> cours.
  const sectionsByCours = new Map<string, SectionMastery[]>();
  for (const s of sections || []) {
    const secThemes = (themesBySection.get((s as any).id) || []).sort((a, b) => a.ordre - b.ordre);
    const arr = sectionsByCours.get((s as any).cours_id) || [];
    arr.push({ id: (s as any).id, titre: (s as any).titre, ordre: (s as any).ordre, themes: secThemes });
    sectionsByCours.set((s as any).cours_id, arr);
  }

  const result: CoursMastery[] = [];
  for (const coursId of coursIds) {
    const secs = (sectionsByCours.get(coursId) || []).sort((a, b) => a.ordre - b.ordre);
    const allThemes = secs.flatMap((s) => s.themes);
    const totalThemes = allThemes.length;
    const themesMaitrises = allThemes.filter((t) => t.maitrise).length;
    const pourcentage = totalThemes
      ? Math.round(allThemes.reduce((sum, t) => sum + t.score, 0) / totalThemes)
      : 0;
    const pdfId = pdfByCours.get(coursId) ?? null;
    result.push({
      coursId,
      pdfId,
      nom: (pdfId && nomByPdf.get(pdfId)) || 'Cours',
      totalThemes,
      themesMaitrises,
      pourcentage,
      sections: secs,
    });
  }

  result.sort((a, b) => a.nom.localeCompare(b.nom));
  return result;
}

/** Agrégat global (fonction pure) à partir du détail par cours — source unique. */
export function rollupGlobal(cours: CoursMastery[]): GlobalMastery {
  let total = 0;
  let sumScores = 0;
  let maitrises = 0;
  for (const c of cours) {
    for (const s of c.sections) {
      for (const t of s.themes) {
        total += 1;
        sumScores += t.score;
        if (t.maitrise) maitrises += 1;
      }
    }
  }
  return {
    totalThemes: total,
    pourcentageGlobal: total ? Math.round(sumScores / total) : 0,
    themesMaitrises: maitrises,
    themesARenforcer: total - maitrises,
  };
}

/** Agrégat global de maîtrise sur tous les cours commencés (lecture seule). */
export async function getGlobalMastery(
  supabase: SupabaseServerClient,
  userId: string
): Promise<GlobalMastery> {
  return rollupGlobal(await getCoursMasteryBreakdown(supabase, userId));
}
