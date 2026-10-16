import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Utilisateur de la requête en cours, lu UNE fois par rendu serveur.
 *
 * `auth.getUser()` est un aller-retour réseau vers Supabase Auth. Le layout, le menu, les
 * encarts publicitaires, le panneau de quotas et la page l'appelaient chacun de leur côté :
 * plusieurs allers-retours identiques, en série, avant d'afficher quoi que ce soit (C-15).
 * `cache` de React mutualise l'appel pour toute la durée d'un même rendu serveur.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
