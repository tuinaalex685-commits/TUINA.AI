import React from 'react';
import styles from './layout.module.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.adminContainer}>
      <div className={styles.header}>
        <div className={styles.logo}>Tuina.ai Admin</div>
        <div className={styles.actions}>
          {/* Lien pour basculer vers le Dashboard Étudiant */}
          <a href="/app/dashboard" className={styles.switchLink}>
            Basculer en vue Étudiant
          </a>
        </div>
      </div>
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
