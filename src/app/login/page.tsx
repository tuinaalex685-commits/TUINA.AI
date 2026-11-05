"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { login } from '@/app/actions/auth';
import { BoutonGoogle } from '@/components/auth/BoutonGoogle';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [versPremium, setVersPremium] = useState(false);
  const router = useRouter();

  // Retour d'un lien (Google, mot de passe oublié) refusé : message clair.
  // « suite=premium » : venu du bouton « Passer au Premium » de l'accueil → retour sur l'offre.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('erreur') === 'lien') setMessage('Ce lien a expiré ou a déjà servi. Recommence.');
      if (params.get('suite') === 'premium') setVersPremium(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

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
        router.push(versPremium ? '/app/premium' : '/app/dashboard');
      }
    }
  };

  return (
    <AuthShell>
      <h1 className={styles.title}>Content de te revoir</h1>
      <p className={styles.lead}>
        {versPremium
          ? <>Connecte-toi pour passer au Premium. Pas encore de compte ? <Link href="/inscription" style={{ color: 'var(--action)', fontWeight: 600, textDecoration: 'underline' }}>Crée-le gratuitement</Link>, puis choisis Premium depuis ton tableau de bord.</>
          : 'Connecte-toi pour reprendre là où tu t’es arrêté.'}
      </p>

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

      <BoutonGoogle versPremium={versPremium} />

      <p className={styles.switch}>
        Pas encore de compte ? <Link href="/inscription">Créer un compte gratuit</Link>
      </p>
    </AuthShell>
  );
}
