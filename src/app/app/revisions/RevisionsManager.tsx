"use client";

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { updateFlashcardReview } from '@/app/actions/ai';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useJob } from '@/lib/hooks/useJob';

export default function RevisionsManager({
  coursList,
  documentsList
}: {
  coursList: any[],
  documentsList: any[]
}) {
  const router = useRouter();

  const [selectedSourceType, setSelectedSourceType] = useState<'cours' | 'document' | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');

  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(10);

  // Observation du job async (le frontend n'attend jamais Gemini).
  const [flashcardsJobId, setFlashcardsJobId] = useState<string | null>(null);
  const flashcardsToastRef = React.useRef<string | undefined>(undefined);
  useJob(flashcardsJobId, {
    onDone: () => {
      setIsGenerating(false);
      setFlashcardsJobId(null);
      toast.success('Flashcards prêtes !', { id: flashcardsToastRef.current });
      fetchFlashcards();
      router.refresh();
    },
    onError: (err) => {
      setIsGenerating(false);
      setFlashcardsJobId(null);
      toast.error(`Échec de la génération : ${err}`, { id: flashcardsToastRef.current });
    },
  });

  // Écoute temps réel
  useEffect(() => {
    const channel = supabase
      .channel('realtime-flashcards-rev')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flashcards' }, (payload) => {
        if (selectedSourceId) fetchFlashcards();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedSourceId]);

  const fetchFlashcards = async () => {
    if (!selectedSourceId) return;
    console.log(`[FLOW 8] Frontend (fetchFlashcards) - Récupération des cartes pour source ID: ${selectedSourceId}`);
    setIsLoadingCards(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // On récupère uniquement les flashcards dont la date de prochaine révision est passée ou égale à maintenant
      let query = supabase.from('flashcards')
        .select('*')
        .eq('user_id', user?.id)
        .eq('statut', 'validated')
        .lte('next_review', new Date().toISOString());

      if (selectedSourceType === 'cours') {
        query = query.eq('cours_id', selectedSourceId);
      } else if (selectedSourceType === 'document') {
        query = query.eq('document_id', selectedSourceId);
      }

      const { data, error } = await query;
      if (error) {
         console.error("[FLOW 8 ERROR] Erreur lors de la récupération :", error);
      } else if (data) {
         console.log(`[FLOW 9] Frontend a récupéré ${data.length} flashcards prêtes à réviser. Mise à jour de l'état.`);
         setFlashcards(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingCards(false);
    }
  };

  useEffect(() => {
    if (selectedSourceId) {
      fetchFlashcards();
    } else {
      setFlashcards([]);
    }
  }, [selectedSourceId, selectedSourceType]);

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) {
      setSelectedSourceType(null);
      setSelectedSourceId('');
      return;
    }
    const [type, id] = val.split('|');
    setSelectedSourceType(type as 'cours' | 'document');
    setSelectedSourceId(id);
  };

  const handleGenerateFlashcards = async () => {
    if (!selectedSourceId || !selectedSourceType) return;
    console.log(`[FLOW 1] Utilisateur clique sur "Générer les Flashcards". Source : ${selectedSourceType} (${selectedSourceId}), Quantité: ${flashcardCount}`);
    setIsGenerating(true);
    let docId = selectedSourceType === 'document' ? selectedSourceId : 'dummy';
    let cId = selectedSourceType === 'cours' ? selectedSourceId : null;
    let docName = "Source sélectionnée";

    if (selectedSourceType === 'document') {
      const doc = documentsList.find(d => d.id === selectedSourceId);
      if (doc) docName = doc.nom;
    } else {
      const c = coursList.find(c => c.id === selectedSourceId);
      if (c) docName = c.titre;
    }

    const toastId = toast.loading('Mise en file de vos flashcards…');
    flashcardsToastRef.current = toastId;
    try {
      const { enqueueAiJob } = await import('@/app/actions/jobs');
      const res: any = await enqueueAiJob('flashcards', {
        documentId: docId,
        coursId: cId,
        documentName: docName,
        count: flashcardCount,
      });

      if (res.error || !res.jobId) {
        setIsGenerating(false);
        toast.error(res.error || "Impossible de lancer la génération.", { id: toastId });
        return;
      }

      // Le backend exécute ; on observe. Fermer/recharger ne perd rien.
      toast.loading("L'IA prépare vos flashcards… (vous pouvez fermer cette fenêtre)", { id: toastId });
      setFlashcardsJobId(res.jobId);
    } catch (err: any) {
      console.error(`[FLASHCARDS] Erreur lancement :`, err);
      setIsGenerating(false);
      toast.error("Erreur système lors du lancement.", { id: toastId });
    }
  };

  // États pour la session
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ mastered: 0, toReview: 0, hard: 0 });
  const [sessionFinished, setSessionFinished] = useState(false);

  const startSession = () => {
    if (flashcards.length === 0) return;
    setIsSessionActive(true);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionStats({ mastered: 0, toReview: 0, hard: 0 });
    setSessionFinished(false);
  };

  const handleEvaluation = (evaluation: 'mastered' | 'toReview' | 'hard') => {
    // Optimistic UI : Mise à jour immédiate de l'interface
    setSessionStats(prev => ({ ...prev, [evaluation]: prev[evaluation] + 1 }));

    if (flashcards[currentIndex]) {
      const cardId = flashcards[currentIndex].id;
      // Appel réseau non bloquant en arrière-plan
      updateFlashcardReview(cardId, evaluation).catch((err) => {
         console.error("Failed to sync flashcard review", err);
         toast.error("Erreur de synchronisation serveur, mais votre progression est conservée.");
      });
    }

    // Passage instantané à la carte suivante
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      setSessionFinished(true);
    }
  };

  const endSession = () => {
    setIsSessionActive(false);
    setSessionFinished(false);
    fetchFlashcards();
  };

  // VUE DE SESSION TERMINÉE
  if (sessionFinished) {
    const total = flashcards.length;
    const successRate = Math.round((sessionStats.mastered / total) * 100);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 'var(--spacing-large)' }}>
        <h1 style={{ fontSize: '32px', color: 'var(--color-text-main)' }}>Session Terminée ! ??</h1>
        <Card style={{ padding: 'var(--spacing-large)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)', minWidth: '400px' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Bilan de la session</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Cartes révisées</span>
            <span style={{ fontWeight: 'bold' }}>{total}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Taux de maîtrise</span>
            <span style={{ fontWeight: 'bold', color: 'var(--color-success)' }}>{successRate}%</span>
          </div>
        </Card>
        <Button onClick={endSession} style={{ padding: '12px 32px', fontSize: '16px' }}>Retour</Button>
      </div>
    );
  }

  // VUE DE SESSION ACTIVE
  if (isSessionActive) {
    const card = flashcards[currentIndex];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '600px', margin: '0 auto', gap: 'var(--spacing-large)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button variant="secondary" onClick={endSession}>Quitter</Button>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Carte {currentIndex + 1} / {flashcards.length}</span>
        </div>
        <div onClick={() => setIsFlipped(!isFlipped)} style={{ width: '100%', height: '400px', perspective: '1000px', cursor: 'pointer' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', textAlign: 'center', transition: 'transform 0.6s', transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <Card style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-large)', fontSize: '24px', fontWeight: 500 }}>
              {card.question}
            </Card>
            <Card style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-large)', fontSize: '20px', backgroundColor: 'var(--color-bg-secondary)', border: '2px solid var(--color-primary)', transform: 'rotateY(180deg)', overflowY: 'auto' }}>
              <span style={{ color: 'var(--color-primary)', fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>RÉPONSE</span>
              {card.reponse}
            </Card>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-standard)', width: '100%', opacity: isFlipped ? 1 : 0, pointerEvents: isFlipped ? 'auto' : 'none' }}>
          <Button onClick={() => handleEvaluation('hard')} style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none' }}>Difficile</Button>
          <Button onClick={() => handleEvaluation('toReview')} style={{ flex: 1, backgroundColor: '#f59e0b', color: 'white', border: 'none' }}>À revoir</Button>
          <Button onClick={() => handleEvaluation('mastered')} style={{ flex: 1, backgroundColor: '#10b981', color: 'white', border: 'none' }}>Maîtrisé</Button>
        </div>
      </div>
    );
  }

  // VUE PAR DÉFAUT (Sélection)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Apprentissage Actif (Révision)</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>
          Sélectionnez un Cours ou un Document pour réviser vos flashcards.
        </p>
      </header>

      <Card style={{ padding: 'var(--spacing-large)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <label style={{ fontWeight: 600 }}>Source d'apprentissage (Obligatoire)</label>
          <select
            onChange={handleSourceChange}
            value={selectedSourceId ? `${selectedSourceType}|${selectedSourceId}` : ''}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '16px' }}
          >
            <option value="">-- Sélectionnez une source --</option>
            <optgroup label="Vos Cours">
              {coursList.map(c => <option key={c.id} value={`cours|${c.id}`}>{c.titre}</option>)}
            </optgroup>
            <optgroup label="Vos Documents (PDF)">
              {documentsList.map(d => <option key={d.id} value={`document|${d.id}`}>{d.nom}</option>)}
            </optgroup>
          </select>
        </div>

        {
    selectedSourceId && (
      <div style={{ marginTop: 'var(--spacing-large)', paddingTop: 'var(--spacing-large)', borderTop: '1px solid var(--color-border)' }}>
        {isLoadingCards ? (
          <p>Chargement des flashcards...</p>
        ) : flashcards.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-standard)' }}>
            <div style={{ fontSize: '48px' }}>???</div>
            <h3 style={{ margin: 0 }}>{flashcards.length} Flashcards prêtes</h3>
            <Button onClick={startSession} style={{ backgroundColor: '#6366f1', fontSize: '18px', padding: '16px 32px' }}>
              ? Démarrer la session
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-standard)', textAlign: 'center' }}>
            <span style={{ fontSize: '32px' }}>??</span>
            <p>Aucune flashcard n'existe pour cette source.</p>
            <div style={{ display: 'flex', gap: 'var(--spacing-small)', alignItems: 'center' }}>
              <label htmlFor="count-select">Nombre :</label>
              <select 
                id="count-select"
                value={flashcardCount} 
                onChange={(e) => setFlashcardCount(Number(e.target.value))}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
            <Button onClick={handleGenerateFlashcards} disabled={isGenerating} style={{ backgroundColor: '#10b981' }}>
              {isGenerating ? 'Génération en cours...' : '? Générer des Flashcards'}
            </Button>
          </div>
        )}
      </div>
    )
  }
      </Card >
    </div >
  );
}

