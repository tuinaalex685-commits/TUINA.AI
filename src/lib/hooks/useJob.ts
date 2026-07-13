"use client";

import { useEffect, useRef, useState } from 'react';

// Cycle de vie canonique du backend. Le frontend n'affiche QUE ces états réels.
export type JobStatus =
  | 'pending' | 'processing' | 'generating' | 'saving' | 'completed' | 'failed'
  // alias hérités tolérés le temps de la transition de vocabulaire :
  | 'queued' | 'done' | 'error';

const RUNNING = new Set<JobStatus>(['pending', 'processing', 'generating', 'saving', 'queued']);
const isDone = (s: string) => s === 'completed' || s === 'done';
const isFailed = (s: string) => s === 'failed' || s === 'error';

interface UseJobOptions {
  onDone?: (result: any) => void;
  onError?: (error: string) => void;
  intervalMs?: number;
}

/**
 * Observe un job IA par POLLING (source de vérité = backend, aucune dépendance à un rendu React fragile).
 * Le frontend n'attend jamais Gemini : il lit l'état réel (status/progress/phase) jusqu'à completed/failed.
 * Passer jobId=null désactive le polling.
 */
export function useJob(jobId: string | null, opts: UseJobOptions = {}) {
  const { onDone, onError, intervalMs = 2500 } = opts;
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const cbRef = useRef({ onDone, onError });
  cbRef.current = { onDone, onError };

  useEffect(() => {
    if (!jobId) { setStatus(null); setProgress(0); setPhase(null); return; }

    let stopped = false;
    let timer: any;
    setStatus('pending');

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('poll failed');
        const job = await res.json();
        if (stopped) return;
        setStatus(job.status);
        if (typeof job.progress === 'number') setProgress(job.progress);
        if (job.phase) setPhase(job.phase);
        if (isDone(job.status)) { stopped = true; setProgress(100); cbRef.current.onDone?.(job.result); return; }
        if (isFailed(job.status)) { stopped = true; cbRef.current.onError?.(job.error || 'Échec de la génération'); return; }
      } catch { /* réseau : on retente au prochain tick (jamais d'échec définitif côté client) */ }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    timer = setTimeout(poll, 600);
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, intervalMs]);

  return { status, progress, phase, isRunning: status ? RUNNING.has(status) : false };
}
