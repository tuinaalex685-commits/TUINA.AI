import React from 'react';
import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Carte cliquable : léger retour visuel au survol. */
  interactive?: boolean;
  children: React.ReactNode;
}

export function Card({ children, className, interactive = false, ...props }: CardProps) {
  return (
    <div className={`${styles.card} ${interactive ? styles.interactive : ''} ${className || ''}`} {...props}>
      {children}
    </div>
  );
}
