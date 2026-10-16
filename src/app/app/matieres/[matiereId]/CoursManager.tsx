"use client";

import React, { useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ChevronRight, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Input } from '@/components/ui/Input/Input';
import { createCours, deleteCours } from '@/app/actions/student';
import { RowMenu } from '../RowMenu';
import styles from '../matieres.module.css';

interface CoursItem {
  id: string;
  titre: string;
  created_at: string;
  nbDocuments: number;
}

type Action = { type: 'add'; cours: CoursItem } | { type: 'remove'; id: string };

const pdfLabel = (n: number) => (n === 0 ? 'Aucun PDF' : n === 1 ? '1 PDF' : `${n} PDF`);

export default function CoursManager({ matiere, initialCours, looseCount }: {
  matiere: { id: string; titre: string; description: string | null };
  initialCours: CoursItem[];
  looseCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [coursList, apply] = useOptimistic(initialCours, (state, a: Action) =>
    a.type === 'add' ? [...state, a.cours] : state.filter((c) => c.id !== a.id));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalPdf = coursList.reduce((s, c) => s + c.nbDocuments, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = titre.trim();
    if (!value) { setError('Donne un titre au cours.'); return; }
    setSaving(true);
    setError('');
    const res = await createCours(matiere.id, value);
    setSaving(false);
    if (res.error) { setError('Création impossible. Réessaie.'); return; }
    setTitre('');
    setIsModalOpen(false);
    toast.success(`Cours « ${value} » créé`);
    router.refresh();
  };

  const handleDelete = (c: CoursItem) => {
    startTransition(async () => {
      apply({ type: 'remove', id: c.id });
      const res = await deleteCours(c.id, matiere.id);
      if (res.error) toast.error('Suppression impossible. Réessaie.');
      else toast.success(`« ${c.titre} » supprimé`);
      router.refresh();
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <header>
          <nav className={styles.crumbs} aria-label="Fil d’Ariane">
            <Link href="/app/matieres">Mes matières</Link>
          </nav>
          <div className={styles.head}>
            <div>
              <h1 className={styles.title}>{matiere.titre}</h1>
              {matiere.description && <p className={styles.lead}>{matiere.description}</p>}
              <div className={styles.stats}>
                <span className={styles.stat}>{coursList.length} cours</span>
                <span className={styles.stat}>{pdfLabel(totalPdf + looseCount)}</span>
              </div>
            </div>
            <button type="button" className={styles.primary} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} aria-hidden /> Nouveau cours
            </button>
          </div>
        </header>

        {looseCount > 0 && coursList.length > 0 && (
          <p className={styles.notice} role="status">
            <strong>{looseCount === 1 ? '1 PDF n’est rangé dans aucun cours.' : `${looseCount} PDF ne sont rangés dans aucun cours.`}</strong>
            Ouvre le cours concerné : tu pourras les y ranger en un geste.
          </p>
        )}

        {coursList.length === 0 ? (
          <section className={styles.empty}>
            <h2 className={styles.emptyTitle}>Crée le premier cours de cette matière</h2>
            <p className={styles.emptyText}>
              Un cours par partie de ton programme, par exemple « Les personnes et les incapacités ». Tu y rangeras
              ensuite les PDF correspondants.
            </p>
            <button type="button" className={styles.primary} style={{ alignSelf: 'center' }} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} aria-hidden /> Nouveau cours
            </button>
          </section>
        ) : (
          <ul className={styles.tabs}>
            <AnimatePresence initial={false}>
              {coursList.map((c, i) => (
                <motion.li
                  key={c.id}
                  layout
                  className={styles.tabRow}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.035, duration: 0.22 } }}
                  exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
                >
                  <span className={styles.tabMark} aria-hidden />
                  <div className={styles.tabMain}>
                    <p className={styles.tabTitle}>{c.titre}</p>
                    <p className={styles.tabMeta}>{pdfLabel(c.nbDocuments)}</p>
                  </div>
                  <Link href={`/app/matieres/${matiere.id}/cours/${c.id}`} className={styles.rowLink} aria-label={`Ouvrir le cours ${c.titre}`} />
                  <RowMenu
                    label={`Plus d’actions pour ${c.titre}`}
                    deleteLabel="Supprimer le cours"
                    deleteNote="Le cours et tous ses PDF seront supprimés."
                    onDelete={() => handleDelete(c)}
                  />
                  <ChevronRight size={20} className={styles.tabChevron} aria-hidden />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Nouveau cours dans « ${matiere.titre} »`}>
        <form onSubmit={handleCreate} className={styles.form}>
          <Input
            label="Titre du cours"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex. : Les personnes et les incapacités"
            maxLength={120}
            required
            autoFocus
          />
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Création…' : 'Créer le cours'}
            </button>
          </div>
        </form>
      </Modal>
    </MotionConfig>
  );
}
