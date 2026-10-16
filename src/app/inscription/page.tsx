"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { signUpFree } from '@/app/actions/auth';

export default function InscriptionPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await signUpFree(email, password);

    if (result.error) {
      setMessage(result.error);
      setLoading(false);
    } else if (result.needsConfirmation) {
      // Confirmation email exigée par Supabase : le compte existe mais n'a pas encore de session.
      setDone(true);
      setLoading(false);
    } else {
      // Confirmation désactivée : signUp() a déjà ouvert la session.
      router.push('/app/dashboard');
      router.refresh();
    }
  };

  return (
    <AuthShell>
      <h1 className={styles.title}>Crée ton compte gratuit</h1>
      <p className={styles.lead}>Commence tout de suite avec les cours du catalogue.</p>

      {done ? (
        <div className={styles.done}>
          <p>
            Un lien de confirmation vient d’être envoyé à <strong>{email}</strong>. Ouvre-le pour activer ton compte.
          </p>
          <Link href="/login">
            <Button block>Aller à la connexion</Button>
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.points}>
            <li>Études guidées, révisions et examens sur les cours du catalogue</li>
            <li>Sans carte bancaire</li>
            <li>Passe au Premium quand tu veux travailler sur tes propres cours</li>
          </ul>

          <form className={styles.form} onSubmit={handleSignup}>
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
              autoComplete="new-password"
              minLength={8}
              placeholder="8 caractères minimum"
              required
            />

            {message && <p className={styles.error} role="alert">{message}</p>}

            <Button type="submit" block disabled={loading}>
              {loading ? 'Création du compte…' : 'Créer mon compte'}
            </Button>
          </form>

          <p className={styles.switch}>
            Déjà un compte ? <Link href="/login">Se connecter</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
