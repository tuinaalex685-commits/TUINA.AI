import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';

/**
 * QUOTAS FREE — source de vérité unique des limites du plan gratuit.
 *
 * Toute limite Free se décide ici et nulle part ailleurs : une valeur codée en dur
 * dans un composant ou une route est un bug (elle finit toujours par diverger de
 * celle appliquée côté serveur, et c'est celle du serveur qui fait foi).
 *
 * L'incrémentation réelle est faite par la fonction SQL consume_free_quota
 * (database/free_daily_quotas.sql), atomique : deux onglets ouverts en même temps
 * ne peuvent pas consommer deux fois le dernier crédit.
 */

export const FREE_LIMITS = {
  /** Examens démarrés par jour. Passer un examen ne coûte aucun appel Gemini
   *  (banque en cache, correction déterministe) — la limite est un levier produit. */
  examen: 10,
  /** Sessions de révision ouvertes par jour. Les flashcards sont mutualisées par
   *  source_hash : coût Gemini nul dès le deuxième utilisateur sur un même contenu. */
  revision: 5,
  /** Corrections de cas pratique par jour. SEUL poste au coût marginal réel du Free :
   *  chaque correction est une réponse personnelle de l'étudiant, donc impossible à
   *  mutualiser ou mettre en cache — un appel Gemini à chaque fois. */
  cas_pratique: 15,
} as const;

export type FreeFeature = keyof typeof FREE_LIMITS;

/** Libellés destinés à l'étudiant. Utilisés dans les messages de quota atteint. */
const FEATURE_LABEL: Record<FreeFeature, string> = {
  examen: 'examens',
  revision: 'révisions',
  cas_pratique: 'corrections de cas pratique',
};

export interface QuotaResult {
  allowed: boolean;
  used: number;
  quota: number;
  /** true quand l'utilisateur est Premium : aucun compteur n'est touché. */
  unlimited: boolean;
  /** Message prêt à afficher quand allowed === false. */
  error?: string;
}

const UNLIMITED: QuotaResult = { allowed: true, used: 0, quota: 0, unlimited: true };

function quotaMessage(feature: FreeFeature, quota: number): string {
  return `Tu as atteint tes ${quota} ${FEATURE_LABEL[feature]} gratuites aujourd'hui. `
    + `Passe au Premium pour continuer sans limite.`;
}

/**
 * Vérifie ET consomme un crédit en une seule opération atomique.
 *
 * Le crédit est pris AVANT l'opération : vérifier d'abord puis consommer après
 * laisserait passer deux requêtes simultanées. En contrepartie, si l'opération
 * échoue ensuite pour une raison technique, l'appelant DOIT appeler refundQuota().
 *
 * Un utilisateur Premium ne touche jamais les compteurs.
 */
export async function consumeQuota(
  db: SupabaseClient,
  userId: string,
  email: string | null | undefined,
  feature: FreeFeature,
): Promise<QuotaResult> {
  if (await isPremium(db, email)) return UNLIMITED;

  const quota = FREE_LIMITS[feature];
  const { data, error } = await supabaseAdmin.rpc('consume_free_quota', {
    p_user_id: userId,
    p_feature: feature,
    p_limit: quota,
  });

  // Fail-closed : si les compteurs sont indisponibles (migration pas encore passée,
  // base injoignable), on REFUSE plutôt que d'ouvrir la porte en grand. Un Free qui
  // voit un message d'erreur est un incident ; un quota silencieusement désactivé
  // est une facture Gemini imprévisible.
  if (error) {
    console.error('[quota] consume_free_quota indisponible:', error.message);
    return {
      allowed: false, used: 0, quota, unlimited: false,
      error: "Vérification du quota impossible pour le moment. Réessaie dans un instant.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const used = Number(row?.used ?? quota);
  const allowed = row?.allowed === true;

  return {
    allowed, used, quota, unlimited: false,
    error: allowed ? undefined : quotaMessage(feature, quota),
  };
}

/** Rend un crédit consommé quand l'opération qui suivait a échoué techniquement. */
export async function refundQuota(userId: string, feature: FreeFeature): Promise<void> {
  const { error } = await supabaseAdmin.rpc('refund_free_quota', {
    p_user_id: userId,
    p_feature: feature,
  });
  if (error) console.error('[quota] refund_free_quota a échoué:', error.message);
}

/**
 * Consommation du jour, sans rien consommer — pour AFFICHER les compteurs.
 * Ne sert jamais à autoriser quoi que ce soit : seul consumeQuota() fait autorité.
 */
export async function getDailyUsage(userId: string): Promise<Record<FreeFeature, number>> {
  const jour = new Date().toISOString().slice(0, 10); // UTC = heure locale au Burkina Faso
  const empty = { examen: 0, revision: 0, cas_pratique: 0 } as Record<FreeFeature, number>;

  const { data, error } = await supabaseAdmin
    .from('free_daily_usage')
    .select('feature, count')
    .eq('user_id', userId)
    .eq('jour', jour);

  if (error || !data) return empty;

  for (const row of data as { feature: string; count: number }[]) {
    if (row.feature in empty) empty[row.feature as FreeFeature] = row.count;
  }
  return empty;
}
