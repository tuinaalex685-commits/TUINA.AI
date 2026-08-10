"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import styles from '../login/login.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUpFree } from '@/app/actions/auth';
import { motion } from 'framer-motion';

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
      // Confirmation email requise (Option A) : le compte existe mais n'a pas encore de session.
      setDone(true);
      setLoading(false);
    } else {
      // Confirmation désactivée côté Supabase (Option B) : signUp() a déjà ouvert une session,
      // les cookies sont posés — direction directe vers l'app, pas de "vérifie ta boîte mail" trompeur.
      router.push('/app/dashboard');
      router.refresh();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={`${styles.glow} ${styles.glow1}`} />
        <div className={`${styles.glow} ${styles.glow2}`} />
      </div>

      <motion.div
        className={styles.formWrapper}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Card className={styles.loginCard}>
          <div className={styles.header}>
            <h1 className={styles.logo}>Tuina.ai</h1>
            <p className={styles.subtitle}>Découvre SJP gratuitement</p>
            <div className={styles.trustRow}>
              <span>✓ Sans carte bancaire</span>
              <span>✓ Accès immédiat</span>
            </div>
          </div>

          {done ? (
            <div style={{ textAlign: 'center', color: '#e5e7eb' }}>
              <p style={{ marginBottom: '20px' }}>
                Vérifie ta boîte mail (<strong>{email}</strong>) et clique sur le lien de confirmation pour activer ton compte.
              </p>
              <Link href="/login">
                <Button style={{ width: '100%' }}>Aller à la connexion</Button>
              </Link>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSignup}>
              <Input
                label="Adresse email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@exemple.com"
                required
              />
              <Input
                label="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                required
              />

              {message && <p className={styles.message}>{message}</p>}

              <div className={styles.actions}>
                <Button type="submit" disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Création...' : 'Créer mon compte gratuit'}
                </Button>
              </div>

              <p style={{ textAlign: 'center', fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
                Déjà un compte ? <Link href="/login" style={{ color: '#a5b4fc' }}>Se connecter</Link>
              </p>
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
