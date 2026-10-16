"use client";

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowRight, BookOpenText } from 'lucide-react';
import { setMyNiveau } from '@/app/actions/profile';
import { NIVEAUX } from '@/lib/profileShared';
import styles from './catalogue.module.css';

type CatalogEntry = { id: string; etude_cours_id: string; titre_affiche: string; matiere: string | null; ordre: number; niveau?: string | null };

const STATUT: Record<string, { label: string; cls: 'tagNew' | 'tagProgress' | 'tagDone' }> = {
  non_commence: { label: 'Nouveau', cls: 'tagNew' },
  en_cours: { label: 'En cours', cls: 'tagProgress' },
  termine: { label: 'Terminé', cls: 'tagDone' },
};

export default function CatalogueList({ entries, progressByCours, niveau }: {
  entries: CatalogEntry[];
  progressByCours: Record<string, string>;
  niveau: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<string | null>(niveau);

  const chooseLevel = (code: string) => {
    if (code === choice) return;
    const previous = choice;
    setChoice(code);
    startTransition(async () => {
      const res = await setMyNiveau(code);
      if ('error' in res && res.error) {
        toast.error(res.error);
        setChoice(previous);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Catalogue de cours</h1>
          <p className={styles.lead}>Des cours déjà préparés par SJP : étude guidée, révisions et examens, sans rien importer.</p>
        </div>

        <div className={styles.levelBox} role="group" aria-label="Ton année d’études">
          <span className={styles.levelLabel}>{choice ? 'Ton année' : 'Tu es en…'}</span>
          <div className={styles.segment}>
            {NIVEAUX.map((n) => (
              <button
                key={n.code}
                type="button"
                className={`${styles.segBtn} ${choice === n.code ? styles.segOn : ''}`}
                onClick={() => chooseLevel(n.code)}
                aria-pressed={choice === n.code}
                disabled={pending}
              >
                {n.court}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!choice && (
        <p className={styles.hint}>Choisis ton année : le catalogue n’affichera que les cours qui te concernent.</p>
      )}

      {entries.length === 0 ? (
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>Pas encore de cours pour ton année</h2>
          <p className={styles.emptyText}>De nouveaux cours arrivent régulièrement. Avec Premium, tu peux aussi travailler tout de suite sur tes propres cours.</p>
          <Link href="/#offres" className={styles.emptyLink}>Voir l’offre Premium <ArrowRight size={16} aria-hidden /></Link>
        </section>
      ) : (
        <ul className={`${styles.grid} ${pending ? styles.dim : ''}`}>
          {entries.map((entry) => {
            const statut = STATUT[progressByCours[entry.etude_cours_id] || 'non_commence'] ?? STATUT.non_commence;
            return (
              <li key={entry.id}>
                <Link href={`/app/etude/catalogue/${entry.id}`} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon}><BookOpenText size={20} aria-hidden /></span>
                    <span className={`${styles.tag} ${styles[statut.cls]}`}>{statut.label}</span>
                  </div>
                  <h2 className={styles.cardTitle}>{entry.titre_affiche}</h2>
                  {entry.matiere && <p className={styles.cardMeta}>{entry.matiere}</p>}
                  <span className={styles.cardCta}>
                    {statut.cls === 'tagNew' ? 'Commencer' : statut.cls === 'tagDone' ? 'Revoir' : 'Continuer'}
                    <ArrowRight size={16} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
