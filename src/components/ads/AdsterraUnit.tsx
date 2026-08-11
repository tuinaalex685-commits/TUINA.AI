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
  const [state, setState] = useState<'pending' | 'shown' | 'failed'>('pending');

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

    // L'emplacement reste invisible tant qu'aucune bannière n'est réellement arrivée :
    // afficher le libellé "Publicité" au-dessus d'un rectangle vide donne l'impression
    // d'un site cassé, et c'est le cas courant (bloqueur de pub, régie sans inventaire,
    // domaine non encore validé). Le document injecté contient 2 <script> au départ —
    // au-delà, c'est que la régie a écrit quelque chose.
    //
    // On sonde régulièrement plutôt qu'une seule fois : le délai de réponse d'une régie
    // varie beaucoup selon la connexion, et au Burkina Faso elle est souvent lente.
    let ecoule = 0;
    const sonde = window.setInterval(() => {
      ecoule += 500;
      const body = frame.contentDocument?.body;
      if (body && body.childElementCount > 2) {
        setState('shown');
        window.clearInterval(sonde);
      } else if (ecoule >= 8000) {
        setState('failed');
        window.clearInterval(sonde);
      }
    }, 500);

    return () => window.clearInterval(sonde);
  }, [unit.key, unit.scriptUrl, unit.width, unit.height]);

  if (state === 'failed') return null;

  return (
    <div className={`${styles.slot} ${state === 'pending' ? styles.pending : ''}`} aria-hidden="true">
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
