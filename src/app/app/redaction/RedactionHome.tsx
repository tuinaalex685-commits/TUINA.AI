"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { formatDate } from '@/lib/format';
import { COMPARTIMENT_BY_SLUG, COMPARTIMENT_BY_TYPE, type CompartimentSlug } from '@/lib/redaction/compartiments';
import NewCopyFlow from './NewCopyFlow';
import styles from './redaction.module.css';

export interface CopyItem {
  id: string;
  type: string;
  sujet: string;
  statut: string;
  date: string;
  note: number | null;
  versions: number;
}

export interface CourseOption {
  id: string;
  label: string;
  groupe: 'Mes cours' | 'Catalogue SJP';
}

export function StatusBadge({ statut, note }: { statut: string; note: number | null }) {
  if (statut === 'en_cours') return <span className={`${styles.status} ${styles.statusRunning}`}>En correction</span>;
  if (statut === 'erreur') return <span className={`${styles.status} ${styles.statusError}`}>Correction à relancer</span>;
  if (statut === 'analyse') {
    return <span className={`${styles.status} ${styles.statusDone}`}>Corrigée{note !== null ? ` · ${String(note).replace('.', ',')}/20` : ''}</span>;
  }
  return <span className={`${styles.status} ${styles.statusDraft}`}>Brouillon</span>;
}

export default function RedactionHome({ active, copies, courses, compartiments }: {
  active: CompartimentSlug;
  copies: CopyItem[];
  courses: CourseOption[];
  compartiments: CompartimentSlug[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [current, setCurrent] = useState<CompartimentSlug>(active);
  const [creating, setCreating] = useState(false);

  const comp = COMPARTIMENT_BY_SLUG.get(current)!;
  const list = copies.filter((c) => COMPARTIMENT_BY_TYPE.get(c.type)?.slug === current);
  const countFor = (slug: CompartimentSlug) => copies.filter((c) => COMPARTIMENT_BY_TYPE.get(c.type)?.slug === slug).length;

  const select = (slug: CompartimentSlug) => {
    setCurrent(slug);
    // L'onglet reste dans l'URL (retour arrière, lien partagé) sans recharger la page.
    router.replace(`${pathname}?type=${slug}`, { scroll: false });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>Rédaction</h1>
            <p className={styles.lead}>
              Choisis un exercice, rédige ta copie avec la méthode sous les yeux, puis reçois une correction détaillée
              que tu peux retravailler.
            </p>
          </div>
        </header>

        <nav className={styles.compartments} aria-label="Type d’exercice">
          {compartiments.map((slug) => {
            const c = COMPARTIMENT_BY_SLUG.get(slug)!;
            const on = slug === current;
            return (
              <button
                key={slug}
                type="button"
                className={`${styles.compartment} ${on ? styles.compartmentOn : ''}`}
                aria-pressed={on}
                onClick={() => select(slug)}
              >
                {on && <motion.span layoutId="compartment-pill" className={styles.compartmentPill} transition={{ type: 'spring', stiffness: 480, damping: 38 }} aria-hidden />}
                <span className={styles.compartmentTop}>
                  <span className={styles.compartmentName}>{c.label}</span>
                  <span className={styles.compartmentCount}>{countFor(slug)}</span>
                </span>
                <span className={styles.compartmentDesc}>{c.description}</span>
              </button>
            );
          })}
        </nav>

        <section aria-labelledby="mes-copies">
          <div className={styles.listHead}>
            <h2 id="mes-copies" className={styles.listTitle}>Mes copies · {comp.label.toLowerCase()}</h2>
            {list.length > 0 && (
              <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                <Plus size={18} aria-hidden /> Nouveau
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <div className={styles.empty} style={{ marginTop: 'var(--s-4)' }}>
              <h3 className={styles.emptyTitle}>Commence {comp.singulier}</h3>
              <p className={styles.emptyText}>
                {comp.sujetsDepuisCours
                  ? 'Pars d’un de tes cours pour recevoir trois sujets adaptés, ou saisis le sujet donné par ton enseignant.'
                  : 'Colle le texte de la décision donnée en TD : tu rédiges ton commentaire, SJP le corrige.'}
              </p>
              <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                <Plus size={18} aria-hidden /> Commencer {comp.singulier}
              </button>
            </div>
          ) : (
            <motion.ul key={current} className={styles.copies} style={{ marginTop: 'var(--s-4)' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              {list.map((c) => (
                <li key={c.id} className={styles.copy}>
                  <Link href={`/app/redaction/${c.id}`} className={styles.copyLink} aria-label={`Ouvrir la copie : ${c.sujet}`} />
                  <p className={styles.copySubject}>{c.sujet}</p>
                  <div className={styles.copyMeta}>
                    <StatusBadge statut={c.statut} note={c.note} />
                    <span>{c.versions > 0 ? `${c.versions} version${c.versions > 1 ? 's' : ''} corrigée${c.versions > 1 ? 's' : ''}` : 'Pas encore corrigée'}</span>
                    {c.date && <span>Modifiée le {formatDate(c.date)}</span>}
                  </div>
                </li>
              ))}
            </motion.ul>
          )}
        </section>
      </div>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title={`Nouveau : ${comp.singulier}`}>
        <NewCopyFlow key={current} slug={current} courses={courses} />
      </Modal>
    </MotionConfig>
  );
}
