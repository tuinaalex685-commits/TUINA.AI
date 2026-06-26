"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { createRedaction, updateRedactionContent, sendRedactionForAnalysis, saveRedactionVersion } from '@/app/actions/redaction';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function RedactionManager({ initialRedactions }: { initialRedactions: any[] }) {
  const router = useRouter();

  const [redactionsList, setRedactionsList] = useState<any[]>(initialRedactions);
  const [activeRedaction, setActiveRedaction] = useState<any>(null);
  
  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('realtime-redactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'redactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            router.refresh();
          } else if (payload.eventType === 'DELETE') {
            setRedactionsList(prev => prev.filter(r => r.id !== payload.old.id));
            if (activeRedaction?.id === payload.old.id) {
              setActiveRedaction(null);
            }
          } else if (payload.eventType === 'UPDATE') {
            setRedactionsList(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new, redaction_versions: r.redaction_versions } : r));
            if (activeRedaction?.id === payload.new.id) {
              setActiveRedaction((prev: any) => ({ ...prev, ...payload.new }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, activeRedaction]);

  useEffect(() => {
    setRedactionsList(initialRedactions);
    if (activeRedaction) {
      const updated = initialRedactions.find(r => r.id === activeRedaction.id);
      if (updated) setActiveRedaction(updated);
    }
  }, [initialRedactions]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState('Dissertation');
  const [loading, setLoading] = useState(false);
  
  const [contenu, setContenu] = useState('');
  const [viewMode, setViewMode] = useState<'edition' | 'versions' | 'analyse'>('edition');
  const [selectedVersionText, setSelectedVersionText] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await createRedaction(titre, type);
    if (!res.error) {
      setTitre('');
      setIsModalOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  const handleSaveDraft = async () => {
    if (!activeRedaction) return;
    await updateRedactionContent(activeRedaction.id, contenu);
    alert('Brouillon sauvegardé !');
    router.refresh();
  };

  const handleSaveVersion = async () => {
    if (!activeRedaction) return;
    await saveRedactionVersion(activeRedaction.id, contenu);
    alert('Nouvelle version figée et sauvegardée dans l\'historique !');
    router.refresh();
  };

  const handleSendForAnalysis = async () => {
    if (!activeRedaction) return;
    if (!confirm("Voulez-vous envoyer cette rédaction pour analyse ? Vous ne pourrez plus la modifier.")) return;

    await updateRedactionContent(activeRedaction.id, contenu);
    await sendRedactionForAnalysis(activeRedaction.id);
    setActiveRedaction(null);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-large)', height: 'calc(100vh - 100px)' }}>
      {/* Sidebar Historique */}
      <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)', borderRight: '1px solid var(--color-border)', paddingRight: 'var(--spacing-standard)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Vos Rédactions</h2>
          <Button onClick={() => setIsModalOpen(true)} style={{ padding: '6px 12px', fontSize: '13px' }}>+ Nouveau</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)', overflowY: 'auto' }}>
          {redactionsList.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textAlign: 'center', marginTop: 'var(--spacing-large)' }}>
              Aucune rédaction.
            </p>
          ) : (
            redactionsList.map(red => (
              <Card
                key={red.id}
                style={{ padding: '12px', cursor: 'pointer', border: activeRedaction?.id === red.id ? '1px solid var(--color-primary)' : '1px solid transparent' }}
                onClick={() => {
                  setActiveRedaction(red);
                  setContenu(red.contenu || '');
                  setViewMode(red.statut === 'analyse' ? 'analyse' : 'edition');
                  setSelectedVersionText(null);
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>{red.titre}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{red.type}</span>
                  <span style={{ fontSize: '12px', color: red.statut === 'analyse' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {red.statut === 'analyse' ? 'Analysé' : 'Brouillon'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  {red.redaction_versions?.length || 0} version(s) historique(s)
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Éditeur Principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeRedaction ? (
          <>
            <header style={{ marginBottom: 'var(--spacing-standard)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: '0 0 8px 0' }}>{activeRedaction.titre}</h1>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Type : {activeRedaction.type} | Statut : {activeRedaction.statut}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {activeRedaction.statut !== 'analyse' && (
                  <Button variant={viewMode === 'edition' ? 'primary' : 'secondary'} onClick={() => { setViewMode('edition'); setSelectedVersionText(null); }}>Édition</Button>
                )}
                <Button variant={viewMode === 'versions' ? 'primary' : 'secondary'} onClick={() => setViewMode('versions')}>Historique des versions</Button>
                {activeRedaction.statut === 'analyse' && (
                  <Button variant={viewMode === 'analyse' ? 'primary' : 'secondary'} onClick={() => setViewMode('analyse')}>Retour IA</Button>
                )}
              </div>
            </header>

            {viewMode === 'edition' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
                <textarea
                  value={contenu}
                  onChange={(e) => setContenu(e.target.value)}
                  style={{ flex: 1, padding: 'var(--spacing-standard)', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontSize: '15px', resize: 'none', outline: 'none' }}
                  placeholder="Rédigez votre devoir ici..."
                />
                <div style={{ display: 'flex', gap: 'var(--spacing-standard)', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
                    Le mode Mock IA génère un retour si aucune clé n'est fournie.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={handleSaveDraft}>Enregistrer le brouillon</Button>
                    <Button variant="secondary" onClick={handleSaveVersion}>Créer une version historique</Button>
                    <Button onClick={handleSendForAnalysis} style={{ backgroundColor: '#10b981', color: 'white' }}>Demander analyse IA</Button>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'versions' && (
              <div style={{ flex: 1, display: 'flex', gap: 'var(--spacing-standard)' }}>
                <Card style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                  <h3 style={{ margin: '0 0 8px 0' }}>Historique ({activeRedaction.redaction_versions?.length || 0})</h3>
                  {activeRedaction.redaction_versions?.map((v: any, index: number) => (
                    <div 
                      key={v.id} 
                      onClick={() => setSelectedVersionText(v.contenu)}
                      style={{ padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', backgroundColor: selectedVersionText === v.contenu ? 'var(--color-bg-secondary)' : 'transparent' }}
                    >
                      <div style={{ fontWeight: 600 }}>Version {activeRedaction.redaction_versions.length - index}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {new Date(v.date_soumission).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {(!activeRedaction.redaction_versions || activeRedaction.redaction_versions.length === 0) && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Aucune version historique figée. Cliquez sur "Créer une version historique" dans le mode édition.</p>
                  )}
                </Card>
                <Card style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <h3 style={{ margin: '0 0 16px 0' }}>Contenu de la version</h3>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: 'var(--color-text-main)' }}>
                    {selectedVersionText || "Sélectionnez une version dans la liste de gauche pour lire son contenu."}
                  </div>
                </Card>
              </div>
            )}

            {viewMode === 'analyse' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
                <Card style={{ backgroundColor: 'var(--color-bg-secondary)', padding: 'var(--spacing-standard)' }}>
                  <h3 style={{ margin: '0 0 var(--spacing-small)' }}>Texte analysé</h3>
                  <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)', fontSize: '14px', maxHeight: '150px', overflowY: 'auto' }}>
                    {activeRedaction.contenu}
                  </div>
                </Card>

                <Card style={{ flex: 1, border: '1px solid var(--color-primary)' }}>
                  <h2 style={{ color: 'var(--color-primary)', margin: '0 0 var(--spacing-standard)' }}>Retour du Correcteur IA</h2>
                  {activeRedaction.rapport_analyse ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)', overflowY: 'auto' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-success)' }}>Points forts</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                          {activeRedaction.rapport_analyse.points_forts?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-warning)' }}>Points faibles</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                          {activeRedaction.rapport_analyse.points_faibles?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-primary)' }}>Axes d'amélioration</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                          {activeRedaction.rapport_analyse.axes_amelioration?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                      <p><strong>Note estimée :</strong> {activeRedaction.rapport_analyse.note_globale}</p>
                    </div>
                  ) : (
                    <p>Aucun rapport disponible. (Erreur de génération)</p>
                  )}
                </Card>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' }}>
            Sélectionnez une rédaction dans la liste de gauche ou créez-en une nouvelle.
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nouvelle Rédaction">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Titre / Sujet</label>
            <Input label="" value={titre} onChange={(e: any) => setTitre(e.target.value)} required placeholder="Ex: La responsabilité civile extra-contractuelle..." />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Type d'exercice</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)' }}>
              <option value="Dissertation">Dissertation juridique</option>
              <option value="Cas pratique">Cas pratique</option>
              <option value="Commentaire d'arrêt">Commentaire d'arrêt</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--spacing-standard)' }}>
            <Button type="submit" disabled={loading}>{loading ? 'Création...' : 'Créer l\'espace de rédaction'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
