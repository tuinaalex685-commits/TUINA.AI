"use client";

import React, { useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Input } from '@/components/ui/Input/Input';
import { createMatiere, deleteMatiere } from '@/app/actions/student';
import { RowMenu } from './RowMenu';
import styles from './matieres.module.css';

interface MatiereItem {
  id: string;
  titre: string;
  description: string | null;
  created_at: string;
  nbCours: number;
  nbDocuments: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default function MatiereManager({ initialMatieres }: { initialMatieres: MatiereItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [matieres, removeMatiere] = useOptimistic(initialMatieres, (state, id: string) => state.filter((m) => m.id !== id));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = titre.trim();
    if (!value) { setError('Donne un titre à la matière.'); return; }
    setSaving(true);
    setError('');
    const res = await createMatiere(value, description.trim());
    setSaving(false);
    if (res.error) { setError('Création impossible. Réessaie.'); return; }
    setTitre('');
    setDescription('');
    setIsModalOpen(false);
    toast.success(`Matière « ${value} » créée`);
    router.refresh();
  };

  const handleDelete = (m: MatiereItem) => {
    startTransition(async () => {
      removeMatiere(m.id);
      const res = await deleteMatiere(m.id);
      if (res.error) toast.error('Suppression impossible. Réessaie.');
      else toast.success(`« ${m.titre} » supprimée`);
      router.refresh();
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>Mes matières</h1>
            <p className={styles.lead}>Un classeur par enseignement, tes cours à l’intérieur, chaque PDF rangé dans son cours.</p>
          </div>
          {matieres.length > 0 && (
            <button type="button" className={styles.primary} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} aria-hidden /> Nouvelle matière
            </button>
          )}
        </header>

        {matieres.length === 0 ? (
          <section className={styles.empty}>
            <h2 className={styles.emptyTitle}>Crée ta première matière</h2>
            <p className={styles.emptyText}>
              Par exemple « Droit des personnes et de la famille ». Tu y ajouteras ensuite tes cours, puis les PDF de
              chaque cours.
            </p>
            <button type="button" className={styles.primary} style={{ alignSelf: 'center' }} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} aria-hidden /> Nouvelle matière
            </button>
          </section>
        ) : (
          <ul className={styles.binders}>
            <AnimatePresence initial={false}>
              {matieres.map((m, i) => (
                <motion.li
                  key={m.id}
                  layout
                  className={styles.binder}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04, duration: 0.25 } }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                >
                  <Link href={`/app/matieres/${m.id}`} className={styles.binderLink} aria-label={`Ouvrir la matière ${m.titre}`} />
                  <h2 className={styles.binderTitle}>{m.titre}</h2>
                  {m.description && <p className={styles.binderDesc}>{m.description}</p>}
                  <p className={styles.binderFoot}>
                    <span><strong>{m.nbCours}</strong> cours</span>
                    <span><strong>{m.nbDocuments}</strong> PDF</span>
                  </p>
                  <div className={styles.cornerMenu}>
                    <RowMenu
                      label={`Plus d’actions pour ${m.titre}`}
                      deleteLabel="Supprimer la matière"
                      deleteNote={`${plural(m.nbCours, 'cours', 'cours')} et ${plural(m.nbDocuments, 'PDF', 'PDF')} seront supprimés avec elle.`}
                      onDelete={() => handleDelete(m)}
                    />
                  </div>
                </motion.li>
              ))}
              <motion.li key="new" layout>
                <button type="button" className={styles.newBinder} onClick={() => setIsModalOpen(true)}>
                  <Plus size={22} aria-hidden /> Nouvelle matière
                </button>
              </motion.li>
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nouvelle matière">
        <form onSubmit={handleCreate} className={styles.form}>
          <Input
            label="Titre de la matière"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex. : Droit des personnes et de la famille"
            maxLength={120}
            required
            autoFocus
          />
          <Input
            label="Description (facultative)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. : L1, premier semestre"
            maxLength={240}
          />
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Création…' : 'Créer la matière'}
            </button>
          </div>
        </form>
      </Modal>
    </MotionConfig>
  );
}
