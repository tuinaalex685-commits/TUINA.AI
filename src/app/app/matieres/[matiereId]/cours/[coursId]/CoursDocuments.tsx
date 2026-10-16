"use client";

import React, { useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { BookOpenText, ChevronRight, Eye, FolderInput, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { PdfReader } from '@/components/pdf/PdfReader';
import { assignDocumentToCours, deleteDocument } from '@/app/actions/documents';
import { formatDate } from '@/lib/format';
import { RowMenu } from '../../../RowMenu';
import styles from '../../../matieres.module.css';

interface Doc {
  id: string;
  nom: string;
  taille: number | null;
  url_fichier: string | null;
  date_import: string | null;
}

type Action = { type: 'remove'; id: string } | { type: 'file'; doc: Doc };

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

/** « Séquence 3, les effets du mariage.pdf » → « Séquence 3, les effets du mariage ». */
const displayName = (nom: string) => nom.replace(/\.pdf$/i, '');

const ENTER = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: -16 } };

export default function CoursDocuments({ matiere, cours, documents, looseDocuments }: {
  matiere: { id: string; titre: string };
  cours: { id: string; titre: string };
  documents: Doc[];
  looseDocuments: Doc[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reading, setReading] = useState<Doc | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);

  // Mises à jour optimistes : l'écran réagit tout de suite, le serveur confirme ensuite.
  const [docs, applyDocs] = useOptimistic(documents, (state, a: Action) =>
    a.type === 'remove' ? state.filter((d) => d.id !== a.id) : [a.doc, ...state]);
  const [loose, applyLoose] = useOptimistic(looseDocuments, (state, a: Action) =>
    a.type === 'remove' || a.type === 'file' ? state.filter((d) => d.id !== (a.type === 'remove' ? a.id : a.doc.id)) : state);

  const handleDelete = (doc: Doc) => {
    startTransition(async () => {
      applyDocs({ type: 'remove', id: doc.id });
      applyLoose({ type: 'remove', id: doc.id });
      const res = await deleteDocument(doc.id);
      if (res.error) toast.error('Suppression impossible. Réessaie dans un instant.');
      else toast.success(`« ${displayName(doc.nom)} » supprimé`);
      router.refresh();
    });
  };

  const handleFile = (doc: Doc) => {
    setFiling(doc.id);
    startTransition(async () => {
      applyLoose({ type: 'file', doc });
      applyDocs({ type: 'file', doc });
      const res = await assignDocumentToCours(doc.id, cours.id);
      setFiling(null);
      if (res.error) toast.error(res.error);
      else toast.success(`Rangé dans « ${cours.titre} »`);
      router.refresh();
    });
  };

  const afterImport = () => {
    setImportOpen(false);
    toast.success('PDF ajouté au cours');
    router.refresh();
  };

  const renderSheet = (doc: Doc, mode: 'cours' | 'loose') => {
    const meta = [doc.date_import ? `Importé le ${formatDate(doc.date_import)}` : null, formatSize(doc.taille)].filter(Boolean).join(' · ');
    return (
      <motion.li key={doc.id} layout className={styles.sheet} {...ENTER} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <span className={styles.thumb} aria-hidden><span className={styles.thumbBand}>PDF</span></span>
        <div className={styles.sheetInfo}>
          <p className={styles.sheetName} title={doc.nom}>{displayName(doc.nom)}</p>
          {meta && <p className={styles.sheetMeta}>{meta}</p>}
        </div>
        <div className={styles.sheetActions}>
          {mode === 'cours' ? (
            <>
              <Link href={`/app/etude/${doc.id}`} className={styles.study}>
                <BookOpenText size={17} aria-hidden /> Étudier
              </Link>
              <button type="button" className={styles.ghost} onClick={() => doc.url_fichier && setReading(doc)} disabled={!doc.url_fichier}>
                <Eye size={17} aria-hidden /> Lire
              </button>
            </>
          ) : (
            <button type="button" className={styles.file} onClick={() => handleFile(doc)} disabled={filing !== null}>
              <FolderInput size={17} aria-hidden /> {filing === doc.id ? 'Rangement…' : 'Ranger dans ce cours'}
            </button>
          )}
          <RowMenu
            label={`Plus d’actions pour ${displayName(doc.nom)}`}
            deleteLabel="Supprimer le PDF"
            deleteNote="Le PDF, ses cartes de révision et ses évaluations seront supprimés."
            onDelete={() => handleDelete(doc)}
            downloadUrl={doc.url_fichier}
          />
        </div>
      </motion.li>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <header>
          <nav className={styles.crumbs} aria-label="Fil d’Ariane">
            <Link href="/app/matieres">Mes matières</Link>
            <ChevronRight size={14} className={styles.crumbSep} aria-hidden />
            <Link href={`/app/matieres/${matiere.id}`}>{matiere.titre}</Link>
          </nav>
          <div className={styles.head}>
            <div>
              <h1 className={styles.title}>{cours.titre}</h1>
              <div className={styles.stats}>
                <span className={styles.stat}>{docs.length} PDF dans ce cours</span>
              </div>
            </div>
            {docs.length > 0 && (
              <button type="button" className={styles.primary} onClick={() => setImportOpen(true)}>
                <Plus size={18} aria-hidden /> Ajouter un PDF
              </button>
            )}
          </div>
        </header>

        {docs.length === 0 ? (
          <section className={styles.empty}>
            <h2 className={styles.emptyTitle}>Ce cours n’a pas encore de PDF</h2>
            <p className={styles.emptyText}>
              Dépose tes séquences, ton polycopié ou tes notes. Chaque PDF reste rangé dans ce cours, et tu pourras
              lancer son étude guidée.
            </p>
            <div className={styles.emptyUpload}>
              <DocumentUploader matiereId={matiere.id} coursId={cours.id} onUploadComplete={afterImport} />
            </div>
          </section>
        ) : (
          <section aria-labelledby="pdf-du-cours">
            <div className={styles.sectionHead}>
              <h2 id="pdf-du-cours" className={styles.sectionTitle}>PDF du cours</h2>
              <span className={styles.sectionNote}>Du plus récent au plus ancien</span>
            </div>
            <ul className={styles.sheets}>
              <AnimatePresence initial={false}>{docs.map((d) => renderSheet(d, 'cours'))}</AnimatePresence>
            </ul>
          </section>
        )}

        {loose.length > 0 && (
          <section className={styles.loose} aria-labelledby="a-ranger">
            <p id="a-ranger" className={styles.looseTitle}>
              {loose.length === 1 ? '1 PDF de la matière n’est rangé dans aucun cours' : `${loose.length} PDF de la matière ne sont rangés dans aucun cours`}
            </p>
            <p className={styles.looseText}>
              Ils ont été importés avant le rangement automatique. Range ici ceux qui appartiennent à « {cours.titre} » :
              ils n’apparaîtront plus que dans ce cours.
            </p>
            <ul className={styles.sheets}>
              <AnimatePresence initial={false}>{loose.map((d) => renderSheet(d, 'loose'))}</AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title={`Ajouter un PDF à « ${cours.titre} »`}>
        <DocumentUploader matiereId={matiere.id} coursId={cours.id} onUploadComplete={afterImport} />
      </Modal>

      {reading?.url_fichier && (
        <PdfReader url={reading.url_fichier} title={displayName(reading.nom)} onClose={() => setReading(null)} />
      )}
    </MotionConfig>
  );
}
