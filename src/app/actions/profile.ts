"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserNiveau, isNiveau, upsertProfile } from '@/lib/profile';
import { isPremium } from '@/lib/plan';

/** L'étudiant connecté choisit (ou change) son niveau d'études. */
export async function setMyNiveau(niveau: string) {
  if (!isNiveau(niveau)) return { error: 'Niveau inconnu.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Version gratuite : l'année choisie à l'inscription fixe le catalogue accessible (L1 → cours de
  // L1 seulement). Elle ne se change pas librement, sinon le catalogue entier serait ouvert à tous.
  const actuel = await getUserNiveau(user.id);
  if (actuel && actuel !== niveau && !(await isPremium(supabase, user.email))) {
    return { error: 'En version gratuite, ton catalogue correspond à l’année choisie à ton inscription. Contacte l’administrateur si tu as changé d’année.' };
  }

  const res = await upsertProfile(user.id, { niveau, onboardingDone: true });
  if (!res.ok) return { error: 'Enregistrement impossible pour le moment. Réessaie dans un instant.' };

  revalidatePath('/app', 'layout');
  return { success: true };
}
