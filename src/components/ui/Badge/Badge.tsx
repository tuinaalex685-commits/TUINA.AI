import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: 'mastered' | 'review' | 'difficult' | 'neutral';
  children: React.ReactNode;
}

export function Badge({ status, children, className, ...props }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]} ${className || ''}`} {...props}>
      {children}
    </span>
  );
}
