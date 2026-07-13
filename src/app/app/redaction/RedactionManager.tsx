"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { createRedaction, updateRedactionContent, saveRedactionVersion, getDailyRedactionUsage } from '@/app/actions/redaction';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useJob } from '@/lib/hooks/useJob';
import styles from './redaction.module.css';

export default function RedactionManager({ initialRedactions }: { initialRedactions: any[] }) {
  const router = useRouter();

  const [redactionsList, setRedactionsList] = useState<any[]>(initialRedactions);
  const [activeRedaction, setActiveRedaction] = useState<any>(null);
  const [dailyUsage, setDailyUsage] = useState<number>(0);
  
  useEffect(() => {
    getDailyRedactionUsage().then(setDailyUsage);
  }, []);
  
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
            setRedactionsList(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r));
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
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Observation du job d'analyse (le frontend n'attend jamais Gemini, il observe le job).
  const [redactionJobId, setRedactionJobId] = useState<string | null>(null);
  const redactionToastRef = useRef<string | undefined>(undefined);
  useJob(redactionJobId, {
    onDone: () => {
      setIsAnalyzing(false);
      setRedactionJobId(null);
      toast.success('Analyse prête !', { id: redactionToastRef.current });
      router.refresh();
    },
    onError: (err) => {
      setIsAnalyzing(false);
      setRedactionJobId(null);
      toast.error(`Échec de l'analyse : ${err}`, { id: redactionToastRef.current });
    },
  });

  // --- AUTO-SAVE toutes les 15 secondes ---
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const contenuRef = useRef(contenu);
  const activeRedactionRef = useRef(activeRedaction);
  
  useEffect(() => { contenuRef.current = contenu; }, [contenu]);
  useEffect(() => { activeRedactionRef.current = activeRedaction; }, [activeRedaction]);

  const doAutoSave = useCallback(async () => {
    const red = activeRedactionRef.current;
    const text = contenuRef.current;
    if (!red || red.statut === 'analyse' || !text || text.trim().length === 0) return;
    
    setIsSaving(true);
    await updateRedactionContent(red.id, text);
    setLastSaved(new Date().toLocaleTimeString());
    setIsSaving(false);
  }, []);

  useEffect(() => {
    if (activeRedaction && activeRedaction.statut !== 'analyse') {
      autoSaveTimerRef.current = setInterval(doAutoSave, 15000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [activeRedaction, doAutoSave]);

  // --- CRÉATION ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) {
      alert("Veuillez saisir un titre ou un sujet.");
      return;
    }
    setLoading(true);

    try {
      const res = await createRedaction(titre, type);
      setLoading(false);

      if (res.error) {
        alert(`Erreur lors de la création : ${res.error}`);
        return;
      }

      // Succès : fermer la modale, réinitialiser le formulaire
      setTitre('');
      setIsModalOpen(false);

      // Auto-ouvrir la rédaction nouvellement créée dans l'éditeur
      if (res.redaction) {
        setActiveRedaction(res.redaction);
        setContenu('');
        setViewMode('edition');
        setSelectedVersionText(null);
        setLastSaved(null);
      }

      router.refresh();
    } catch (err: any) {
      setLoading(false);
      alert("Erreur système lors de la création : " + err.message);
    }
  };

  // --- SAUVEGARDE MANUELLE ---
  const handleSaveDraft = async () => {
    if (!activeRedaction) return;
    setIsSaving(true);
    const res = await updateRedactionContent(activeRedaction.id, contenu);
    setIsSaving(false);
    if (res.error) {
      alert("Erreur de sauvegarde : " + res.error);
    } else {
      setLastSaved(new Date().toLocaleTimeString());
      alert('Brouillon sauvegardé !');
    }
  };

  // --- VERSION HISTORIQUE ---
  const handleSaveVersion = async () => {
    if (!activeRedaction) return;
    if (!contenu.trim()) {
      alert("Impossible de créer une version vide.");
      return;
    }
    const res = await saveRedactionVersion(activeRedaction.id, contenu);
    if (res.error) {
      alert("Erreur lors de la création de la version : " + res.error);
    } else {
      alert('Nouvelle version figée et sauvegardée dans l\'historique !');
      router.refresh();
    }
  };

  // --- ANALYSE IA ---
  const handleSendForAnalysis = async () => {
    if (!activeRedaction) return;
    if (!contenu.trim()) {
      toast.error("Vous devez rédiger du contenu avant de demander une analyse.");
      return;
    }
    if (contenu.length > 10000) {
      toast.error("Votre texte dépasse la limite autorisée de 10 000 caractères.");
      return;
    }
    
    const remaining = Math.max(0, 3 - dailyUsage);
    if (remaining <= 0) {
      toast.error("Vous avez atteint votre limite de 3 générations pour aujourd'hui.");
      return;
    }

    if (!confirm(`Il vous reste ${remaining} générations pour aujourd'hui. Voulez-vous utiliser une génération pour ce texte ?`)) return;

    if (isAnalyzing || redactionJobId) return; // anti double-clic
    setIsAnalyzing(true);
    const toastId = toast.loading('Mise en file de votre copie…');
    redactionToastRef.current = toastId;
    try {
      const saveRes = await updateRedactionContent(activeRedaction.id, contenu);
      if (saveRes.error) {
        setIsAnalyzing(false);
        toast.error("Erreur de sauvegarde avant analyse : " + saveRes.error, { id: toastId });
        return;
      }

      const { enqueueAiJob } = await import('@/app/actions/jobs');
      const res: any = await enqueueAiJob('redaction', { redactionId: activeRedaction.id });
      if (res.error || !res.jobId) {
        setIsAnalyzing(false);
        toast.error(res.error || "Impossible de lancer l'analyse.", { id: toastId });
        return;
      }

      // Le backend exécute ; on observe. Fermer/recharger ne perd rien.
      toast.loading("L'IA corrige votre copie… (vous pouvez fermer cette fenêtre)", { id: toastId });
      setActiveRedaction({ ...activeRedaction, statut: 'en_cours' });
      setRedactionsList(prev => prev.map(r => r.id === activeRedaction.id ? { ...r, statut: 'en_cours' } : r));
      setDailyUsage(prev => prev + 1);
      setRedactionJobId(res.jobId);
    } catch (err: any) {
      setIsAnalyzing(false);
      toast.error("Erreur système lors du lancement.", { id: toastId });
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar Historique */}
      <div className={styles.sidebar}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Vos Rédactions</h2>
          <Button onClick={() => setIsModalOpen(true)} style={{ padding: '6px 12px', fontSize: '13px' }}>+ Nouveau</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)', overflowY: 'auto' }}>
          {redactionsList.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textAlign: 'center', marginTop: 'var(--spacing-large)' }}>
              Aucune rédaction. Cliquez sur "+ Nouveau" pour commencer.
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
                  setLastSaved(null);
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>{red.titre}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{red.type}</span>
                  <span style={{ fontSize: '12px', color: red.statut === 'analyse' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {red.statut === 'analyse' ? '✅ Analysé' : '📝 Brouillon'}
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
      <div className={styles.editorMain}>
        {activeRedaction ? (
          <>
            <header style={{ marginBottom: 'var(--spacing-standard)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: '0 0 8px 0' }}>{activeRedaction.titre}</h1>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  Type : {activeRedaction.type} | Statut : {activeRedaction.statut}
                  {lastSaved && <span style={{ marginLeft: '16px', color: 'var(--color-success)', fontSize: '12px' }}>💾 Sauvegardé à {lastSaved}</span>}
                  {isSaving && <span style={{ marginLeft: '16px', color: 'var(--color-warning)', fontSize: '12px' }}>⏳ Sauvegarde...</span>}
                </p>
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
                  maxLength={10000}
                  style={{ flex: 1, padding: 'var(--spacing-standard)', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontSize: '15px', resize: 'none', outline: 'none', minHeight: '400px' }}
                  placeholder="Rédigez votre devoir ici..."
                />
                <div style={{ display: 'flex', gap: 'var(--spacing-standard)', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: contenu.length >= 10000 ? 'var(--color-warning)' : 'inherit' }}>
                      {contenu.length} / 10000 caractères
                    </span>
                    {' • '}Sauvegarde automatique toutes les 15 secondes. {contenu.length > 0 && `${contenu.split(/\s+/).filter(Boolean).length} mots`}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={handleSaveDraft} disabled={isSaving}>Enregistrer le brouillon</Button>
                    <Button variant="secondary" onClick={handleSaveVersion}>Créer une version historique</Button>
                    <Button onClick={handleSendForAnalysis} disabled={isAnalyzing} style={{ backgroundColor: '#10b981', color: 'white' }}>
                      {isAnalyzing ? '⏳ Analyse en cours...' : '🔍 Demander analyse IA'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'versions' && (
              <div className={styles.versionContainer}>
                <Card className={styles.versionSidebar}>
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
                      
                      {activeRedaction.rapport_analyse.proposition && (
                        <div style={{ marginTop: 'var(--spacing-large)', paddingTop: 'var(--spacing-large)', borderTop: '2px dashed var(--color-border)' }}>
                          <h3 style={{ color: 'var(--color-primary)', marginBottom: 'var(--spacing-standard)' }}>Proposition du Correcteur</h3>
                          <div style={{ padding: 'var(--spacing-standard)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                            {activeRedaction.type === 'Dissertation' && (
                              <>
                                <div><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Introduction modèle :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.introduction}</p></div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Plan détaillé :</h4>
                                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                    {activeRedaction.rapport_analyse.proposition.plan_detaille?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Conclusion synthétique :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.conclusion}</p></div>
                              </>
                            )}
                            {activeRedaction.type === 'Commentaire d\'arrêt' && (
                              <>
                                <div><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Introduction adaptée :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.introduction}</p></div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Méthode d'analyse :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.methode_analyse}</p></div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Plan détaillé :</h4>
                                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                    {activeRedaction.rapport_analyse.proposition.plan_detaille?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Conclusion :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.conclusion_synthetique}</p></div>
                              </>
                            )}
                            {activeRedaction.type === 'Cas pratique' && (
                              <>
                                <div><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Qualification des faits :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.qualification_faits}</p></div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Problèmes juridiques :</h4>
                                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                    {activeRedaction.rapport_analyse.proposition.problemes_juridiques?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Règles applicables :</h4>
                                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                    {activeRedaction.rapport_analyse.proposition.regles_applicables?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Application au cas :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.application_cas}</p></div>
                                <div style={{ marginTop: '16px' }}><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Conclusion juridique :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.conclusion_juridique}</p></div>
                              </>
                            )}
                            {activeRedaction.type !== 'Dissertation' && activeRedaction.type !== 'Commentaire d\'arrêt' && activeRedaction.type !== 'Cas pratique' && (
                               <div><h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-main)' }}>Piste de correction :</h4><p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{activeRedaction.rapport_analyse.proposition.correction_globale}</p></div>
                            )}
                          </div>
                        </div>
                      )}
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
