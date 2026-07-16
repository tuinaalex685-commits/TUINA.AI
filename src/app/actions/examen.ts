"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import * as session from '@/lib/examen/session';
import { getExamAnalyse, getExamHistory, getExamCorrection } from '@/lib/examen/analytics';

/**
 * Server actions de la section EXAMEN (EX.2). Elles ne font que :
 *   1. authentifier l'utilisateur (source du user_id) ;
 *   2. déléguer au cœur `lib/examen/session` avec le client SERVICE ROLE.
 *
 * Toute écriture de session passe donc par le serveur (jamais par le client) :
 * la note et le statut ne peuvent pas être falsifiés. Le client authentifié ne
 * sert qu'à prouver l'identité ; il ne reçoit jamais le corrigé (vue épurée).
 */
async function deps() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    poolDb: supabaseAdmin,
    sessionDb: supabaseAdmin,
    userId: user.id,
    now: () => new Date(),
  };
}

export async function startExam(documentId: string, mode?: 'standard' | 'adaptatif') {
  const d = await deps();
  if (!d) return { error: 'Non authentifié' };
  try {
    const res = await session.startExam(d, { documentId, mode });
    revalidatePath('/app/examen');
    return { success: true, ...res };
  } catch (e: any) {
    return { error: e?.message || 'Impossible de démarrer l’examen.' };
  }
}

export async function getExamView(sessionId: string) {
  const d = await deps();
  if (!d) return { error: 'Non authentifié' };
  try {
    return { success: true, view: await session.getExamView(d, sessionId) };
  } catch (e: any) {
    return { error: e?.message || 'Session introuvable.' };
  }
}

export async function saveExamAnswer(sessionId: string, position: number, answer: any) {
  const d = await deps();
  if (!d) return { error: 'Non authentifié' };
  try {
    return await session.saveAnswer(d, sessionId, position, answer);
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Erreur d’enregistrement.' };
  }
}

export async function submitExam(sessionId: string) {
  const d = await deps();
  if (!d) return { error: 'Non authentifié' };
  try {
    const res = await session.submitExam(d, sessionId);
    revalidatePath('/app/examen');
    revalidatePath('/app/progression');
    return { success: true, ...res };
  } catch (e: any) {
    return { error: e?.message || 'Impossible de soumettre l’examen.' };
  }
}

/**
 * Tableau de bord Examen : documents dont l'Étude est prête (prérequis), avec
 * état de la banque + résumé d'historique. Bank + sessions lus via service role
 * (la banque est service-role only ; RLS interdit l'accès client aux corrigés).
 */
export async function getExamDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' as const };
  const userId = user.id;

  const { data: docs } = await supabaseAdmin
    .from('documents').select('id, nom, text_hash, date_import').eq('user_id', userId)
    .order('date_import', { ascending: false });
  const docList = docs || [];
  const ids = docList.map((d: any) => d.id);
  if (ids.length === 0) return { success: true as const, items: [] };

  // Cours Étude 'pret' (prérequis d'un examen : la banque a besoin du plan de thèmes).
  const pretPdf = new Set<string>();
  const { data: cours } = await supabaseAdmin
    .from('etude_cours').select('pdf_id, statut_generation').in('pdf_id', ids);
  for (const c of cours || []) if ((c as any).statut_generation === 'pret') pretPdf.add((c as any).pdf_id);

  // Banques prêtes (clé = text_hash = source_hash de la banque).
  const hashes = docList.map((d: any) => d.text_hash).filter(Boolean);
  const bankSet = new Set<string>();
  if (hashes.length) {
    const { data: pools } = await supabaseAdmin
      .from('examen_question_pools').select('source_hash').in('source_hash', hashes);
    for (const p of pools || []) bankSet.add((p as any).source_hash);
  }

  // Historique groupé par document.
  const hist = await getExamHistory(supabaseAdmin, userId);
  const byDoc = new Map<string, any[]>();
  for (const h of hist) {
    const arr = byDoc.get(h.documentId || '') || [];
    arr.push(h); byDoc.set(h.documentId || '', arr);
  }

  const docsPret = docList.filter((d: any) => pretPdf.has(d.id));
  const items = await Promise.all(docsPret.map(async (d: any) => {
    const h = byDoc.get(d.id) || [];
    const notes = h.map((x) => x.note).filter((n) => n !== null);
    // Adaptatif dispo après un 1er examen (diagnostic) tant que le cours n'est pas entièrement maîtrisé.
    // Isolé : l'analyse d'un document ne doit JAMAIS faire échouer tout le tableau de bord.
    let canAdaptive = false;
    if (h.length > 0) {
      try {
        const a = await getExamAnalyse(supabaseAdmin, userId, d.id);
        canAdaptive = !a.resume.coursMaitrise;
      } catch { canAdaptive = false; }
    }
    return {
      documentId: d.id, nom: d.nom,
      bankReady: !!d.text_hash && bankSet.has(d.text_hash),
      nbExamens: h.length,
      derniereNote: h.length ? h[h.length - 1].note : null,
      meilleureNote: notes.length ? Math.max(...notes) : null,
      canAdaptive,
    };
  }));
  return { success: true as const, items };
}

/** Analyse complète d'un document (résultats + maîtrise par thème + retour Étude) pour l'utilisateur. */
export async function getExamResults(documentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' as const };
  try {
    const analyse = await getExamAnalyse(supabaseAdmin, user.id, documentId);
    return { success: true as const, analyse };
  } catch (e: any) {
    return { error: e?.message || 'Analyse indisponible.' };
  }
}

/** Correction détaillée d'une session (question par question). Corrigé révélé seulement après remise. */
export async function getExamCorrectionAction(sessionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' as const };
  try {
    const correction = await getExamCorrection(supabaseAdmin, user.id, sessionId);
    return { success: true as const, correction };
  } catch (e: any) {
    return { error: e?.message || 'Correction indisponible.' };
  }
}
