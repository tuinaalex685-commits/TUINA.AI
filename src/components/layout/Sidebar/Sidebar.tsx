"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X, Lock } from 'lucide-react';
import styles from './Sidebar.module.css';
import { supabase } from '@/lib/supabase/client';

/**
 * `premiumOnly` n'interdit rien : il pose un cadenas visuel pour que l'étudiant Free
 * sache d'avance ce qui est réservé au Premium, au lieu de le découvrir en cliquant.
 * Le vrai verrou est côté serveur, sur chaque page et chaque action concernée.
 */
const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app/dashboard', icon: '📊' },
  { label: 'Catalogue', path: '/app/catalogue', icon: '🏛️' },
  { label: 'Objectifs', path: '/app/objectifs', icon: '🎯' },
  { label: 'Matières', path: '/app/matieres', icon: '📚' },
  { label: 'Étude Guidée', path: '/app/etude', icon: '📖' },
  { label: 'Bibliothèque', path: '/app/bibliotheque', icon: '📁' },
  { label: 'Révisions', path: '/app/revisions', icon: '🧠' },
  { label: 'Examen', path: '/app/examen', icon: '🎓' },
  { label: 'Rédaction', path: '/app/redaction', icon: '✍️', premiumOnly: true },
  { label: 'Progression', path: '/app/progression', icon: '📈' },
];

export function Sidebar({ className, isAdmin, premium }: { className?: string, isAdmin?: boolean, premium?: boolean }) {
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
            const locked = !!item.premiumOnly && !premium;
            return (
              <Link
                key={item.path}
                href={item.path}
                prefetch={true}
                className={`${styles.navItem} ${isActive ? styles.active : ''} ${locked ? styles.locked : ''}`}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span className={styles.label}>{item.label}</span>
                {/* Le lien reste cliquable : la page présente alors la fonctionnalité
                    et propose le Premium. Un lien mort n'explique rien et ne convertit pas. */}
                {locked && <Lock size={13} className={styles.lockIcon} aria-label="Réservé au Premium" />}
              </Link>
            );
          })}
        </nav>
        
        {/* Badge de plan : l'étudiant doit savoir en permanence sur quelle version il est,
            sans avoir à chercher. En Free, c'est aussi le point d'entrée vers le Premium. */}
        <div className={styles.planBox}>
          {premium ? (
            <span className={`${styles.planBadge} ${styles.planPremium}`}>SJP Premium</span>
          ) : (
            <>
              <span className={styles.planBadge}>Version gratuite</span>
              <Link href="/#pricing" className={styles.planCta}>
                Passer au Premium
                <span className={styles.planPrice}>2 500 FCFA/mois</span>
              </Link>
            </>
          )}
        </div>

        <div style={{ padding: 'var(--spacing-standard)', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isAdmin && (
            <Link href="/admin/dashboard" className={styles.navItem} style={{ width: '100%', color: 'var(--color-primary)', backgroundColor: 'var(--color-bg-main)', border: '1px solid var(--color-primary)', justifyContent: 'center' }}>
              <span className={styles.label} style={{ fontWeight: 'bold' }}>Retour Admin</span>
            </Link>
          )}
          <button onClick={handleLogout} className={styles.navItem} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}>
            <span className={styles.icon}>🚪</span>
            <span className={styles.label}>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
}
