"use client";

import { useEffect, useRef, useState } from 'react';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

interface UseJobOptions {
  onDone?: (result: any) => void;
  onError?: (error: string) => void;
  intervalMs?: number;
}

/**
 * Observe un job IA par POLLING (primaire, sans dépendance Realtime).
 * Le frontend n'attend jamais Gemini : il interroge l'état du job jusqu'à done/error.
 * Passer jobId=null désactive le polling.
 */
export function useJob(jobId: string | null, opts: UseJobOptions = {}) {
  const { onDone, onError, intervalMs = 2500 } = opts;
  const [status, setStatus] = useState<JobStatus | null>(null);
  const cbRef = useRef({ onDone, onError });
  cbRef.current = { onDone, onError };

  useEffect(() => {
    if (!jobId) { setStatus(null); return; }

    let stopped = false;
    let timer: any;
    setStatus('queued');

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('poll failed');
        const job = await res.json();
        if (stopped) return;
        setStatus(job.status);
        if (job.status === 'done') { stopped = true; cbRef.current.onDone?.(job.result); return; }
        if (job.status === 'error') { stopped = true; cbRef.current.onError?.(job.error || 'Échec de la génération'); return; }
      } catch { /* réseau : on retente au prochain tick */ }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    // Premier poll rapide, puis à intervalle régulier.
    timer = setTimeout(poll, 600);
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, intervalMs]);

  return { status, isRunning: status === 'queued' || status === 'processing' };
}
