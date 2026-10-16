"use client";

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import styles from './landing.module.css';

/**
 * Démonstration animée du produit, en boucle : ce que fait SJP avec un cours, en 4 temps.
 * Contenu réel : article 1101 du Code civil (rédaction de 1804, appliquée en Afrique de l'Ouest
 * francophone). Respecte « réduire les animations » : l'étape finale s'affiche fixe.
 */

const STEPS = ['Lire', 'Comprendre', 'S’entraîner', 'Retenir'] as const;
const STEP_MS = 3400;

const OPTIONS = [
  'Un accord de volontés qui crée des obligations',
  'Un écrit signé devant notaire',
  'Une promesse faite à soi-même',
];

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? 3 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className={styles.demo} aria-label="Démonstration : SJP transforme un article de cours en question, puis en notion maîtrisée">
      <div className={styles.demoChrome}>
        <span className={styles.demoDot} />
        <span className={styles.demoDot} />
        <span className={styles.demoDot} />
        <span className={styles.demoTitle}>Droit des obligations · Notion 3</span>
      </div>

      <div className={styles.demoBody}>
        <AnimatePresence mode="wait">
          {step <= 1 ? (
            <motion.div
              key="texte"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className={styles.demoSource}>Code civil, article 1101</p>
              <p className={styles.demoText}>
                Le contrat est une{' '}
                <span className={`${styles.hl} ${step >= 1 ? styles.hlOn : ''}`}>convention</span>{' '}
                par laquelle une ou plusieurs personnes{' '}
                <span className={`${styles.hl} ${step >= 1 ? styles.hlOn : ''}`} style={{ transitionDelay: '0.35s' }}>s’obligent</span>,
                envers une ou plusieurs autres, à donner, à faire ou à ne pas faire quelque chose.
              </p>
              <motion.p
                className={styles.demoNote}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: step >= 1 ? 1 : 0, x: step >= 1 ? 0 : -8 }}
                transition={{ duration: 0.5, delay: step >= 1 ? 0.8 : 0 }}
              >
                <span className={styles.demoNoteLine} /> En clair : un accord qui crée des obligations.
              </motion.p>
            </motion.div>
          ) : step === 2 ? (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className={styles.demoSource}>À toi de jouer</p>
              <p className={styles.demoQuestion}>En droit, qu’est-ce qu’un contrat avant tout ?</p>
              <ul className={styles.demoOptions}>
                {OPTIONS.map((o, i) => (
                  <motion.li
                    key={o}
                    className={styles.demoOption}
                    initial={false}
                    animate={i === 0 ? { backgroundColor: ['#FFFFFF', '#FFFFFF', '#E5F4EC'], borderColor: ['#E3E8F0', '#E3E8F0', '#127A4B'] } : {}}
                    transition={{ duration: 1.6, times: [0, 0.6, 1] }}
                  >
                    <span>{o}</span>
                    {i === 0 && (
                      <motion.span className={styles.demoCheck} initial={{ scale: 0 }} animate={{ scale: [0, 0, 1] }} transition={{ duration: 1.7, times: [0, 0.7, 1] }}>
                        <Check size={14} strokeWidth={3} />
                      </motion.span>
                    )}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ) : (
            <motion.div
              key="maitrise"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className={styles.demoSource}>Ta progression</p>
              {[
                { n: 'La notion de contrat', v: 100 },
                { n: 'Les conditions de validité', v: 72 },
                { n: 'Les vices du consentement', v: 38 },
              ].map((row, i) => (
                <div key={row.n} className={styles.demoBarRow}>
                  <div className={styles.demoBarTop}>
                    <span>{row.n}</span>
                    <span className="tabular">{row.v} %</span>
                  </div>
                  <div className={styles.demoBar}>
                    <motion.span
                      initial={{ width: reduce ? `${row.v}%` : '0%' }}
                      animate={{ width: `${row.v}%` }}
                      transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                      className={row.v === 100 ? styles.demoBarDone : ''}
                    />
                  </div>
                </div>
              ))}
              <p className={styles.demoToast}><Check size={14} strokeWidth={3} /> Ajoutée à tes révisions de jeudi</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ol className={styles.demoSteps}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? styles.demoStepOn : i < step ? styles.demoStepDone : ''}>
            <button type="button" onClick={() => setStep(i)} aria-label={`Montrer l’étape ${s}`} aria-current={i === step ? 'step' : undefined}>
              {s}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
