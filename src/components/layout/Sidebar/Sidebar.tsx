"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { Lock, LogOut, Menu, X, UserRound, ShieldCheck } from 'lucide-react';
import styles from './Sidebar.module.css';
import { supabase } from '@/lib/supabase/client';
import { NAV_GROUPS, TONES, visibleItems, mobileTabs, type NavTone } from './navItems';

interface SidebarProps {
  className?: string;
  isAdmin?: boolean;
  premium?: boolean;
}

/** Variables CSS de la teinte d'une entrée, lues par Sidebar.module.css. */
const toneVars = (tone: NavTone) => ({
  '--tone': TONES[tone].ink,
  '--tone-soft': TONES[tone].soft,
  '--tone-glow': TONES[tone].glow,
}) as React.CSSProperties;

/** Ressort court : la pastille glisse vite d'une entrée à l'autre et se pose sans rebond visible. */
const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 } as const;
/** Ressort vif pour l'icône qui « s'allume » : un petit rebond, une seule fois. */
const ICON_SPRING = { type: 'spring', stiffness: 600, damping: 14 } as const;

/**
 * Ordinateur : menu latéral blanc, regroupé par intention.
 * Tablette  : le même menu réduit à une colonne d'icônes avec libellés courts.
 * Mobile    : barre d'onglets en bas (au pouce) + « Menu » qui ouvre la liste complète.
 *
 * Chaque section a sa couleur (navItems.ts). L'entrée active est marquée par une pastille
 * teintée qui glisse d'une entrée à l'autre (layoutId) ; au clic, un halo bref de la même
 * couleur « allume » l'entrée. Tout est coupé si l'appareil demande moins d'animations.
 */
export function Sidebar({ className, isAdmin = false, premium = false }: SidebarProps) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  // Dernière entrée cliquée : le compteur relance le halo même sur un second clic.
  const [flash, setFlash] = useState<{ path: string; n: number }>({ path: '', n: 0 });
  const ignite = (path: string) => setFlash((f) => ({ path, n: f.n + 1 }));

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

  // `scope` sépare la pastille du menu latéral de celle de la feuille mobile (deux layoutId).
  const renderNav = (scope: 'side' | 'sheet') => (
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
                  style={toneVars(item.tone)}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                  onClick={() => ignite(item.path)}
                >
                  {active && (
                    <motion.span layoutId={`nav-pill-${scope}`} className={styles.pill} transition={PILL_SPRING} aria-hidden />
                  )}
                  {flash.path === item.path && <span key={flash.n} className={styles.halo} aria-hidden />}
                  <motion.span
                    key={active ? 'on' : 'off'}
                    className={styles.iconWrap}
                    initial={active ? { scale: 0.7, rotate: -12 } : false}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={ICON_SPRING}
                    whileTap={{ scale: 0.82 }}
                  >
                    <Icon size={19} strokeWidth={active ? 2.2 : 1.9} className={styles.icon} aria-hidden />
                  </motion.span>
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

  // reducedMotion="user" : si l'appareil demande moins d'animations, framer-motion les coupe.
  return (
    <MotionConfig reducedMotion="user">
      {/* Ordinateur et tablette */}
      <aside className={`${styles.sidebar} ${className || ''}`}>
        <Link href="/app/dashboard" className={styles.brand} aria-label="SJP, accueil">
          <span className={styles.brandMark}>SJP</span>
          <span className={styles.brandName}>Sciences juridiques et politiques</span>
        </Link>
        {renderNav('side')}
        {footer}
      </aside>

      {/* Mobile : barre d'onglets */}
      <nav className={styles.tabbar} aria-label="Navigation rapide">
        {mobileTabs(premium).map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              prefetch
              className={`${styles.tab} ${active ? styles.tabActive : ''}`}
              style={toneVars(tab.tone)}
              aria-current={active ? 'page' : undefined}
              onClick={() => ignite(tab.path)}
            >
              <span className={styles.tabIcon}>
                {active && <motion.span layoutId="tab-pill" className={styles.tabPill} transition={PILL_SPRING} aria-hidden />}
                {flash.path === tab.path && <span key={flash.n} className={styles.tabHalo} aria-hidden />}
                <motion.span className={styles.tabGlyph} whileTap={{ scale: 0.8 }}>
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                </motion.span>
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button type="button" className={`${styles.tab} ${sheetOpen ? styles.tabActive : ''}`} onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen} aria-controls="menu-mobile">
          <span className={styles.tabIcon}>
            <span className={styles.tabGlyph}><Menu size={22} strokeWidth={1.8} aria-hidden /></span>
          </span>
          <span>Menu</span>
        </button>
      </nav>

      {/* Mobile : feuille « Menu » avec toutes les sections */}
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
            {renderNav('sheet')}
            {footer}
          </div>
        </div>
      )}
    </MotionConfig>
  );
}
