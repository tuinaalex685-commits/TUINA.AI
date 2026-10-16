import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = l'action principale de l'écran (une seule) ; secondary = action d'appoint ;
   *  ghost = action discrète ; danger = action destructrice, jamais mise en avant. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block = false, children, className, ...props }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === 'sm' ? styles.sm : '', block ? styles.block : '', className || '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
