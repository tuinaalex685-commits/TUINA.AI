import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import styles from './PremiumLock.module.css';

/**
 * VERROU PREMIUM — écran de présentation d'une fonctionnalité réservée.
 *
 * Ce composant ne protège rien : la vraie décision est prise côté serveur, dans
 * les server actions et les routes API. Il existe pour que l'étudiant Free
 * comprenne ce qui l'attend au lieu de se heurter à un message d'erreur après
 * avoir rempli un formulaire.
 *
 * Le ton est volontairement une présentation, pas un refus : on décrit la valeur
 * de la fonctionnalité et on propose de la débloquer.
 */
export default function PremiumLock({
  titre,
  description,
  benefices = [],
  compact = false,
}: {
  titre: string;
  description: string;
  benefices?: string[];
  compact?: boolean;
}) {
  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ''}`}>
      <div className={styles.badge}>
        <Lock size={14} strokeWidth={2.5} />
        <span>Premium</span>
      </div>

      <h2 className={styles.titre}>{titre}</h2>
      <p className={styles.description}>{description}</p>

      {benefices.length > 0 && (
        <ul className={styles.benefices}>
          {benefices.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <Link href="/#pricing" className={styles.cta}>
        Passer au Premium — 2 500 FCFA/mois
      </Link>

      <p className={styles.note}>
        En attendant, le <Link href="/app/catalogue" className={styles.lien}>catalogue SJP</Link> reste
        entièrement accessible.
      </p>
    </div>
  );
}
