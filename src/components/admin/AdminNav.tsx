"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, KeyRound, Library, ArrowLeftRight } from 'lucide-react';
import styles from './admin.module.css';

const ITEMS = [
  { href: '/admin/dashboard', label: 'Vue d’ensemble', icon: LayoutDashboard, exact: true },
  { href: '/admin/dashboard/users', label: 'Codes d’accès', icon: KeyRound },
  { href: '/admin/dashboard/catalogue', label: 'Catalogue', icon: Library },
];

/** Navigation de l'administration : colonne à gauche sur ordinateur, onglets en bas sur mobile. */
export function AdminNav() {
  const pathname = usePathname() || '';
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <aside className={styles.side}>
        <Link href="/admin/dashboard" className={styles.brand}>
          <span className={styles.brandMark}>SJP</span>
          <span className={styles.brandTag}>Administration</span>
        </Link>
        <nav className={styles.nav} aria-label="Administration">
          {ITEMS.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className={`${styles.navItem} ${isActive(href, exact) ? styles.navOn : ''}`} aria-current={isActive(href, exact) ? 'page' : undefined}>
              <Icon size={19} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <Link href="/app/dashboard" className={styles.switch}>
          <ArrowLeftRight size={17} aria-hidden /> Vue étudiant
        </Link>
      </aside>

      <nav className={styles.tabbar} aria-label="Administration">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => (
          <Link key={href} href={href} className={`${styles.tab} ${isActive(href, exact) ? styles.tabOn : ''}`}>
            <Icon size={21} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
        <Link href="/app/dashboard" className={styles.tab}>
          <ArrowLeftRight size={21} aria-hidden />
          <span>Vue étudiant</span>
        </Link>
      </nav>
    </>
  );
}
