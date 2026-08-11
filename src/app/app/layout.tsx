import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar/Sidebar';
import { Header } from '@/components/layout/Header/Header';
import styles from './layout.module.css';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import AdHighImpactSlot from '@/components/ads/AdHighImpactSlot';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  let premium = false;
  if (user) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    isAdmin = roleData?.role === 'admin';

    // Calculé ici une fois par navigation, puis transmis au menu pour les cadenas et
    // le badge de plan. Cette valeur ne sert QU'À L'AFFICHAGE : chaque fonctionnalité
    // revérifie le plan côté serveur avant d'agir.
    premium = await isPremium(supabase, user.email);
  }

  return (
    <div className={styles.appContainer}>
      <Sidebar className={styles.sidebar} isAdmin={isAdmin} premium={premium} />
      <div className={styles.mainWrapper}>
        <Header className={styles.header} isAdmin={isAdmin} />
        <main className={styles.mainContent}>
          {children}
        </main>
        {/* Format haute visibilité, comptes Free uniquement. Monté une seule fois
            pour toute la session de navigation ; il s'efface de lui-même sur les
            pages d'examen, d'étude et de rédaction en cours. */}
        <AdHighImpactSlot />
      </div>
    </div>
  );
}
