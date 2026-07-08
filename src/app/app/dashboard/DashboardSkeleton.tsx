import React from 'react';
import styles from './dashboard.module.css';

export default function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div style={{ width: '250px', height: '38px', backgroundColor: 'var(--color-border)', borderRadius: '8px', marginBottom: '8px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
        <div style={{ width: '350px', height: '24px', backgroundColor: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
      </header>

      <div className={styles.grid}>
        {/* Progression Globale Skeleton */}
        <div className={`${styles.cardPremium} ${styles.progressCard}`}>
          <div className={styles.progressHeader}>
            <div style={{ width: '150px', height: '24px', backgroundColor: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
          <div className={styles.donutContainer} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
             <div style={{ width: '120px', height: '120px', backgroundColor: 'var(--color-border)', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
             <div style={{ width: '140px', height: '16px', backgroundColor: 'var(--color-border)', borderRadius: '4px', marginTop: '16px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
        </div>

        {/* Section Objectifs Skeleton */}
        <div className={`${styles.cardPremium} ${styles.objectivesCard}`}>
          <div className={styles.objectivesHeader}>
            <div style={{ width: '180px', height: '24px', backgroundColor: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--color-border)', borderRadius: '8px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ width: '60%', height: '16px', backgroundColor: 'var(--color-border)', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-border)', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section Prochaines révisions Skeleton */}
        <div className={`${styles.cardPremium} ${styles.revisionsCard}`}>
          <div className={styles.revisionsHeader}>
             <div style={{ width: '200px', height: '24px', backgroundColor: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
          <div className={styles.revisionsContent} style={{ marginTop: '20px' }}>
             <div style={{ width: '80%', height: '20px', backgroundColor: 'var(--color-border)', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
             <div style={{ width: '60%', height: '16px', backgroundColor: 'var(--color-border)', borderRadius: '4px', marginBottom: '24px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
             <div style={{ width: '100%', height: '44px', backgroundColor: 'var(--color-border)', borderRadius: '8px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
        </div>

        {/* Statistiques Réelles Skeleton */}
        <div className={styles.statsContainer}>
          <div style={{ width: '200px', height: '28px', backgroundColor: 'var(--color-border)', borderRadius: '6px', marginBottom: '20px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          <div className={styles.statsGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={styles.statWidget} style={{ animation: 'pulse 1.5s infinite ease-in-out' }}>
                <div style={{ width: '48px', height: '48px', backgroundColor: 'var(--color-border)', borderRadius: '12px' }}></div>
                <div style={{ flex: 1, marginLeft: '16px' }}>
                  <div style={{ width: '40px', height: '24px', backgroundColor: 'var(--color-border)', borderRadius: '4px', marginBottom: '8px' }}></div>
                  <div style={{ width: '80px', height: '16px', backgroundColor: 'var(--color-border)', borderRadius: '4px' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}} />
    </div>
  );
}
