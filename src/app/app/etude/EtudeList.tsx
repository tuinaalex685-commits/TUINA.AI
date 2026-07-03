"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { useRouter } from 'next/navigation';

export default function EtudeList({ documents, progressByPdf }: { documents: any[], progressByPdf: any }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-large)' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '28px' }}>Choisis ton cours</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            Sélectionne un PDF pour démarrer l'étude séquentielle guidée par l'IA.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} style={{ padding: '10px 20px' }}>
          ➕ Importer un PDF
        </Button>
      </header>

      {documents.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', marginBottom: '16px' }}>📖</span>
          <h3 style={{ color: 'var(--color-text-main)', fontSize: '20px', margin: 0 }}>Aucun cours disponible</h3>
          <p style={{ marginTop: '8px', marginBottom: '24px' }}>Importe ton premier PDF pour générer ton apprentissage guidé.</p>
          <Button onClick={() => setIsModalOpen(true)} style={{ padding: '12px 24px' }}>
            Importer un cours
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--spacing-standard)' }}>
          {documents.map(doc => {
            const progress = progressByPdf[doc.id];
            const status = progress ? progress.statut : 'non_commence';
            
            return (
              <Card key={doc.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ marginBottom: 'var(--spacing-standard)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <span style={{ fontSize: '32px' }}>📄</span>
                    {status === 'non_commence' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Nouveau</span>}
                    {status === 'en_cours' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 600 }}>En cours</span>}
                    {status === 'termine' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontWeight: 600 }}>Terminé</span>}
                  </div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--color-text-main)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={doc.nom}>
                    {doc.nom}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Importé le {new Date(doc.created_at || doc.date_import).toLocaleDateString()}
                  </div>
                </div>
                
                <Button 
                  onClick={() => router.push(`/app/etude/${doc.id}`)}
                  style={{ width: '100%', padding: '10px' }}
                  variant={status === 'non_commence' ? 'primary' : 'secondary'}
                >
                  {status === 'non_commence' ? 'Commencer' : 'Continuer'}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Importer un PDF de cours">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
          <DocumentUploader 
            onUploadComplete={() => {
              setIsModalOpen(false);
              router.refresh();
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
