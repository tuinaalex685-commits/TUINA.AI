"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import styles from './matieres.module.css';
import Link from 'next/link';
import { createMatiere } from '@/app/actions/student';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function MatiereManager({ initialMatieres }: { initialMatieres: any[] }) {
  const router = useRouter();
  
  const [matieres, setMatieres] = useState<any[]>(initialMatieres);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-matieres')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matieres' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            router.refresh(); // Fetch the new record completely to get generated fields
          } else if (payload.eventType === 'DELETE') {
            setMatieres(prev => prev.filter(m => m.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setMatieres(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    setMatieres(initialMatieres);
  }, [initialMatieres]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await createMatiere(titre, description);
    if (res.error) {
      setError(res.error);
    } else {
      setTitre('');
      setDescription('');
      setIsModalOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.description}>
          Gérez vos matières juridiques et organisez vos cours en chapitres pour un apprentissage structuré.
        </p>
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>Nouvelle Matière</Button>
      </div>

      <div className={styles.grid}>
        {matieres.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--spacing-large)', color: 'var(--color-text-secondary)' }}>
            <p>Vous n'avez pas encore de matière. Créez-en une pour commencer !</p>
          </div>
        )}
        {matieres.map((matiere) => (
          <Link href={`/app/matieres/${matiere.id}`} key={matiere.id} style={{ textDecoration: 'none' }}>
            <Card className={styles.matiereCard} style={{ cursor: 'pointer', height: '100%' }}>
              <div className={styles.cardHeader}>
                <h3 style={{ color: 'var(--color-primary)' }}>{matiere.titre}</h3>
                {/* On simulera le nb de cours plus tard */}
                <Badge status="neutral">Cours</Badge> 
              </div>
              <p className={styles.cardDesc}>{matiere.description || "Aucune description"}</p>
              <div className={styles.cardFooter}>
                <span className={styles.progressText}>Créé le {new Date(matiere.created_at).toLocaleDateString()}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="secondary" onClick={(e) => { e.preventDefault(); router.push(`/app/matieres/${matiere.id}`); }}>Ouvrir</Button>
                  <Button variant="secondary" onClick={(e) => { 
                    e.preventDefault(); 
                    if(confirm('Voulez-vous vraiment supprimer cette matière et tout son contenu ?')) { 
                      setDeletingId(matiere.id);
                      startTransition(async () => {
                        const { deleteMatiere } = await import('@/app/actions/student');
                        await deleteMatiere(matiere.id); 
                        setDeletingId(null);
                      });
                    } 
                  }} disabled={isPending && deletingId === matiere.id} style={{ padding: '6px', color: '#e53e3e', borderColor: '#fc8181' }}>
                    {isPending && deletingId === matiere.id ? '⌛' : '🗑️'}
                  </Button>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        
        {/* Empty State Card */}
        <Card 
          className={`${styles.matiereCard} ${styles.emptyState}`} 
          style={{ cursor: 'pointer' }}
          onClick={() => setIsModalOpen(true)}
        >
          <div className={styles.emptyContent}>
            <span className={styles.emptyIcon}>+</span>
            <p>Ajouter une nouvelle matière</p>
          </div>
        </Card>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Créer une nouvelle matière">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <Input 
            label="Titre de la matière" 
            value={titre} 
            onChange={e => setTitre(e.target.value)} 
            placeholder="Ex: Droit Pénal Général" 
            required 
          />
          <Input 
            label="Description (optionnelle)" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Ex: Concepts fondamentaux de l'infraction..." 
          />
          {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
          <Button type="submit" disabled={loading} style={{ alignSelf: 'flex-end', marginTop: 'var(--spacing-small)' }}>
            {loading ? 'Création...' : 'Créer la matière'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
