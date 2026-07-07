"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ShieldAlert } from 'lucide-react';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      try {
        // 1. Déconnexion via le client Supabase (efface les cookies de session)
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Erreur lors de la déconnexion", e);
      } finally {
        // 2. Redirection vers la page de login quoiqu'il arrive
        router.push('/login');
        router.refresh();
      }
    };

    performLogout();
  }, [router]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)'
    }}>
      <ShieldAlert size={64} style={{ color: 'var(--color-error)', marginBottom: '1rem' }} />
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Session expirée ou accès révoqué</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Déconnexion sécurisée en cours...</p>
    </div>
  );
}
