"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { login } from '@/app/actions/auth';
import { supabase as supabaseNavigateur } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  // Retour d'un lien (Google, mot de passe oublié) refusé : message clair.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const e = new URLSearchParams(window.location.search).get('erreur');
      if (e === 'premium') setMessage('Compte Premium : connecte-toi avec ton adresse email et ton mot de passe (la connexion Google est réservée aux comptes gratuits).');
      else if (e === 'lien') setMessage('Ce lien a expiré ou a déjà servi. Recommence.');
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Connexion Google : comptes gratuits uniquement (un compte Premium est refusé au retour, côté serveur).
  const google = async () => {
    setMessage('');
    const { error } = await supabaseNavigateur.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/app/dashboard` },
    });
    if (error) setMessage('La connexion Google est momentanément indisponible.');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await login(email, password);

    if (result.error) {
      setMessage(result.error);
      setLoading(false);
    } else if (result.success) {
      if (result.role === 'admin') {
        router.push('/admin/dashboard');
      } else if (result.mustChangePassword) {
        // Ancien compte : le mot de passe est encore le code d'accès → mot de passe personnel.
        router.push('/app/compte?motdepasse=1');
      } else {
        router.push('/app/dashboard');
      }
    }
  };

  return (
    <AuthShell>
      <h1 className={styles.title}>Content de te revoir</h1>
      <p className={styles.lead}>Connecte-toi pour reprendre là où tu t’es arrêté.</p>

      <form className={styles.form} onSubmit={handleLogin}>
        <Input
          label="Adresse email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@exemple.com"
          required
        />
        <Input
          label="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <p className={styles.hint}>
          Tu viens de recevoir un code d’accès ? Crée d’abord ton compte gratuit, puis active ton code dans « Mon compte ».
          Compte créé avant le 16 octobre avec un code : ton mot de passe est ce code.
        </p>

        {message && <p className={styles.error} role="alert">{message}</p>}

        <Button type="submit" block disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
        <p className={styles.hint} style={{ textAlign: 'right', margin: 0 }}><Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
      </form>

      <p className={styles.ou} aria-hidden><span>ou</span></p>
      <div className={styles.form}>
        <button type="button" onClick={google} className={styles.google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
          Continuer avec Google
        </button>
        <p className={styles.hint} style={{ margin: 0 }}>Réservé aux comptes gratuits.</p>
      </div>

      <p className={styles.switch}>
        Pas encore de compte ? <Link href="/inscription">Créer un compte gratuit</Link>
      </p>
    </AuthShell>
  );
}
