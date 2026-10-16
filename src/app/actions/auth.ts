"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { exactEmailPattern, normalizeEmail } from '@/lib/email';
import { revalidatePath } from 'next/cache';
import { premiumExpiryFromNow, isCodeCurrentlyActive, isMissingColumn } from '@/lib/plan';

/**
 * AUTHENTIFICATION — email + mot de passe, et activation d'un code Premium UNE FOIS CONNECTÉ.
 *
 * Ancien fonctionnement (supprimé) : le code d'accès servait de mot de passe. Un code « vierge »
 * était rattaché au premier email saisi avec lui, puis le serveur REMPLAÇAIT le mot de passe du
 * compte portant cet email par le code (updateUserById). Détenir un seul code non utilisé
 * suffisait donc à prendre le contrôle de n'importe quel compte sans code — administrateur
 * compris (faille C-01 du master plan). Désormais :
 *   - aucun chemin ne modifie le mot de passe d'un autre compte que celui de la session ;
 *   - un code est rattaché à l'email du compte CONNECTÉ, jamais à un email saisi.
 *
 * Les étudiants déjà inscrits ont pour mot de passe leur ancien code : ils se connectent donc
 * comme avant (email + code), puis on leur demande de choisir un mot de passe personnel.
 */

const GENERIC_LOGIN_ERROR = "Email ou mot de passe incorrect.";

export async function login(email: string, password: string) {
  try {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !password) return { error: GENERIC_LOGIN_ERROR };

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes('email not confirmed')) {
        return { error: "Confirme d'abord ton adresse email : un lien t'a été envoyé à l'inscription." };
      }
      // Message unique : on ne révèle pas si le compte existe (pas d'énumération d'emails).
      return { error: GENERIC_LOGIN_ERROR };
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle();
    const role = roleData?.role === 'admin' ? 'admin' : 'student';

    // Ancien compte dont le mot de passe EST son code d'accès : l'administrateur voit ce code en
    // clair dans le tableau de bord, il faut donc le remplacer par un mot de passe personnel.
    let mustChangePassword = false;
    if (role !== 'admin') {
      const { data: code } = await supabaseAdmin
        .from('access_codes').select('id')
        .eq('code', password)
        .ilike('email', exactEmailPattern(cleanEmail))
        .maybeSingle();
      mustChangePassword = !!code;
    }

    return { success: true, role, mustChangePassword };
  } catch (err) {
    console.error('[auth] login:', err);
    return { error: "Une erreur inattendue s'est produite." };
  }
}

// Inscription Free — flux PUBLIC signUp() de Supabase (mot de passe réel, confirmation email).
// Un trigger crée la ligne user_roles. L'utilisateur reste Free tant qu'il n'a pas activé de code.
export async function signUpFree(email: string, password: string) {
  try {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !password) return { error: "Email et mot de passe requis." };
    if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return { error: "Un compte existe déjà avec cet email. Connecte-toi plutôt." };
      }
      if (msg.includes('password')) return { error: "Ce mot de passe est trop faible. Choisis-en un plus long." };
      console.error('[auth] signUpFree:', error.message);
      return { error: "Inscription impossible pour le moment. Réessaie dans un instant." };
    }
    if (!data.user) return { error: "Impossible de créer le compte." };

    return { success: true, needsConfirmation: !data.session };
  } catch (err) {
    console.error('[auth] signUpFree:', err);
    return { error: "Une erreur inattendue s'est produite." };
  }
}

/** Nouveau mot de passe pour le compte CONNECTÉ (et seulement lui). */
export async function changeMyPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Le nouveau mot de passe ne doit pas être un code d'accès (visible par l'administrateur).
  const { data: isCode } = await supabaseAdmin
    .from('access_codes').select('id').eq('code', newPassword).maybeSingle();
  if (isCode) return { error: "Choisis un mot de passe personnel, différent de ton code d'accès." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error('[auth] changeMyPassword:', error.message);
    return { error: "Modification impossible. Choisis un autre mot de passe ou réessaie." };
  }
  return { success: true };
}

/** Tentatives d'activation par jour : empêche de deviner des codes en boucle. */
const CODE_ATTEMPTS_PER_DAY = 10;

/**
 * Active un code Premium sur le compte CONNECTÉ.
 * Le code doit être actif et soit vierge, soit déjà rattaché à l'email de ce compte.
 */
export async function activateAccessCode(rawCode: string) {
  const code = (rawCode || '').trim();
  if (!code || code.length > 100) return { error: "Saisis ton code d'accès." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Non authentifié' };
  const email = normalizeEmail(user.email);

  // Compteur atomique existant (consume_free_quota est générique : utilisateur + clé + limite).
  const { data: attempt, error: attemptErr } = await supabaseAdmin.rpc('consume_free_quota', {
    p_user_id: user.id, p_feature: 'code_attempt', p_limit: CODE_ATTEMPTS_PER_DAY,
  });
  if (attemptErr) {
    console.error('[auth] compteur de tentatives indisponible:', attemptErr.message);
    return { error: "Activation impossible pour le moment. Réessaie dans un instant." };
  }
  const attemptRow = Array.isArray(attempt) ? attempt[0] : attempt;
  if (attemptRow?.allowed !== true) {
    return { error: "Trop de tentatives aujourd'hui. Réessaie demain ou contacte l'administrateur." };
  }

  const { data: accessCode } = await supabaseAdmin
    .from('access_codes').select('*').eq('code', code).maybeSingle();

  const invalid = { error: "Ce code n'est pas valide. Vérifie-le ou contacte l'administrateur." };
  if (!accessCode || accessCode.status !== 'active') return invalid;

  if (accessCode.email) {
    // Déjà rattaché : valable uniquement pour son titulaire.
    if (normalizeEmail(accessCode.email) !== email) return invalid;
    if (!isCodeCurrentlyActive(accessCode)) {
      return { error: "Ton abonnement Premium a expiré. Contacte l'administrateur pour le renouveler." };
    }
    return { success: true, alreadyActive: true };
  }

  // Claim ATOMIQUE : n'assigne l'email que si le code est encore vierge (email IS NULL).
  // Le mois de Premium démarre à cet instant (expires_at).
  const claim = (patch: Record<string, string>) => supabaseAdmin
    .from('access_codes')
    .update(patch)
    .eq('id', accessCode.id)
    .is('email', null)
    .select('id')
    .maybeSingle();
  let { data: claimed, error: claimErr } = await claim({ email, expires_at: premiumExpiryFromNow() });
  if (isMissingColumn(claimErr)) {
    // Migration expires_at non appliquée : activation sans date (comportement historique).
    ({ data: claimed, error: claimErr } = await claim({ email }));
  }

  if (claimErr) {
    console.error('[auth] activation du code:', claimErr.message);
    return { error: "Activation impossible pour le moment. Réessaie dans un instant." };
  }
  if (!claimed) return invalid; // réclamé par quelqu'un d'autre entre-temps

  revalidatePath('/app', 'layout');
  return { success: true };
}
