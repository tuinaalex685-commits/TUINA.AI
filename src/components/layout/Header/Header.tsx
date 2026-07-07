"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';
import { Button } from '@/components/ui/Button/Button';
import Link from 'next/link';
import { Menu } from 'lucide-react';

const ROUTE_TITLES: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/matieres': 'Mes Matières',
  '/app/bibliotheque': 'Bibliothèque Documentaire',
  '/app/revisions': 'Centre de Révision',
  '/app/evaluations': 'Évaluations & Quiz',
  '/app/redaction': 'Rédaction Juridique',
  '/app/objectifs': 'Mes Objectifs',
  '/app/progression': 'Ma Progression',
};

export function Header({ className, isAdmin = false }: { className?: string, isAdmin?: boolean }) {
  const pathname = usePathname() || '';
  
  let title = 'Tuina.ai';
  for (const [route, routeTitle] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(route)) {
      title = routeTitle;
      break;
    }
  }

  return (
    <header className={`${styles.header} ${className || ''}`}>
      <button 
        className={styles.hamburgerBtn}
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
        aria-label="Open Menu"
      >
        <Menu size={24} />
      </button>
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <div className={styles.actions}>
        {isAdmin && (
          <Link href="/admin/dashboard">
            <Button variant="secondary" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
              Retour Admin
            </Button>
          </Link>
        )}
        <Button variant="secondary" className={styles.mobileHidden}>Nouveau</Button>
        <div className={styles.profileAvatar}>
          <span>ED</span>
        </div>
      </div>
    </header>
  );
}
