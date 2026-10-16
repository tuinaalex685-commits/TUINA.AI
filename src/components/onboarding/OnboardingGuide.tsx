"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import styles from './onboarding.module.css';

interface Step { title: string; text: string }

/** Le parcours de travail sur SJP, dans l'ordre où l'étudiant le vit : c'est une vraie séquence. */
function stepsFor(premium: boolean): Step[] {
  return [
    premium
      ? { title: 'Importe ton cours', text: 'Dépose ton cours en PDF dans « Mes documents ». Tout le reste se construit à partir de ton propre support.' }
      : { title: 'Choisis un cours', text: 'Le catalogue propose des cours prêts à travailler. Ouvre celui de ta matière.' },
    { title: 'Comprends avec l’étude guidée', text: 'Le cours est découpé en notions. Chacune est expliquée simplement, puis tu réponds à une question et à un cas pratique.' },
    { title: 'Retiens avec les révisions', text: 'Des cartes de révision reviennent au bon moment, juste avant que tu oublies. Quelques minutes par jour suffisent.' },
    { title: 'Vérifie-toi avec un examen', text: 'Un examen chronométré, sans aide. Ta note et la correction te montrent précisément quelles notions retravailler.' },
    premium
      ? { title: 'Entraîne-toi à rédiger', text: 'Cas pratiques, dissertations, commentaires d’arrêt : rédige, reçois une correction détaillée, améliore ta copie.' }
      : { title: 'Suis ta progression', text: 'Tu vois, notion par notion, ce que tu maîtrises et ce qu’il te reste à revoir.' },
  ];
}

export default function OnboardingGuide({ open, onClose, premium = false }: { open: boolean; onClose: () => void; premium?: boolean }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const steps = stepsFor(premium);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  const close = (start = false) => {
    setI(0);
    onClose();
    if (start) router.push(premium ? '/app/bibliotheque' : '/app/catalogue');
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.layer}>
      <div className={styles.scrim} onClick={() => close(false)} aria-hidden />
      <div ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div className={styles.top}>
          <p className={styles.kicker}>Comment fonctionne SJP</p>
          <button type="button" className={styles.close} onClick={() => close(false)} aria-label="Fermer le guide">
            <X size={20} />
          </button>
        </div>

        <ol className={styles.track} aria-label="Étapes">
          {steps.map((s, idx) => (
            <li key={s.title} className={idx === i ? styles.current : idx < i ? styles.done : ''}>
              <button type="button" onClick={() => setI(idx)} aria-label={`Étape ${idx + 1} : ${s.title}`} aria-current={idx === i ? 'step' : undefined} />
            </li>
          ))}
        </ol>

        <div className={styles.body} key={i}>
          <p className={styles.stepNumber}>{i + 1}<span>/{steps.length}</span></p>
          <h2 id="guide-title" className={styles.title}>{step.title}</h2>
          <p className={styles.text}>{step.text}</p>
        </div>

        <div className={styles.actions}>
          {i > 0 ? (
            <button type="button" className={styles.secondary} onClick={() => setI((n) => n - 1)}>Précédent</button>
          ) : (
            <button type="button" className={styles.secondary} onClick={() => close(false)}>Passer</button>
          )}
          <button type="button" className={styles.primary} onClick={() => (isLast ? close(true) : setI((n) => n + 1))}>
            {isLast ? (premium ? 'Importer mon premier cours' : 'Ouvrir le catalogue') : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
