"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { requestPasswordReset } from '@/app/actions/motdepasse';

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErreur('');
    const res = await requestPasswordReset(email);
    setLoading(false);
    if ('error' in res && res.error) setErreur(res.error);
    else if ('message' in res && res.message) setMessage(res.message);
  };

  return (
    <AuthShell>
      <h1 className={styles.title}>Mot de passe oublié</h1>
      <p className={styles.lead}>Donne l’adresse de ton compte gratuit : tu recevras un lien pour choisir un nouveau mot de passe.</p>
      {message ? (
        <p className={styles.hint} role="status">{message}</p>
      ) : (
        <form className={styles.form} onSubmit={envoyer}>
          <Input label="Adresse email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@exemple.com" required />
          {erreur && <p className={styles.error} role="alert">{erreur}</p>}
          <Button type="submit" block disabled={loading}>{loading ? 'Envoi…' : 'Recevoir le lien'}</Button>
          <p className={styles.hint}>Compte Premium : la réinitialisation se fait auprès de l’administrateur.</p>
        </form>
      )}
      <p className={styles.switch}><Link href="/login">Retour à la connexion</Link></p>
    </AuthShell>
  );
}
