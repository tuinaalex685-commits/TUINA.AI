"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import { loginWithAccessCode } from '@/app/actions/auth';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    // Appel sécurisé au backend unifié
    const result = await loginWithAccessCode(email, code);

    if (result.error) {
      setMessage(result.error);
      setLoading(false);
    } else if (result.success) {
      if (result.role === 'admin') {
        router.push('/admin/dashboard');
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
              label="Mot de passe ou Code d'accès" 
              type="password" 
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Mot de passe ou TUINA-XXXXX"
              required
            />
            
            {message && <p className={styles.message}>{message}</p>}
            
            <div className={styles.actions}>
              <Button type="submit" disabled={loading} style={{width: '100%'}}>
                {loading ? 'Vérification...' : 'Se connecter'}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
