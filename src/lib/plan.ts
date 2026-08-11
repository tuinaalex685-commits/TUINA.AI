import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * STATUT FREE / PREMIUM — source de vérité unique de toute l'application.
 *
 * Règle métier :
 *     PREMIUM = un code d'accès ACTIF existe pour cet email, OU le compte est admin
 *     FREE    = tout le reste
 *
 * Le statut est DÉRIVÉ à chaque requête, jamais stocké. C'est ce qui rend la
 * désactivation d'un code immédiate : l'administrateur passe le code à 'inactive',
 * et l'utilisateur redevient Free à sa requête suivante — il n'y a aucune colonne
 * à synchroniser, donc aucun moyen de rester Premium par accident.
 *
 * Deux corrections importantes par rapport à la version précédente :
 *
 *  1. LE RÔLE ADMIN COMPTE. Un administrateur n'a aucune raison de se générer un
 *     code d'accès à lui-même ; il était donc calculé comme Free et voyait les
 *     publicités, les cadenas et les incitations à s'abonner en testant son
 *     propre produit.
 *
 *  2. LECTURE EN SERVICE ROLE. La lecture passait par le client authentifié, donc
 *     par la policy RLS d'access_codes qui compare l'email avec un '=' STRICT,
 *     alors que la requête utilise ilike. Un code saisi "Etudiant@Gmail.com" pour
 *     un compte "etudiant@gmail.com" aurait été invisible, et l'étudiant serait
 *     resté Free après avoir payé. Ici l'email vient toujours de la session déjà
 *     authentifiée : on ne lit jamais que la ligne de l'utilisateur courant.
 */

async function hasActiveAccessCode(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('access_codes').select('status').ilike('email', email);
  if (error) {
    // Fail closed : en cas de panne, on ne distribue pas du Premium gratuitement.
    console.error('[plan] lecture access_codes impossible:', error.message);
    return false;
  }
  return !!data?.some((c: { status: string }) => c.status === 'active');
}

async function isAdminEmail(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_roles').select('role').ilike('email', email).maybeSingle();
  return data?.role === 'admin';
}

/**
 * Signature inchangée pour rester compatible avec tous les appels existants
 * (routes API, server actions, composants serveur). Le premier paramètre n'est
 * plus utilisé : la lecture ne dépend volontairement plus du client authentifié.
 */
export async function isPremium(
  _db: SupabaseClient | null | undefined,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  if (await hasActiveAccessCode(email)) return true;
  return isAdminEmail(email);
}

export interface ViewerPlan {
  /** Expérience Premium : code actif ou administrateur. */
  isPremium: boolean;
  /** Permission distincte du plan : donne accès à /admin. */
  isAdmin: boolean;
  /** Le Catalogue est une vitrine de découverte destinée aux comptes Free. */
  showCatalogue: boolean;
  /** Publicité et incitations à s'abonner : Free uniquement. */
  showAds: boolean;
  showUpgradeCta: boolean;
}

/**
 * Tout ce dont l'interface a besoin, en une seule lecture.
 *
 * Ces booléens ne servent QU'À L'AFFICHAGE. Les protections réelles (quotas,
 * import, Rédaction) revérifient le plan de leur côté : les modifier dans le
 * navigateur ne fait apparaître ou disparaître que des éléments visuels.
 */
export async function getViewerPlan(email: string | null | undefined): Promise<ViewerPlan> {
  if (!email) {
    return { isPremium: false, isAdmin: false, showCatalogue: true, showAds: true, showUpgradeCta: true };
  }
  const [code, admin] = await Promise.all([hasActiveAccessCode(email), isAdminEmail(email)]);
  const premium = code || admin;
  return {
    isPremium: premium,
    isAdmin: admin,
    showCatalogue: !premium,
    showAds: !premium,
    showUpgradeCta: !premium,
  };
}
