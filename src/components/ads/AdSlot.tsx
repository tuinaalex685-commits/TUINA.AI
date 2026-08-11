import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import { getAdUnit, type AdPlacement } from '@/lib/ads/config';
import AdsterraUnit from './AdsterraUnit';

/**
 * EMPLACEMENT PUBLICITAIRE — seul point d'entrée de la publicité dans SJP.
 *
 * Server Component volontairement : la décision "cet utilisateur voit-il de la
 * publicité ?" est prise sur le serveur, à partir des codes d'accès (isPremium),
 * jamais à partir d'un état détenu par le navigateur. Un membre Premium ne reçoit donc
 * même pas le HTML de l'emplacement — il n'y a rien à masquer en CSS, rien à
 * réactiver en modifiant le JavaScript, et aucun script de régie n'est chargé.
 *
 * Poser une publicité dans une page se résume à <AdSlot placement="..." />.
 * Aucun code de régie ne doit apparaître ailleurs que dans src/components/ads/.
 */
export default async function AdSlot({ placement }: { placement: AdPlacement }) {
  // Régie non configurée (cas actuel : pas encore de compte Adsterra) → rien du tout.
  const unit = getAdUnit(placement);
  if (!unit) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (await isPremium(supabase, user.email)) return null;

  return <AdsterraUnit unit={unit} />;
}
