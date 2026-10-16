import React from 'react';
import styles from './layout.module.css';
import Link from 'next/link';
import { Shield, ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/viewer';
import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Défense en profondeur : proxy.ts filtre déjà /admin, mais les pages d'administration lisent
  // les données avec le service role. Le rôle est donc revérifié ici, à chaque rendu.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { data: role } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (role?.role !== 'admin') redirect('/app/dashboard');

  return (
    <div className={styles.adminContainer}>
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <Shield size={20} />
          </div>
          <div className={styles.logoText}>SJP Admin</div>
        </div>
        <div className={styles.actions}>
          <Link href="/app/dashboard" className={styles.switchLink}>
            Basculer en vue Étudiant
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
