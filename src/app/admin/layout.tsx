import React from 'react';
import styles from './layout.module.css';
import Link from 'next/link';
import { Shield, ArrowRight } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.adminContainer}>
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <Shield size={20} />
          </div>
          <div className={styles.logoText}>Tuina.ai Admin</div>
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
