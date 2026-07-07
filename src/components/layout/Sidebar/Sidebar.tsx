"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import styles from './Sidebar.module.css';
import { supabase } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app/dashboard', icon: '📊' },
  { label: 'Objectifs', path: '/app/objectifs', icon: '🎯' },
  { label: 'Matières', path: '/app/matieres', icon: '📚' },
  { label: 'Étude Guidée', path: '/app/etude', icon: '📖' },
  { label: 'Bibliothèque', path: '/app/bibliotheque', icon: '📁' },
  { label: 'Révisions', path: '/app/revisions', icon: '🧠' },
  { label: 'Évaluations', path: '/app/evaluations', icon: '📝' },
  { label: 'Rédaction', path: '/app/redaction', icon: '✍️' },
  { label: 'Progression', path: '/app/progression', icon: '📈' },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle as EventListener);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={() => setIsOpen(false)} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''} ${className || ''}`}>
        <div className={styles.logoContainer}>
          <h1 className={styles.logo}>Tuina.ai</h1>
          <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.path);
            return (
              <Link 
                key={item.path} 
                href={item.path}
                prefetch={true}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span className={styles.label}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div style={{ marginTop: 'auto', padding: 'var(--spacing-standard)', borderTop: '1px solid var(--color-border)' }}>
          <button onClick={handleLogout} className={styles.navItem} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}>
            <span className={styles.icon}>🚪</span>
            <span className={styles.label}>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
}
