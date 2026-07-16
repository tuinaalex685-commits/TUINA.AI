"use client";

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { useJob } from '@/lib/hooks/useJob';
import { startExam } from '@/app/actions/examen';
import ExamenLoadingScreen from './ExamenLoadingScreen';

interface ExamItem {
  documentId: string;
  nom: string;
  bankReady: boolean;
  nbExamens: number;
  derniereNote: number | null;
  meilleureNote: number | null;
  canAdaptive: boolean;
}

export default function ExamenManager({ initialItems }: { initialItems: ExamItem[] }) {
  const router = useRouter();
  // Override optimiste : documents dont la banque vient d'être préparée (bascule instantanée en "Prêt").
  const [readyOverride, setReadyOverride] = useState<Set<string>>(new Set());
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [prepDone, setPrepDone] = useState(false);
  const [failedDoc, setFailedDoc] = useState<string | null>(null);
  const prepDocRef = useRef<string | null>(null);

  // Observation du job de préparation = source de vérité backend (progression/phase RÉELLES).
  const job = useJob(activeJobId, {
    onDone: () => {
      const docId = prepDocRef.current;
      // Bascule INSTANTANÉE : la carte passe "Prêt" immédiatement (sans attendre un refetch).
      if (docId) setReadyOverride((prev) => new Set(prev).add(docId));
      setPrepDone(true);
      // Courte animation de succès, puis on referme et on réconcilie avec le serveur.
      setTimeout(() => {
        setActiveJobId(null);
        setPrepDone(false);
        setBusyDoc(null);
        prepDocRef.current = null;
        router.refresh();
      }, 1100);
    },
    onError: (err) => {
      setActiveJobId(null);
      setPrepDone(false);
      setBusyDoc(null);
      setFailedDoc(prepDocRef.current);
      prepDocRef.current = null;
      toast.error(`La préparation a échoué : ${err}`);
    },
  });

  const genererBanque = async (documentId: string) => {
    if (busyDoc) return;
    setFailedDoc(null);
    setBusyDoc(documentId);
    prepDocRef.current = documentId;
    try {
      const { enqueueAiJob } = await import('@/app/actions/jobs');
      const res = await enqueueAiJob('examen_pool', { documentId });
      if ((res as any).error || !(res as any).jobId) {
        setBusyDoc(null);
        setFailedDoc(documentId);
        prepDocRef.current = null;
        toast.error((res as any).error || 'Impossible de lancer la préparation.');
        return;
      }
      setActiveJobId((res as any).jobId); // → ouvre l'écran premium
    } catch {
      setBusyDoc(null);
      setFailedDoc(documentId);
      prepDocRef.current = null;
      toast.error('Erreur système lors du lancement.');
    }
  };

  const demarrer = async (documentId: string, mode?: 'standard' | 'adaptatif') => {
    if (busyDoc) return;
    setBusyDoc(documentId);
    const id = toast.loading(mode === 'adaptatif' ? 'Composition de votre examen adaptatif…' : 'Composition de votre examen…');
    try {
      const res = await startExam(documentId, mode);
      if ((res as any).error || !(res as any).sessionId) {
        setBusyDoc(null);
        toast.error((res as any).error || 'Impossible de démarrer.', { id });
        return;
      }
      toast.dismiss(id);
      router.push(`/app/examen/${(res as any).sessionId}`);
    } catch {
      setBusyDoc(null);
      toast.error('Erreur système au démarrage.', { id });
    }
  };

  return (
    <div>
      <AnimatePresence>
        {activeJobId && (
          <ExamenLoadingScreen key="prep" progress={job.progress} phase={job.phase} done={prepDone} />
        )}
      </AnimatePresence>

      <header style={{ marginBottom: 'var(--spacing-large)' }}>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '28px' }}>Examen</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-secondary)' }}>
          Passe un examen chronométré sur un cours que tu as étudié. Aucune aide pendant l’épreuve ;
          la note et l’analyse par thème arrivent à la fin.
        </p>
      </header>

      {initialItems.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <span style={{ fontSize: '48px', marginBottom: '16px' }}>🎓</span>
          <h3 style={{ color: 'var(--color-text-main)', fontSize: '20px', margin: 0 }}>Aucun cours prêt pour l’examen</h3>
          <p style={{ marginTop: '8px', marginBottom: '24px' }}>
            Termine d’abord l’Étude Guidée d’un cours : l’examen s’appuie sur ses thèmes.
          </p>
          <Link href="/app/etude"><Button style={{ padding: '12px 24px' }}>Aller à l’Étude Guidée</Button></Link>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--spacing-standard)' }}>
          {initialItems.map((raw) => {
            const it = { ...raw, bankReady: raw.bankReady || readyOverride.has(raw.documentId) };
            const busy = busyDoc === it.documentId;
            const failed = failedDoc === it.documentId;
            return (
              <Card key={it.documentId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ marginBottom: 'var(--spacing-standard)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <span style={{ fontSize: '32px' }}>🎓</span>
                    {it.bankReady
                      ? <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontWeight: 600 }}>Prêt</span>
                      : <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>À préparer</span>}
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--color-text-main)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={it.nom}>
                    {it.nom}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {it.nbExamens > 0
                      ? <>Examens passés : {it.nbExamens} · Dernière note : <strong style={{ color: 'var(--color-text-main)' }}>{it.derniereNote}/20</strong>{it.meilleureNote !== null && <> · Meilleure : {it.meilleureNote}/20</>}</>
                      : 'Aucun examen encore passé.'}
                  </div>
                  {failed && (
                    <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ La préparation a échoué. Réessaie ci-dessous.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {it.bankReady ? (
                    <Button onClick={() => demarrer(it.documentId)} disabled={busy} style={{ width: '100%', padding: '10px' }}>
                      {busy ? 'Démarrage…' : it.nbExamens > 0 ? 'Repasser l’examen' : 'Démarrer l’examen'}
                    </Button>
                  ) : (
                    <Button onClick={() => genererBanque(it.documentId)} disabled={busy} style={{ width: '100%', padding: '10px' }}>
                      {busy ? 'Préparation…' : failed ? 'Réessayer la préparation' : 'Préparer la banque d’examen'}
                    </Button>
                  )}
                  {it.bankReady && it.canAdaptive && (
                    <Button onClick={() => demarrer(it.documentId, 'adaptatif')} disabled={busy} style={{ width: '100%', padding: '10px' }}>
                      🎯 Examen adaptatif (thèmes faibles)
                    </Button>
                  )}
                  {it.nbExamens > 0 && (
                    <Link href={`/app/examen/resultats/${it.documentId}`}>
                      <Button variant="secondary" style={{ width: '100%', padding: '10px' }}>Voir l’analyse par thème</Button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
