"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app/dashboard', icon: '📊' },
  { label: 'Objectifs', path: '/app/objectifs', icon: '🎯' },
  { label: 'Matières', path: '/app/matieres', icon: '📚' },
  { label: 'Bibliothèque', path: '/app/bibliotheque', icon: '📁' },
  { label: 'Révisions', path: '/app/revisions', icon: '🧠' },
  { label: 'Évaluations', path: '/app/evaluations', icon: '📝' },
  { label: 'Rédaction', path: '/app/redaction', icon: '✍️' },
  { label: 'Progression', path: '/app/progression', icon: '📈' },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  // Mobile nav (5 max): Dashboard, Matières, Révisions, Évaluations, Menu
  return (
    <aside className={`${styles.sidebar} ${className || ''}`}>
      <div className={styles.logoContainer}>
        <h1 className={styles.logo}>Tuina.ai</h1>
      </div>
      
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname?.startsWith(item.path);
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
