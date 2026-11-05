"use client";

import { useState } from 'react';
import { supabase as supabaseNavigateur } from '@/lib/supabase/client';
import styles from './auth.module.css';

/**
 * « Continuer avec Google », pour TOUS les étudiants (connexion comme inscription).
 * Gratuit : il entre avec son compte (créé au premier passage). Premium : le Premium est rattaché à
 * l'adresse email par le code d'accès, il entre donc directement en Premium, sans ressaisir de
 * code. Google ne donne jamais le Premium : une adresse sans code reste un compte gratuit.
 */
export function BoutonGoogle({ niveau }: { niveau?: string | null } = {}) {
  const [erreur, setErreur] = useState('');
  const google = async () => {
    setErreur('');
    // Inscription : l'année choisie suit le passage par Google (enregistrée si le compte n'en a pas).
    const suite = niveau ? `&niveau=${encodeURIComponent(niveau)}` : '';
    const { error } = await supabaseNavigateur.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/app/dashboard${suite}` },
    });
    if (error) setErreur('La connexion Google est momentanément indisponible. Réessaie, ou utilise ton adresse email.');
  };
  return (
    <>
      <p className={styles.ou} aria-hidden><span>ou</span></p>
      <div className={styles.form}>
        <button type="button" onClick={google} className={styles.google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
          Continuer avec Google
        </button>
        <p className={styles.hint} style={{ margin: 0 }}>Premium : choisis l’adresse liée à ton code d’accès.</p>
        {erreur && <p className={styles.hint} role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{erreur}</p>}
      </div>
    </>
  );
}
