"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
import { setNewPassword } from '@/app/actions/motdepasse';

export default function ReinitialiserPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    if (pw !== pw2) { setErreur('Les deux mots de passe ne sont pas identiques.'); return; }
    setLoading(true);
    const res = await setNewPassword(pw);
    setLoading(false);
    if ('error' in res && res.error) setErreur(res.error);
    else router.push('/app/dashboard');
  };

  return (
    <AuthShell>
      <h1 className={styles.title}>Nouveau mot de passe</h1>
      <p className={styles.lead}>Choisis un mot de passe d’au moins 8 caractères.</p>
      <form className={styles.form} onSubmit={valider}>
        <Input label="Nouveau mot de passe" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
        <Input label="Confirme le mot de passe" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
        {erreur && <p className={styles.error} role="alert">{erreur}</p>}
        <Button type="submit" block disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer et me connecter'}</Button>
      </form>
    </AuthShell>
  );
}
