"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import { deleteDocument } from '@/app/actions/documents';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function BibliothequeManager({ 
  initialDocuments 
}: { 
  initialDocuments: any[] 
}) {
  const router = useRouter();
  
  const [documents, setDocuments] = useState<any[]>(initialDocuments);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Écoute des changements en temps réel sur la table documents
    const channel = supabase
      .channel('realtime-documents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // L'INSERT ne contient pas les jointures (matieres, cours). 
            // On peut soit refetch, soit faire un optimistic update minimal, soit router.refresh()
            // Pour être sûr d'avoir les relations, on déclenche un refresh serveur qui va maj initialDocuments
            router.refresh();
          } else if (payload.eventType === 'DELETE') {
            setDocuments(prev => prev.filter(doc => doc.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setDocuments(prev => prev.map(doc => doc.id === payload.new.id ? { ...doc, ...payload.new } : doc));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // État pour la visionneuse PDF
  const [pdfUrlToView, setPdfUrlToView] = useState<string | null>(null);
  
  // État pour la modale d'importation
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleDelete = (id: string, url: string) => {
    if (confirm("Voulez-vous vraiment supprimer ce document ? Cela supprimera également les flashcards et quiz qui y sont liés.")) {
      setDeletingId(id);
      startTransition(async () => {
        const res = await deleteDocument(id, url);
        if (res.error) alert(res.error);
        else router.refresh();
        setDeletingId(null);
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Votre Bibliothèque</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>
            Espace centralisé. Importez, affichez et gérez tous vos PDF librement.
          </p>
        </div>
        <Button onClick={() => setIsImportModalOpen(true)} style={{ padding: '10px 20px' }}>
          ➕ Importer un PDF
        </Button>
      </header>

      {documents.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--spacing-large)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', marginBottom: 'var(--spacing-small)' }}>📚</span>
          <h3>Aucun document importé.</h3>
          <p style={{ marginTop: 'var(--spacing-small)' }}>La Bibliothèque est autonome. Importez directement vos PDF ici.</p>
          <Button onClick={() => setIsImportModalOpen(true)} style={{ marginTop: 'var(--spacing-standard)' }}>
            Importer mon premier document
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 'var(--spacing-standard)' }}>
          {documents.map(doc => (
            <Card key={doc.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--spacing-standard)' }}>
                <span style={{ fontSize: '40px' }}>📄</span>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--color-text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.nom}>
                    {doc.nom}
                  </h3>
                  
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>📅 Importé le : {new Date(doc.date_import).toLocaleDateString()}</span>
                    <span>📂 Taille : {(doc.taille / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-standard)' }}>
                <Button 
                  variant="secondary" 
                  onClick={() => setPdfUrlToView(doc.url_fichier)}
                  style={{ flex: 1, padding: '8px', fontSize: '13px', backgroundColor: 'var(--color-bg-secondary)' }}
                >
                  👁️ Consulter
                </Button>
                <a href={doc.url_fichier} download target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
                  <Button variant="secondary" style={{ width: '100%', padding: '8px', fontSize: '13px' }}>
                    ⬇️ Télécharger
                  </Button>
                </a>
                <Button 
                  variant="secondary" 
                  onClick={() => handleDelete(doc.id, doc.url_fichier)}
                  disabled={isPending && deletingId === doc.id}
                  style={{ flex: 1, padding: '8px', fontSize: '13px', color: '#e53e3e', borderColor: '#fc8181' }}
                >
                  {isPending && deletingId === doc.id ? 'Suppression...' : '🗑️ Supprimer'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Visionneuse PDF Intégrée (Plein Écran) */}
      {pdfUrlToView && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#1f2937' }}>
            <Button onClick={() => setPdfUrlToView(null)} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}>
              Fermer le lecteur ✖
            </Button>
          </div>
          <iframe 
            src={`${pdfUrlToView}#toolbar=0`} 
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#f3f4f6' }}
            title="Lecteur PDF"
          />
        </div>
      )}

      {/* Modal Importation Directe et Autonome */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Importer un document">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
          <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#6366f1' }}>
              Importation directe. Vous pourrez lier ce document à une matière plus tard si vous le souhaitez.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600 }}>Importez votre fichier PDF</label>
            <DocumentUploader 
              onUploadComplete={() => {
                setIsImportModalOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      </Modal>

    </div>
  );
}
