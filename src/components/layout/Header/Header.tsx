"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';

const ROUTE_TITLES: [string, string][] = [
  ['/app/dashboard', 'Accueil'],
  ['/app/catalogue', 'Catalogue de cours'],
  ['/app/etude', 'Études guidées'],
  ['/app/matieres', 'Mes matières'],
  ['/app/bibliotheque', 'Mes documents'],
  ['/app/revisions', 'Révisions'],
  ['/app/examen', 'Examens'],
  ['/app/evaluations', 'Évaluations'],
  ['/app/redaction', 'Rédaction'],
  ['/app/objectifs', 'Objectifs'],
  ['/app/progression', 'Progression'],
  ['/app/compte', 'Mon compte'],
];

interface HeaderProps {
  className?: string;
  /** Initiale de l'étudiant (calculée côté serveur à partir de son compte). */
  initial?: string;
}

/**
 * Barre supérieure : le titre de la section et l'accès au compte. Rien d'autre :
 * l'ancien bouton « Nouveau » ne faisait rien et l'avatar affichait « ED » pour tout le monde.
 */
export function Header({ className, initial = '?' }: HeaderProps) {
  const pathname = usePathname() || '';
  const title = ROUTE_TITLES.find(([route]) => pathname.startsWith(route))?.[1] ?? 'SJP';

  return (
    <header className={`${styles.header} ${className || ''}`} data-print="hide">
      <span className={styles.mobileBrand} aria-hidden>SJP</span>
      <p className={styles.title}>{title}</p>
      <Link href="/app/compte" className={styles.avatar} aria-label="Mon compte">
        {initial}
      </Link>
    </header>
  );
}
