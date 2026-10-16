"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, RotateCcw } from 'lucide-react';
import styles from './landing.module.css';

/**
 * Choix de l'année, en conversation : l'étudiant choisit L1 ou L2, SJP lui répond message par
 * message, puis l'invite à créer son compte avec l'année déjà renseignée.
 *
 * VIDÉO DE PRÉSENTATION (prévue en fin de projet, motion design Remotion) : renseigner
 * `videoByLevel` avec l'URL de la vidéo de chaque année. Tant qu'elle est absente, rien ne
 * s'affiche à sa place — jamais de cadre vide.
 */
const videoByLevel: Record<'l1' | 'l2', string | null> = {
  l1: null,
  l2: null,
};

const LEVELS = [
  {
    code: 'l1' as const,
    court: 'L1',
    titre: 'Licence 1',
    accroche: 'Les bases du droit',
    messages: [
      'Bienvenue en L1 ! C’est l’année où tout se met en place.',
      'Introduction au droit, institutions, histoire du droit : on découpe chaque cours en notions simples, avec le vocabulaire juridique exact.',
      'Tu révises quelques minutes par jour, et tu t’entraînes en conditions d’examen avant les partiels.',
    ],
  },
  {
    code: 'l2' as const,
    court: 'L2',
    titre: 'Licence 2',
    accroche: 'Approfondir et appliquer',
    messages: [
      'Bienvenue en L2 ! Les matières deviennent plus techniques.',
      'Obligations, droit administratif : SJP t’aide à distinguer les notions voisines, là où les examens piègent.',
      'Cas pratiques corrigés, examens chronométrés : tu sais précisément ce qu’il te reste à revoir.',
    ],
  },
];

export function LevelChooser() {
  const reduce = useReducedMotion();
  const [chosen, setChosen] = useState<'l1' | 'l2' | null>(null);
  const [shown, setShown] = useState(0); // nombre de messages affichés
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const level = LEVELS.find((l) => l.code === chosen) ?? null;

  // Les messages arrivent un par un, avec l'indicateur « en train d'écrire » entre deux.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!level) return;
    level.messages.forEach((_, i) => {
      timers.current.push(setTimeout(() => setShown(i + 1), reduce ? 0 : 650 + i * 1100));
    });
    return () => timers.current.forEach(clearTimeout);
  }, [level, reduce]);

  const choose = (code: 'l1' | 'l2') => {
    setShown(0);
    setChosen(code);
  };

  const typing = level && shown < level.messages.length;
  const video = chosen ? videoByLevel[chosen] : null;

  return (
    <section className={`${styles.section} ${styles.levelSection}`} id="annee">
      <div className={styles.levelOrb} aria-hidden />
      <div className={styles.container}>
        <div className={styles.levelHead}>
          <h2 className={`${styles.h2} ${styles.onNight}`}>Ton parcours commence par ton année</h2>
          <p className={`${styles.sectionLead} ${styles.onNightMuted}`}>Choisis ta licence : SJP adapte le catalogue gratuit à tes cours.</p>
        </div>

        <div className={styles.levelStage}>
          <div className={styles.levelCards}>
            {LEVELS.map((l, i) => (
              <motion.button
                key={l.code}
                type="button"
                className={`${styles.levelCard} ${chosen === l.code ? styles.levelCardOn : ''} ${chosen && chosen !== l.code ? styles.levelCardOff : ''}`}
                onClick={() => choose(l.code)}
                aria-pressed={chosen === l.code}
                animate={reduce || chosen ? { y: 0 } : { y: [0, -10, 0] }}
                transition={reduce || chosen ? { duration: 0.3 } : { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.9 }}
                whileHover={reduce ? undefined : { scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className={styles.levelCardBig}>{l.court}</span>
                <span className={styles.levelCardName}>{l.titre}</span>
                <span className={styles.levelCardHook}>{l.accroche}</span>
              </motion.button>
            ))}
          </div>

          <div className={styles.chat} aria-live="polite">
            {!level ? (
              <div className={styles.chatIdle}>
                <span className={styles.chatAvatar}>SJP</span>
                <p className={styles.bubble}>Salut ! Tu es en quelle année ? Touche une carte pour commencer.</p>
              </div>
            ) : (
              <>
                <motion.div className={styles.bubbleMe} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  Je suis en {level.court}
                </motion.div>
                <AnimatePresence>
                  {level.messages.slice(0, shown).map((m) => (
                    <motion.div
                      key={m}
                      className={styles.chatRow}
                      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      <span className={styles.chatAvatar}>SJP</span>
                      <p className={styles.bubble}>{m}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {typing && (
                  <div className={styles.chatRow} aria-hidden>
                    <span className={styles.chatAvatar}>SJP</span>
                    <span className={styles.typing}><i /><i /><i /></span>
                  </div>
                )}
                {!typing && (
                  <motion.div className={styles.chatEnd} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    {video && (
                      <video className={styles.chatVideo} src={video} controls playsInline preload="metadata" aria-label={`Présentation de SJP pour la ${level.titre}`} />
                    )}
                    <Link href={`/inscription?niveau=${level.code}`} className={styles.ctaLight}>
                      Créer mon compte en {level.court} <ArrowRight size={18} aria-hidden />
                    </Link>
                    <button type="button" className={styles.chatReset} onClick={() => { setChosen(null); setShown(0); }}>
                      <RotateCcw size={14} aria-hidden /> Changer d’année
                    </button>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
