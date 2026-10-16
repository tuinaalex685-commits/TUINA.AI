"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { login } from '@/app/actions/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

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
          Inscrit avant avec un code d’accès ? Saisis ce code comme mot de passe, puis choisis-en un personnel.
        </p>

        {message && <p className={styles.error} role="alert">{message}</p>}

        <Button type="submit" block disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <p className={styles.switch}>
        Pas encore de compte ? <Link href="/inscription">Créer un compte gratuit</Link>
      </p>
    </AuthShell>
  );
}
