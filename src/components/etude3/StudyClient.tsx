"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import { useJob } from '@/lib/hooks/useJob';
import { markSyntheseVue, prepareSequence, startEtude } from '@/app/actions/etude3';
import styles from './etude3.module.css';

/** Message d'erreur lisible (le préfixe technique PDF_SCANNE est retiré). */
export const cleanError = (msg: string | null | undefined) =>
  String(msg || 'Le traitement n’a pas abouti.').replace(/^PDF_SCANNE:\s*/, '');

/** « Commencer l'étude » : démarrage enregistré par le serveur, puis suivi de l'analyse. */
export function StartStudy({ documentId, label = 'Commencer l’étude', initialJobId = null }: { documentId: string; label?: string; initialJobId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [error, setError] = useState<string | null>(null);

  const { phase, progress } = useJob(jobId, {
    onDone: () => { setJobId(null); router.refresh(); },
    onError: (msg) => { setJobId(null); setError(cleanError(msg)); },
  });

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await startEtude(documentId);
    setBusy(false);
    if ('error' in res && res.error) { setError(res.error); return; }
    if ('status' in res && res.status === 'ready') { router.refresh(); return; }
    if ('jobId' in res && res.jobId) setJobId(res.jobId);
  };

  if (jobId) {
    return (
      <div className={styles.panel} role="status" aria-live="polite">
        <p className={styles.working}><span className={styles.spinner} aria-hidden /> {phase || 'Analyse du cours…'}</p>
        <div className={styles.progress} style={{ marginTop: 'var(--s-4)' }}>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${Math.max(5, Math.min(100, progress || 5))}%`, transition: 'width 600ms var(--ease-out)' }} /></div>
          <p className={styles.progressLabel}>Tu peux quitter cette page : l’analyse continue et t’attendra ici.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={start} disabled={busy}>{busy ? 'Démarrage…' : label}</button>
      {error && <p className={styles.alert} role="alert" style={{ width: '100%' }}>{error}</p>}
    </div>
  );
}

/** Ouvre la séquence 1 après la synthèse (le serveur enregistre que la synthèse a été vue). */
export function BeginPath({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.primary}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await markSyntheseVue(documentId);
        if ('error' in res && res.error) { setBusy(false); toast.error(res.error); return; }
        router.push(`/app/etude/${documentId}/sequence/1`);
      }}
    >
      {busy ? 'Ouverture…' : 'Commencer le parcours'}
    </button>
  );
}

/** Séquence pas encore prête : le serveur la prépare (ou rejoint la préparation en cours). */
export function SequencePreparing({ documentId, ordre }: { documentId: string; ordre: number }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const ask = async () => {
    setError(null);
    const res = await prepareSequence(documentId, ordre);
    if ('error' in res && res.error) { setError(res.error); return; }
    if ('ready' in res && res.ready) { router.refresh(); return; }
    if ('jobId' in res && res.jobId) setJobId(res.jobId);
  };

  // Un seul appel au montage (protégé contre le double montage du mode strict).
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { phase } = useJob(jobId, {
    onDone: () => { setJobId(null); router.refresh(); },
    onError: (msg) => { setJobId(null); setError(cleanError(msg)); },
  });

  if (error) {
    return (
      <div className={styles.alert} role="alert">
        <p style={{ margin: '0 0 var(--s-3)' }}>{error}</p>
        <button type="button" className={styles.secondary} onClick={ask}>Réessayer</button>
      </div>
    );
  }
  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <p className={styles.working}><span className={styles.spinner} aria-hidden /> {phase || `Préparation de la séquence ${ordre}…`}</p>
      <p className={styles.panelText} style={{ margin: 'var(--s-3) 0 0' }}>Elle est construite à partir des pages de ton cours qui la concernent. Cela prend en général moins d’une minute, et une seule fois pour tous les étudiants de ce cours.</p>
    </div>
  );
}

export function PrintButton({ label = 'Télécharger en PDF' }: { label?: string }) {
  return (
    <button type="button" className={styles.secondary} onClick={() => window.print()} title="Ouvre l’impression : choisis « Enregistrer en PDF »">
      <Printer size={17} aria-hidden /> {label}
    </button>
  );
}
