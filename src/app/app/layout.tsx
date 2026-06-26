import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar/Sidebar';
import { Header } from '@/components/layout/Header/Header';
import styles from './layout.module.css';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let isAdmin = false;
  if (user) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    isAdmin = roleData?.role === 'admin';
  }

  return (
    <div className={styles.appContainer}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.mainWrapper}>
        <Header className={styles.header} isAdmin={isAdmin} />
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </div>
  );
}
