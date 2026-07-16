"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import * as session from '@/lib/examen/session';

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

export async function startExam(documentId: string) {
  const d = await deps();
  if (!d) return { error: 'Non authentifié' };
  try {
    const res = await session.startExam(d, { documentId });
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
