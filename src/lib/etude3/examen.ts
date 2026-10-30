// Serveur uniquement : pont entre l'Étude guidée v4 et l'Examen.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ENGINE_VERSION, type PlanSequence } from './types';

/**
 * L'Examen construit sa banque de questions sur le PLAN du cours (sections → thèmes). Avant la v4,
 * ce plan venait de l'ancienne Étude guidée (etude_cours / etude_sections / etude_themes). Avec la
 * v4, il vient de l'analyse commune du cours : un module = une section, une leçon = un thème.
 * Les positions (ordre de section, ordre du thème dans la section) sont stables pour une version
 * du moteur : la banque et les résultats restent cohérents pour tous les étudiants du cours.
 */
export type StructureExamen = { section_ordre: number; section_titre: string; themes: { theme_ordre: number; titre: string }[] }[];

/** Analyses v4 prêtes, par document (une requête pour toute la liste). */
export async function documentsAvecEtudeV4(documentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (documentIds.length === 0) return out;
  const { data: parcours } = await supabaseAdmin.from('etude_parcours').select('document_id, source_hash')
    .in('document_id', documentIds).eq('engine_version', ENGINE_VERSION).not('source_hash', 'is', null);
  const hashParDoc = new Map<string, string>();
  for (const p of parcours || []) if (!hashParDoc.has(p.document_id as string)) hashParDoc.set(p.document_id as string, p.source_hash as string);
  const hashes = Array.from(new Set(hashParDoc.values()));
  if (hashes.length === 0) return out;
  const { data: prets } = await supabaseAdmin.from('etude_analyses').select('source_hash')
    .in('source_hash', hashes).eq('engine_version', ENGINE_VERSION).eq('statut', 'pret');
  const ok = new Set((prets || []).map((a) => a.source_hash as string));
  for (const [doc, h] of hashParDoc) if (ok.has(h)) out.set(doc, h);
  return out;
}

/** Plan du cours pour l'Examen, à partir de l'Étude guidée v4 (null si elle n'est pas prête). */
export async function structureExamenV4(documentId: string): Promise<StructureExamen | null> {
  const hash = (await documentsAvecEtudeV4([documentId])).get(documentId);
  if (!hash) return null;
  const { data } = await supabaseAdmin.from('etude_analyses').select('plan, modules')
    .eq('source_hash', hash).eq('engine_version', ENGINE_VERSION).maybeSingle();
  const plan = (Array.isArray(data?.plan) ? data!.plan : []) as PlanSequence[];
  const modules = (Array.isArray(data?.modules) ? data!.modules : []) as { id: string; titre: string }[];
  const structure: StructureExamen = modules.map((m, i) => ({
    section_ordre: i + 1,
    section_titre: m.titre,
    themes: plan.filter((p) => p.module === m.id).map((p, k) => ({ theme_ordre: k + 1, titre: p.titre })),
  })).filter((s) => s.themes.length > 0);
  return structure.length ? structure : null;
}
