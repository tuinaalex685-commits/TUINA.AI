"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isNiveau, upsertProfile } from '@/lib/profile';

/** L'étudiant connecté choisit (ou change) son niveau d'études. */
export async function setMyNiveau(niveau: string) {
  if (!isNiveau(niveau)) return { error: 'Niveau inconnu.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  const res = await upsertProfile(user.id, { niveau, onboardingDone: true });
  if (!res.ok) return { error: 'Enregistrement impossible pour le moment. Réessaie dans un instant.' };

  revalidatePath('/app', 'layout');
  return { success: true };
}
