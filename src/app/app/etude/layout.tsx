import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/viewer';
import { isPremium } from '@/lib/plan';
import { ETUDE_GUIDEE_ACTIVE } from '@/lib/features';
import BientotDisponible from '@/components/BientotDisponible';

/**
 * Étude guidée suspendue pour le lancement : TOUTES les pages /app/etude (liste, cours, synthèse,
 * leçons, carte, bilan, cours du catalogue) affichent « bientôt disponible ». Les pages ne sont
 * pas rendues, donc aucune lecture ni génération ; les actions serveur, la file IA et le worker
 * refusent aussi (lib/features.ts). Réactivation : ETUDE_GUIDEE_ACTIVE = true.
 */
export default async function EtudeLayout({ children }: { children: React.ReactNode }) {
  if (ETUDE_GUIDEE_ACTIVE) return children;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <BientotDisponible section="etude" premium={await isPremium(null, user.email)} />;
}
