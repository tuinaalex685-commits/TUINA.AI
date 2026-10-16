"use client";

import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** Fenêtre de dialogue : feuille qui monte du bas sur mobile, fenêtre centrée sur ordinateur. */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.layer}>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
