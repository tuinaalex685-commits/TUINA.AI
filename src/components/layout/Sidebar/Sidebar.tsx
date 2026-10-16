"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, LogOut, Menu, X, UserRound, ShieldCheck } from 'lucide-react';
import styles from './Sidebar.module.css';
import { supabase } from '@/lib/supabase/client';
import { NAV_GROUPS, visibleItems, mobileTabs } from './navItems';

interface SidebarProps {
  className?: string;
  isAdmin?: boolean;
  premium?: boolean;
}

/**
 * Ordinateur : menu latéral blanc, regroupé par intention.
 * Tablette  : le même menu réduit à une colonne d'icônes avec libellés courts.
 * Mobile    : barre d'onglets en bas (au pouce) + « Menu » qui ouvre la liste complète.
 */
export function Sidebar({ className, isAdmin = false, premium = false }: SidebarProps) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Changement de page → la feuille mobile se referme (ajusté pendant le rendu, sans effet).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (sheetOpen) setSheetOpen(false);
  }

  // La feuille mobile se ferme avec Échap, comme toute fenêtre.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const navList = (
    <nav className={styles.nav} aria-label="Navigation principale">
      {NAV_GROUPS.map((group, gi) => {
        const items = visibleItems(group.items, premium);
        if (items.length === 0) return null;
        return (
          <div key={gi} className={styles.group}>
            {group.title && <p className={styles.groupTitle}>{group.title}</p>}
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              const locked = !!item.premiumOnly && !premium;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  prefetch
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon size={19} strokeWidth={1.9} className={styles.icon} aria-hidden />
                  <span className={styles.label}>{item.label}</span>
                  {/* Le lien reste cliquable : la page présente la fonctionnalité et le Premium. */}
                  {locked && <Lock size={13} className={styles.lock} aria-label="Réservé au Premium" />}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const footer = (
    <div className={styles.footer}>
      {premium ? (
        <p className={styles.plan}><span className={styles.planDot} aria-hidden /> SJP Premium</p>
      ) : (
        <div className={styles.upgrade}>
          <p className={styles.upgradeTitle}>Version gratuite</p>
          <p className={styles.upgradeText}>Importe tes propres cours et débloque la Rédaction.</p>
          <Link href="/#pricing" className={styles.upgradeCta}>Passer au Premium · 2 500 FCFA/mois</Link>
          <Link href="/app/compte" className={styles.codeLink}>J’ai un code d’accès</Link>
        </div>
      )}
      {isAdmin && (
        <Link href="/admin/dashboard" className={styles.footerLink}>
          <ShieldCheck size={18} aria-hidden /> <span className={styles.label}>Administration</span>
        </Link>
      )}
      <Link href="/app/compte" className={`${styles.footerLink} ${isActive('/app/compte') ? styles.active : ''}`}>
        <UserRound size={18} aria-hidden /> <span className={styles.label}>Mon compte</span>
      </Link>
      <button type="button" onClick={handleLogout} className={styles.footerLink}>
        <LogOut size={18} aria-hidden /> <span className={styles.label}>Se déconnecter</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Ordinateur et tablette */}
      <aside className={`${styles.sidebar} ${className || ''}`}>
        <Link href="/app/dashboard" className={styles.brand} aria-label="SJP, accueil">
          <span className={styles.brandMark}>SJP</span>
          <span className={styles.brandName}>Sciences juridiques et politiques</span>
        </Link>
        {navList}
        {footer}
      </aside>

      {/* Mobile : barre d'onglets */}
      <nav className={styles.tabbar} aria-label="Navigation rapide">
        {mobileTabs(premium).map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link key={tab.path} href={tab.path} prefetch className={`${styles.tab} ${active ? styles.tabActive : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button type="button" className={`${styles.tab} ${sheetOpen ? styles.tabActive : ''}`} onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen} aria-controls="menu-mobile">
          <Menu size={22} strokeWidth={1.8} aria-hidden />
          <span>Menu</span>
        </button>
      </nav>

      {/* Mobile : feuille « Menu » avec toutes les sections */}
      {sheetOpen && (
        <div className={styles.sheetLayer}>
          <div className={styles.scrim} onClick={() => setSheetOpen(false)} aria-hidden />
          <div id="menu-mobile" className={styles.sheet} role="dialog" aria-modal="true" aria-label="Menu">
            <div className={styles.sheetHead}>
              <span className={styles.brandMark}>SJP</span>
              <button type="button" className={styles.sheetClose} onClick={() => setSheetOpen(false)} aria-label="Fermer le menu">
                <X size={22} />
              </button>
            </div>
            {navList}
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
