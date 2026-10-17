import React from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import styles from '@/components/etude3/etude3.module.css';

const STATUT: Record<string, { label: string; cls: string; action: string }> = {
  non_commence: { label: 'Pas encore commencée', cls: '', action: 'Commencer l’étude' },
  en_cours: { label: 'En cours', cls: styles.badgeOn, action: 'Continuer' },
  termine: { label: 'Terminée', cls: styles.badgeDone, action: 'Revoir' },
};

/** Liste des cours de l'étudiant, avec l'état réel de chaque étude (enregistré par le serveur). */
export default function EtudeList({ documents, progressByPdf }: {
  documents: { id: string; nom: string; date_import: string | null }[];
  progressByPdf: Record<string, { statut: string }>;
}) {
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Études guidées</h1>
        <p className={styles.subtitle}>Choisis un cours : SJP le lit en entier, te remet une synthèse, puis t’accompagne séquence par séquence.</p>
      </header>

      {documents.length === 0 ? (
        <div className={styles.panel} style={{ maxWidth: 560 }}>
          <p className={styles.panelTitle}>Aucun cours pour l’instant</p>
          <p className={styles.panelText}>Importe le PDF d’un cours : tu pourras ensuite en lancer l’étude guidée.</p>
          <Link href="/app/bibliotheque" className={styles.primary}>Importer un cours</Link>
        </div>
      ) : (
        <ul className={styles.courseList}>
          {documents.map((doc) => {
            const s = STATUT[progressByPdf[doc.id]?.statut ?? 'non_commence'] ?? STATUT.non_commence;
            return (
              <li key={doc.id} className={styles.course}>
                <div className={styles.courseMain}>
                  <p className={styles.courseTitle}>{doc.nom.replace(/\.pdf$/i, '')}</p>
                  <p className={styles.courseMeta}>
                    <span className={`${styles.badge} ${s.cls}`}>{s.label}</span>
                    {doc.date_import && <span>Importé le {formatDate(doc.date_import)}</span>}
                  </p>
                </div>
                <Link href={`/app/etude/${doc.id}`} className={styles.secondary}>{s.action}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
