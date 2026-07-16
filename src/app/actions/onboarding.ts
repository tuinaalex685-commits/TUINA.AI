"use server";

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Marque le guide d'accueil comme vu pour l'utilisateur courant (mémorisation
 * par compte). Écrit via service role après authentification. Dégradation
 * gracieuse si la colonne n'existe pas encore (migration non appliquée).
 */
export async function markOnboardingSeen() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };
  const { error } = await supabaseAdmin
    .from('user_roles')
    .update({ onboarding_vu: true })
    .eq('user_id', user.id);
  if (error) return { error: error.message };
  return { success: true };
}
