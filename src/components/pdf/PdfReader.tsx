"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Minus, Plus } from 'lucide-react';
import styles from './PdfReader.module.css';

/**
 * Lecteur de PDF intégré (pdf.js, version « legacy » compatible avec les anciens Chrome Android).
 *
 * Pourquoi pas une <iframe> : Chrome sur Android n'affiche pas les PDF dans une iframe, il les
 * télécharge. Ici les pages sont dessinées dans l'application, et seulement quand elles
 * approchent de l'écran : un cours de 200 pages s'ouvre aussi vite qu'un cours de 5 pages.
 * La bibliothèque et son worker ne sont chargés qu'à l'ouverture d'un document.
 */

const WORKER_SRC = '/pdfjs/pdf.worker-4.10.38.min.mjs';
const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy: () => Promise<void> };

interface Props {
  url: string;
  title: string;
  onClose: () => void;
}

export function PdfReader({ url, title, onClose }: Props) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [ratio, setRatio] = useState(1.414); // hauteur / largeur de la première page
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [width, setWidth] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Chargement du document.
  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        loaded = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
        if (cancelled || !loaded) return;
        // Proportions de la première page : place réservée pour toutes les pages avant leur dessin
        // (pas de saut d'écran) ; chaque page corrige sa propre hauteur quand elle est dessinée.
        const first = await loaded.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (!cancelled) {
          setRatio(v.height / v.width);
          setDoc(loaded);
        }
      } catch (e) {
        console.error('[PdfReader] ouverture impossible', e);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy().catch(() => {});
    };
  }, [url]);

  // Largeur disponible (suit la rotation du téléphone).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 24, 880)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Échap ferme le lecteur ; le défilement de la page derrière est bloqué.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const zoom = ZOOMS[zoomIdx];
  const pageWidth = Math.max(240, Math.round(width * zoom));

  const onVisible = useCallback((n: number) => setCurrent(n), []);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Lecture : ${title}`}>
      <header className={styles.bar}>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fermer le document">
          <ArrowLeft size={22} />
        </button>
        <div className={styles.titleBox}>
          <p className={styles.title} title={title}>{title}</p>
          {doc && <p className={`${styles.pageCount} tabular`}>Page {current} sur {doc.numPages}</p>}
        </div>
        <div className={styles.tools}>
          <button type="button" className={styles.iconBtn} onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0} aria-label="Réduire">
            <Minus size={20} />
          </button>
          <span className={`${styles.zoom} tabular`} aria-live="polite">{Math.round(zoom * 100)} %</span>
          <button type="button" className={styles.iconBtn} onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Agrandir">
            <Plus size={20} />
          </button>
          <a className={styles.iconBtn} href={url} download target="_blank" rel="noopener noreferrer" aria-label="Télécharger le PDF">
            <Download size={20} />
          </a>
        </div>
      </header>

      <div ref={scrollerRef} className={styles.scroller}>
        {error ? (
          <div className={styles.state}>
            <p>Ce document ne peut pas être affiché ici.</p>
            <a className={styles.stateLink} href={url} download target="_blank" rel="noopener noreferrer">Télécharger le PDF</a>
          </div>
        ) : !doc || width === 0 ? (
          <div className={styles.state}><span className={styles.spinner} aria-hidden /> Ouverture du document…</div>
        ) : (
          <div className={styles.pages}>
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                pageNumber={i + 1}
                width={pageWidth}
                ratio={ratio}
                onVisible={onVisible}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({ doc, pageNumber, width, ratio, onVisible }: {
  doc: PdfDoc; pageNumber: number; width: number; ratio: number; onVisible: (n: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [ownRatio, setOwnRatio] = useState<number | null>(null);

  // Dessiné seulement quand la page approche de l'écran ; signale la page en cours de lecture.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setNear(true);
        if (e.intersectionRatio > 0.5) onVisible(pageNumber);
      }
    }, { rootMargin: '600px 0px', threshold: [0, 0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!near) return;
    let task: any = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      setOwnRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // net sans épuiser un téléphone modeste
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [near, doc, pageNumber, width]);

  return (
    <div ref={wrapRef} className={styles.page} style={{ width, height: Math.round(width * (ownRatio ?? ratio)) }}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`Page ${pageNumber}`} />
    </div>
  );
}
