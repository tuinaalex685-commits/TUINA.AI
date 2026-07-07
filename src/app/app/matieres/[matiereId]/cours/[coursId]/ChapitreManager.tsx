"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { DocumentUploader } from '@/components/ui/DocumentUploader/DocumentUploader';
import { createChapitre, updateChapitreContent } from '@/app/actions/student';
import { deleteDocument } from '@/app/actions/documents';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function ChapitreManager({ 
  matiere, 
  cours, 
  initialChapitres,
  initialDocuments
}: { 
  matiere: any, 
  cours: any, 
  initialChapitres: any[],
  initialDocuments: any[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [activeChapitreId, setActiveChapitreId] = useState<string | null>(
    initialChapitres.length > 0 ? initialChapitres[0].id : null
  );
  
  const activeChapitre = initialChapitres.find(c => c.id === activeChapitreId);
  
  const router = useRouter();

  const [chapitres, setChapitres] = useState<any[]>(initialChapitres);
  const [documents, setDocuments] = useState<any[]>(initialDocuments);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-cours-documents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `cours_id=eq.${cours.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            router.refresh();
          } else if (payload.eventType === 'DELETE') {
            setDocuments(prev => prev.filter(d => d.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setDocuments(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, cours.id]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const [contenu, setContenu] = useState(activeChapitre?.contenu_texte || '');

  const handleSelectChapitre = (id: string) => {
    setActiveChapitreId(id);
    const chap = initialChapitres.find(c => c.id === id);
    setContenu(chap?.contenu_texte || '');
  };

  const handleDeleteDocument = (id: string, url: string) => {
    if (confirm("Voulez-vous vraiment supprimer ce document ?")) {
      setDeletingId(id);
      startTransition(async () => {
        await deleteDocument(id, url);
        setDeletingId(null);
      });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await createChapitre(cours.id, matiere.id, titre);
    if (res.error) {
      setError(res.error);
    } else {
      setTitre('');
      setIsModalOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  const handleSaveContent = async () => {
    if (!activeChapitreId) return;
    setSaving(true);
    const res = await updateChapitreContent(activeChapitreId, cours.id, contenu);
    if (res.error) {
      alert("Erreur lors de la sauvegarde: " + res.error);
    }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', gap: 'var(--spacing-large)' }}>
      {/* En-tête */}
      <div>
        <Button variant="secondary" onClick={() => router.push(`/app/matieres/${matiere.id}`)} style={{ marginBottom: 'var(--spacing-standard)', padding: '6px 12px', fontSize: '14px' }}>
          ← Retour au cours
        </Button>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '24px' }}>{cours.titre}</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0 0', fontSize: '14px' }}>Matière : {matiere.titre}</p>
      </div>

      {/* Contenu principal : Uniquement les documents */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        <div style={{ backgroundColor: 'var(--color-bg-secondary)', padding: 'var(--spacing-large)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ margin: '0 0 var(--spacing-standard) 0', fontSize: '20px' }}>Documents du cours (PDF)</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-large)' }}>
            Importez ici les PDF correspondant à ce cours pour pouvoir générer des quiz et des flashcards.
          </p>
          
          {/* Liste des documents existants pour ce cours */}
          {documents.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--spacing-standard)', marginBottom: 'var(--spacing-large)' }}>
              {documents.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--color-bg-main)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '32px' }}>📄</span>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <a href={doc.url_fichier} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={doc.nom}>
                        {doc.nom}
                      </a>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        {(doc.taille / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => handleDeleteDocument(doc.id, doc.url_fichier)} disabled={isPending && deletingId === doc.id} style={{ padding: '8px 12px', fontSize: '13px', color: '#e53e3e', borderColor: '#fc8181', marginLeft: '12px' }}>
                    {isPending && deletingId === doc.id ? 'Suppression...' : 'Supprimer'}
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          <DocumentUploader 
            matiereId={matiere.id}
            onUploadComplete={() => {
              router.refresh();
            }} 
          />
        </div>
      </div>

      {/* Modal Création Chapitre */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Nouveau Chapitre`}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <Input 
            label="Titre du chapitre" 
            value={titre} 
            onChange={e => setTitre(e.target.value)} 
            placeholder="Ex: Section 1 - Les droits subjectifs" 
            required 
          />
          {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
          <Button type="submit" disabled={loading} style={{ alignSelf: 'flex-end', marginTop: 'var(--spacing-small)' }}>
            {loading ? 'Création...' : 'Créer le chapitre'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
