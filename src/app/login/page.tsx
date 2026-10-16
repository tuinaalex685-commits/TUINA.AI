"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/app/actions/auth';
import { motion } from 'framer-motion';

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
    <div className={styles.container}>
      {/* Background elements */}
      <div className={styles.background}>
        <div className={`${styles.glow} ${styles.glow1}`} />
        <div className={`${styles.glow} ${styles.glow2}`} />
        <div className={styles.toque} />
        <div className={styles.vignette} />
      </div>

      <motion.div 
        className={styles.formWrapper}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Card className={styles.loginCard}>
          <div className={styles.header}>
            <h1 className={styles.logo}>SJP</h1>
            <p className={styles.subtitle}>Connexion à la plateforme</p>
          </div>
          
          <form className={styles.form} onSubmit={handleLogin}>
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
              placeholder="Ton mot de passe"
              autoComplete="current-password"
              required
            />
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '-4px 0 0' }}>
              Déjà inscrit avec un code d&apos;accès ? Saisis ton code comme mot de passe : on te proposera ensuite d&apos;en choisir un personnel.
            </p>
            
            {message && <p className={styles.message}>{message}</p>}
            
            <div className={styles.actions}>
              <Button type="submit" disabled={loading} style={{width: '100%'}}>
                {loading ? 'Vérification...' : 'Se connecter'}
              </Button>
            </div>

            <p style={{ textAlign: 'center', fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
              Pas encore de compte ? <Link href="/inscription" style={{ color: '#a5b4fc' }}>Essayer gratuitement</Link>
            </p>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
