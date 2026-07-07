"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import Link from 'next/link';
import { createCours } from '@/app/actions/student';
import { deleteDocument } from '@/app/actions/documents';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function CoursManager({ matiere, initialCours, initialDocuments = [] }: { matiere: any, initialCours: any[], initialDocuments?: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const [coursList, setCoursList] = useState<any[]>(initialCours);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-cours')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cours', filter: `matiere_id=eq.${matiere.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            router.refresh();
          } else if (payload.eventType === 'DELETE') {
            setCoursList(prev => prev.filter(c => c.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setCoursList(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, matiere.id]);

  useEffect(() => {
    setCoursList(initialCours);
  }, [initialCours]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await createCours(matiere.id, titre);
    if (res.error) {
      setError(res.error);
    } else {
      setTitre('');
      setIsModalOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Button variant="secondary" onClick={() => router.push('/app/matieres')} style={{ marginBottom: 'var(--spacing-standard)', padding: '6px 12px', fontSize: '14px' }}>
            ← Retour aux matières
          </Button>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '28px' }}>{matiere.titre}</h1>
          {matiere.description && <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>{matiere.description}</p>}
        </div>
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>Nouveau Cours</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--spacing-standard)' }}>
        {coursList.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--spacing-large)', color: 'var(--color-text-secondary)' }}>
            <p>Ce cours ne contient aucun sous-cours pour l'instant.</p>
          </div>
        )}
        {coursList.map((cours) => (
          <Link href={`/app/matieres/${matiere.id}/cours/${cours.id}`} key={cours.id} style={{ textDecoration: 'none' }}>
            <Card style={{ cursor: 'pointer', transition: 'transform 0.2s ease', border: '1px solid var(--color-border)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 var(--spacing-small)', color: 'var(--color-text-main)' }}>{cours.titre}</h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Créé le {new Date(cours.created_at).toLocaleDateString()}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--spacing-standard)' }}>
                <Button variant="secondary" onClick={(e) => { e.preventDefault(); router.push(`/app/matieres/${matiere.id}/cours/${cours.id}`); }} style={{ flex: 1 }}>Ouvrir</Button>
                <Button variant="secondary" onClick={(e) => { 
                  e.preventDefault(); 
                  if(confirm('Voulez-vous vraiment supprimer ce cours ?')) { 
                    setDeletingId(cours.id);
                    startTransition(async () => {
                      const { deleteCours } = await import('@/app/actions/student');
                      await deleteCours(cours.id, matiere.id); 
                      setDeletingId(null);
                    });
                  } 
                }} disabled={isPending && deletingId === cours.id} style={{ padding: '6px', color: '#e53e3e', borderColor: '#fc8181' }}>
                  {isPending && deletingId === cours.id ? '⌛' : '🗑️'}
                </Button>
              </div>
            </Card>
          </Link>
        ))}
        
        {/* Empty State Card */}
        <Card 
          style={{ cursor: 'pointer', border: '1px dashed var(--color-border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '150px' }}
          onClick={() => setIsModalOpen(true)}
        >
          <span style={{ fontSize: '24px', color: 'var(--color-primary)', marginBottom: '8px' }}>+</span>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Ajouter un nouveau cours</p>
        </Card>
      </div>

      {/* La section d'importation globale a été retirée pour éviter les doublons avec celle du Cours */}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Nouveau cours dans ${matiere.titre}`}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <Input 
            label="Titre du cours" 
            value={titre} 
            onChange={e => setTitre(e.target.value)} 
            placeholder="Ex: Titre 1 - Les personnes physiques" 
            required 
          />
          {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
          <Button type="submit" disabled={loading} style={{ alignSelf: 'flex-end', marginTop: 'var(--spacing-small)' }}>
            {loading ? 'Création...' : 'Créer le cours'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
