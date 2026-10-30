"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ArrowDown, Check } from 'lucide-react';
import styles from './etude3.module.css';

/**
 * Une leçon, étape par étape : la situation d'abord, puis une étape à la fois (« Continuer »),
 * et les vérifications seulement après tout le contenu. Ce n'est pas un mur de texte : chaque
 * étape a un objectif, l'étudiant sait toujours où il en est et ce qui vient.
 * Le contenu des étapes est rendu par le serveur (passé en ReactNode) ; ce composant ne gère que
 * l'ordre de découverte. La position est retenue sur l'appareil (simple confort) ; les réponses,
 * elles, sont enregistrées par le serveur.
 */

export interface EtapeVue {
  cle: string;
  titre: string;
  sousTitre: string;
  contenu: React.ReactNode;
}

export default function LeconGuidee({ cleStockage, accroche, etapes, verification, toutOuvert }: {
  cleStockage: string;
  accroche: { situation: React.ReactNode; question: React.ReactNode } | null;
  etapes: EtapeVue[];
  verification: React.ReactNode;
  toutOuvert: boolean;     // l'étudiant a déjà répondu : toute la leçon est dépliée
}) {
  const total = etapes.length;
  const [vus, setVus] = useState(toutOuvert ? total : 0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const premierRendu = useRef(true);

  // Reprise : on retrouve l'étape atteinte sur cet appareil.
  useEffect(() => {
    if (toutOuvert) return;
    // Lu après le premier rendu (le serveur ne connaît pas ce stockage : pas d'écart d'hydratation).
    const id = requestAnimationFrame(() => {
      try {
        const n = Number(window.localStorage.getItem(cleStockage));
        if (Number.isInteger(n) && n > 0) setVus(Math.min(total, n));
      } catch { /* stockage indisponible : on repart du début de la leçon */ }
    });
    return () => cancelAnimationFrame(id);
  }, [cleStockage, total, toutOuvert]);

  useEffect(() => {
    // Premier passage : on n'écrit rien (la position enregistrée n'a pas encore été relue).
    if (premierRendu.current) { premierRendu.current = false; return; }
    try { window.localStorage.setItem(cleStockage, String(vus)); } catch { /* ignoré */ }
    const cible = refs.current[vus - 1];
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [vus, cleStockage]);

  const fini = vus >= total;
  const suivante = etapes[vus];

  return (
    <MotionConfig reducedMotion="user">
      <nav className={styles.stepper} aria-label="Étapes de la leçon">
        <ol>
          {etapes.map((e, i) => {
            const etat = i < vus ? styles.stepperDone : i === vus ? styles.stepperNow : '';
            return (
              <li key={e.cle} className={etat}>
                <button type="button" disabled={i > vus} onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <span className={styles.stepperDot} aria-hidden>{i < vus ? <Check size={12} /> : i + 1}</span>
                  <span className={styles.stepperLabel}>{e.titre}</span>
                </button>
              </li>
            );
          })}
          <li className={fini ? styles.stepperNow : ''}>
            <button type="button" disabled={!fini} onClick={() => document.getElementById('verifier')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <span className={styles.stepperDot} aria-hidden>{total + 1}</span>
              <span className={styles.stepperLabel}>Vérifier</span>
            </button>
          </li>
        </ol>
      </nav>

      {accroche && (
        <section className={styles.hook} aria-label="Pour commencer">
          <p className={styles.hookLabel}>Pour commencer, imagine…</p>
          <div className={styles.hookText}>{accroche.situation}</div>
          {accroche.question && <p className={styles.hookQuestion}>{accroche.question}</p>}
        </section>
      )}

      <div className={styles.lessonSteps}>
        <AnimatePresence initial={false}>
          {etapes.slice(0, vus).map((e, i) => (
            <motion.section
              key={e.cle}
              ref={(el: HTMLElement | null) => { refs.current[i] = el; }}
              className={styles.lessonStep}
              aria-labelledby={`etape-${e.cle}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className={styles.lessonStepHead}>
                <span className={styles.lessonStepNum} aria-hidden>{i + 1}</span>
                <div>
                  <h2 id={`etape-${e.cle}`} className={styles.lessonStepTitle}>{e.titre}</h2>
                  <p className={styles.lessonStepSub}>{e.sousTitre}</p>
                </div>
              </header>
              <div className={styles.lessonStepBody}>{e.contenu}</div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      {!fini && suivante && (
        <div className={styles.continueBox}>
          <button type="button" className={styles.primary} onClick={() => setVus((v) => Math.min(total, v + 1))}>
            {vus === 0 ? 'Découvrir l’idée' : 'Continuer'} <ArrowDown size={17} aria-hidden />
          </button>
          <p className={styles.progressLabel}>Étape suivante : {suivante.titre.toLowerCase()}</p>
        </div>
      )}

      {fini && (
        <motion.div id="verifier" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {verification}
        </motion.div>
      )}
    </MotionConfig>
  );
}
