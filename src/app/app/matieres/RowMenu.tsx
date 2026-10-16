"use client";

import React, { useEffect, useState } from 'react';
import { MoreHorizontal, Trash2, Download } from 'lucide-react';
import styles from './matieres.module.css';

/**
 * Menu « ⋯ » des écrans Matières : télécharger (facultatif) et supprimer avec confirmation
 * dans le menu lui-même (pas de confirm() du navigateur, illisible sur mobile).
 */
export function RowMenu({ label, deleteLabel, deleteNote, onDelete, downloadUrl }: {
  label: string;
  deleteLabel: string;
  deleteNote: string;
  onDelete: () => void;
  downloadUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Un clic ailleurs ou Échap referme le menu.
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setConfirming(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={styles.rowMenu}>
      <button
        type="button"
        className={styles.moreBtn}
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); setOpen(!open); }}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className={styles.menu} role="menu" onClick={(e) => e.stopPropagation()}>
          {downloadUrl && (
            <a role="menuitem" className={styles.menuItem} href={downloadUrl} download target="_blank" rel="noopener noreferrer">
              <Download size={16} aria-hidden /> Télécharger
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={() => {
              if (!confirming) { setConfirming(true); return; }
              setOpen(false);
              setConfirming(false);
              onDelete();
            }}
          >
            <Trash2 size={16} aria-hidden /> {confirming ? 'Confirmer la suppression' : deleteLabel}
          </button>
          {confirming && <p className={styles.menuNote}>{deleteNote}</p>}
        </div>
      )}
    </div>
  );
}
