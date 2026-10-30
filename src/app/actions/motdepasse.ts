"use server";

import { createAuthClient, createClient } from '@/lib/supabase/server';
import { normalizeEmail, hasWildcardChars } from '@/lib/email';
import { isPremium } from '@/lib/plan';
import { appBaseUrl } from '@/lib/jobs/workerUrl';

/**
 * MOT DE PASSE OUBLIÉ — réservé aux comptes GRATUITS (règle du responsable) : un compte Premium
 * se connecte uniquement avec son email et le moyen remis par l'administrateur.
 *
 * Sécurité :
 *  - réponse IDENTIQUE que le compte existe, soit gratuit, soit Premium, ou n'existe pas : aucune
 *    énumération d'adresses ;
 *  - le lien est envoyé par Supabase (jeton à usage unique, durée courte) ; l'IP de l'étudiant est
 *    transmise (limite d'envoi par IP) ;
 *  - le nouveau mot de passe n'est accepté que dans la session ouverte par ce lien, et jamais
 *    pour un compte Premium.
 */

const MESSAGE_ENVOI = 'Si un compte gratuit existe pour cette adresse, un lien de réinitialisation vient de lui être envoyé. Pense à regarder dans les courriers indésirables.';

export async function requestPasswordReset(email: string) {
  const clean = normalizeEmail(email);
  if (!clean || hasWildcardChars(clean) || clean.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { error: 'Adresse email invalide.' };
  }
  // Premium : aucun envoi, même réponse (on ne révèle pas le type de compte).
  if (await isPremium(null, clean)) return { success: true, message: MESSAGE_ENVOI };

  const base = appBaseUrl();
  if (!base) return { error: 'Service momentanément indisponible. Réessaie plus tard.' };
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${base}/auth/callback?next=/reinitialiser` });
  if (error && (error.status === 429 || /rate limit/i.test(error.message || ''))) {
    return { error: 'Trop de demandes en peu de temps. Réessaie dans quelques minutes.' };
  }
  if (error) console.error('[motdepasse] envoi du lien:', error.message);
  return { success: true, message: MESSAGE_ENVOI };
}

/** Nouveau mot de passe, dans la session ouverte par le lien reçu par email. */
export async function setNewPassword(password: string) {
  if (typeof password !== 'string' || password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };
  if (password.length > 128) return { error: 'Mot de passe trop long.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Le lien a expiré. Demande un nouveau lien de réinitialisation.' };
  if (await isPremium(supabase, user.email)) return { error: 'Les comptes Premium ne se réinitialisent pas par email. Contacte l’administrateur.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/should be different|same password/i.test(error.message || '')) return { error: 'Choisis un mot de passe différent de l’ancien.' };
    console.error('[motdepasse] mise à jour:', error.message);
    return { error: 'Mise à jour impossible pour le moment. Réessaie.' };
  }
  return { success: true };
}
