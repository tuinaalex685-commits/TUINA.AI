"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { AdUnitConfig } from '@/lib/ads/config';
import styles from './AdSlot.module.css';

/**
 * Unité publicitaire Adsterra (format bannière).
 *
 * Ce composant n'est JAMAIS rendu pour un membre Premium : c'est <AdSlot />, côté
 * serveur, qui décide de son existence. Il n'y a donc aucun script à masquer —
 * pour un Premium, ce code n'arrive tout simplement pas dans la page.
 *
 * Le format bannière d'Adsterra fonctionne en deux temps : une variable globale
 * `atOptions` décrivant l'unité, puis le script d'invocation qui la lit. C'est
 * précisément ce qui le rend fragile en Next.js — `atOptions` est globale, donc
 * deux unités montées en même temps s'écrasent l'une l'autre. On isole chaque
 * unité dans son propre <iframe>, ce qui donne à chacune son contexte global :
 * plus de collision entre emplacements, et rien qui survive à une navigation.
 */
export default function AdsterraUnit({ unit }: { unit: AdUnitConfig }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;

    // Chaque montage écrit dans un document neuf : pas de double injection
    // possible, et une navigation client démonte l'iframe avec tout son contenu.
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>` +
      `</head><body>` +
      `<script type="text/javascript">` +
      `atOptions = ${JSON.stringify({
        key: unit.key,
        format: 'iframe',
        height: unit.height,
        width: unit.width,
        params: {},
      })};` +
      `<\/script>` +
      `<script type="text/javascript" src="${unit.scriptUrl}"><\/script>` +
      `</body></html>`
    );
    doc.close();

    // Si la régie ne répond pas (bloqueur de pub, réseau, domaine non validé),
    // on retire l'emplacement au lieu de laisser un rectangle vide dans la page.
    const timer = window.setTimeout(() => {
      const body = frame.contentDocument?.body;
      if (!body || body.childElementCount <= 2) setFailed(true);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [unit.key, unit.scriptUrl, unit.width, unit.height]);

  if (failed) return null;

  return (
    <div className={styles.slot} aria-hidden="true">
      <span className={styles.label}>Publicité</span>
      <iframe
        ref={frameRef}
        title="Publicité"
        className={styles.frame}
        style={{ width: unit.width, height: unit.height, maxWidth: '100%' }}
        scrolling="no"
        frameBorder={0}
      />
    </div>
  );
}
