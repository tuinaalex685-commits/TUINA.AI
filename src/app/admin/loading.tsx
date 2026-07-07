import React from 'react';
import styles from './loading.module.css';

export default function Loading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonTitle}></div>
        <div className={styles.skeletonButton}></div>
      </div>
      
      <div className={styles.skeletonGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonLine}></div>
            <div className={styles.skeletonLineShort}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
