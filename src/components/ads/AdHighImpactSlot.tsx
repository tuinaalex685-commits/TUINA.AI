import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import { getHighImpactScript } from '@/lib/ads/config';
import AdHighImpact from './AdHighImpact';

/**
 * Décide, CÔTÉ SERVEUR, si le format publicitaire haute visibilité doit exister.
 *
 * Monté une seule fois dans le layout de l'espace étudiant : le script est chargé
 * pour toute la session de navigation d'un compte Free, et n'atteint jamais un
 * membre Premium — pas de rendu, pas de script, rien à masquer en CSS.
 */
export default async function AdHighImpactSlot() {
  const scriptUrl = getHighImpactScript();
  if (!scriptUrl) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (await isPremium(supabase, user.email)) return null;

  return <AdHighImpact scriptUrl={scriptUrl} />;
}
