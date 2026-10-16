import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * PROFIL ÉTUDIANT — niveau d'études et canal de découverte.
 *
 * Le niveau est SÉPARÉ du statut d'abonnement : il ne sert qu'à choisir quels cours du
 * catalogue gratuit sont proposés. Les écritures passent uniquement par le serveur (service
 * role), après validation : la policy RLS de `profiles` n'autorise que la lecture de soi.
 */

export { NIVEAUX, SOURCES, isNiveau, isSource, niveauLabel, catalogVisibleFor } from './profileShared';
export type { NiveauCode, SourceCode } from './profileShared';
import { isNiveau, type NiveauCode, type SourceCode } from './profileShared';

/**
 * Niveau de l'étudiant (null si non renseigné). Mutualisé par rendu serveur.
 * Toute erreur (table absente, panne) → null : l'étudiant voit alors tout le catalogue,
 * comme avant l'arrivée des niveaux. On ne cache jamais un cours par accident.
 */
export const getUserNiveau = cache(async (userId: string): Promise<NiveauCode | null> => {
  const { data, error } = await supabaseAdmin
    .from('profiles').select('niveau').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return isNiveau(data?.niveau) ? data.niveau : null;
});

/**
 * Crée ou complète le profil (une seule ligne par compte : clé primaire user_id).
 * Seuls les champs fournis et valides sont écrits ; la date d'onboarding n'est posée qu'une fois.
 */
export async function upsertProfile(
  userId: string,
  fields: { niveau?: NiveauCode | null; source?: SourceCode | null; onboardingDone?: boolean },
): Promise<{ ok: boolean }> {
  const row: Record<string, string | null> = { user_id: userId, updated_at: new Date().toISOString() };
  if (fields.niveau !== undefined) row.niveau = fields.niveau;
  if (fields.source !== undefined) row.source_decouverte = fields.source;

  const { error } = await supabaseAdmin.from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.error('[profile] écriture impossible:', error.message);
    return { ok: false };
  }
  if (fields.onboardingDone) {
    await supabaseAdmin.from('profiles')
      .update({ onboarding_termine_at: new Date().toISOString() })
      .eq('user_id', userId).is('onboarding_termine_at', null)
      .then(() => {}, () => {});
  }
  return { ok: true };
}
