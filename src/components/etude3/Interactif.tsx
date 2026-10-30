"use client";

import { useState } from 'react';
import { Rich } from './Rich';
import styles from './etude3.module.css';

/**
 * Petites interactions PENDANT la lecture (sans IA, sans enregistrement, sans effet sur la
 * validation) : l'étudiant réfléchit avant de lire la réponse, ou se teste en un geste.
 */

/** « Et toi, qu'en penses-tu ? » : la réponse n'apparaît qu'après réflexion. */
export function Revele({ question, reponse }: { question: string; reponse: string }) {
  const [vu, setVu] = useState(false);
  return (
    <div className={styles.revele}>
      <p className={styles.reveleQ}><span className={styles.reveleLabel}>Et toi, qu’en penses-tu ?</span><Rich text={question} /></p>
      {vu ? (
        <p className={styles.reveleR}><Rich text={reponse} /></p>
      ) : (
        <button type="button" className={styles.secondary} onClick={() => setVu(true)}>J’ai réfléchi, voir la réponse</button>
      )}
    </div>
  );
}

/** « Vrai ou faux ? » en un geste, avec l'explication immédiate. */
export function VraiFaux({ affirmation, vrai, explication }: { affirmation: string; vrai: boolean; explication: string }) {
  const [choix, setChoix] = useState<boolean | null>(null);
  const juste = choix !== null && choix === vrai;
  return (
    <div className={styles.vraifaux}>
      <p className={styles.reveleQ}><span className={styles.reveleLabel}>Vrai ou faux ?</span><Rich text={affirmation} /></p>
      <div className={styles.actions}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" disabled={choix !== null}
            className={`${styles.secondary} ${choix !== null && v === vrai ? styles.vfBon : ''} ${choix === v && v !== vrai ? styles.vfFaux : ''}`}
            onClick={() => setChoix(v)} aria-pressed={choix === v}>
            {v ? 'Vrai' : 'Faux'}
          </button>
        ))}
      </div>
      {choix !== null && (
        <p className={juste ? styles.vfOk : styles.vfKo} role="status">
          <strong>{juste ? 'Bien vu. ' : `Non : c’est ${vrai ? 'vrai' : 'faux'}. `}</strong><Rich text={explication} />
        </p>
      )}
    </div>
  );
}
