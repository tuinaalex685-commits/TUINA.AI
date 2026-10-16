"use client";

import React, { useEffect, useState, useTransition, useOptimistic } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FileText, BookOpenText, Eye, MoreHorizontal, Download, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { PdfReader } from '@/components/pdf/PdfReader';
import { deleteDocument } from '@/app/actions/documents';
import { formatDate } from '@/lib/format';
import styles from './bibliotheque.module.css';

interface Doc {
  id: string;
  nom: string;
  taille: number | null;
  url_fichier: string | null;
  date_import: string | null;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export default function BibliothequeManager({ initialDocuments }: { initialDocuments: Doc[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [docs, removeDoc] = useOptimistic(initialDocuments, (state, id: string) => state.filter((d) => d.id !== id));
  const [reading, setReading] = useState<Doc | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Un clic ailleurs referme le menu « ⋯ ».
  useEffect(() => {
    if (!menuFor) return;
    const close = () => { setMenuFor(null); setConfirmDelete(null); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const handleDelete = (doc: Doc) => {
    setMenuFor(null);
    setConfirmDelete(null);
    startTransition(async () => {
      removeDoc(doc.id);
      const res = await deleteDocument(doc.id);
      if (res.error) {
        toast.error('Suppression impossible. Réessaie dans un instant.');
        router.refresh();
      } else {
        toast.success(`« ${doc.nom} » supprimé`);
      }
    });
  };

  const afterImport = () => {
    setImportOpen(false);
    toast.success('Document importé');
    router.refresh();
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Mes documents</h1>
          <p className={styles.lead}>Tes cours en PDF. Lis-les ici, ou lance l’étude guidée pour les travailler.</p>
        </div>
        {docs.length > 0 && (
          <Button onClick={() => setImportOpen(true)} className={styles.importBtn}>
            <Plus size={18} aria-hidden /> Importer un PDF
          </Button>
        )}
      </header>

      {docs.length === 0 ? (
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>Importe ton premier cours</h2>
          <p className={styles.emptyText}>
            Polycopié, notes de cours, fiche de TD : dépose le PDF. SJP en tirera une étude guidée, des cartes de
            révision et des examens.
          </p>
          <DocumentUploader onUploadComplete={afterImport} />
        </section>
      ) : (
        <ul className={styles.list}>
          {docs.map((doc) => {
            const meta = [doc.date_import ? `Importé le ${formatDate(doc.date_import)}` : null, formatSize(doc.taille)].filter(Boolean).join(' · ');
            const menuOpen = menuFor === doc.id;
            return (
              <li key={doc.id} className={styles.row}>
                <FileText size={22} className={styles.fileIcon} aria-hidden />
                <div className={styles.info}>
                  <p className={styles.name} title={doc.nom}>{doc.nom}</p>
                  {meta && <p className={styles.meta}>{meta}</p>}
                </div>

                <div className={styles.actions}>
                  <Link href={`/app/etude/${doc.id}`} className={styles.study}>
                    <BookOpenText size={17} aria-hidden /> Étudier
                  </Link>
                  <button
                    type="button"
                    className={styles.read}
                    onClick={() => doc.url_fichier && setReading(doc)}
                    disabled={!doc.url_fichier}
                  >
                    <Eye size={17} aria-hidden /> Lire
                  </button>
                  <div className={styles.more}>
                    <button
                      type="button"
                      className={styles.moreBtn}
                      aria-label={`Plus d’actions pour ${doc.nom}`}
                      aria-expanded={menuOpen}
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); setMenuFor(menuOpen ? null : doc.id); }}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    {menuOpen && (
                      <div className={styles.menu} role="menu" onClick={(e) => e.stopPropagation()}>
                        {doc.url_fichier && (
                          <a role="menuitem" className={styles.menuItem} href={doc.url_fichier} download target="_blank" rel="noopener noreferrer">
                            <Download size={16} aria-hidden /> Télécharger
                          </a>
                        )}
                        {confirmDelete === doc.id ? (
                          <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.danger}`} onClick={() => handleDelete(doc)}>
                            <Trash2 size={16} aria-hidden /> Confirmer la suppression
                          </button>
                        ) : (
                          <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.danger}`} onClick={() => setConfirmDelete(doc.id)}>
                            <Trash2 size={16} aria-hidden /> Supprimer
                          </button>
                        )}
                        {confirmDelete === doc.id && (
                          <p className={styles.menuNote}>Les cartes et évaluations liées à ce document seront aussi supprimées.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reading?.url_fichier && (
        <PdfReader url={reading.url_fichier} title={reading.nom} onClose={() => setReading(null)} />
      )}

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Importer un PDF">
        <p className={styles.modalText}>Tu pourras rattacher ce document à une matière plus tard.</p>
        <DocumentUploader onUploadComplete={afterImport} />
      </Modal>
    </div>
  );
}
