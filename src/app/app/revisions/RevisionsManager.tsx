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
  documentSources,
  premium,
  revisionsUsed,
  revisionsQuota,
}: {
  coursList: any[],
  documentSources: { documentId: string; titre: string; source: 'perso' | 'catalogue'; matiere: string | null }[],
  premium: boolean,
  revisionsUsed: number,
  revisionsQuota: number,
}) {
  const router = useRouter();

  const [selectedSourceType, setSelectedSourceType] = useState<'cours' | 'document' | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');

  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(10);

  // Compteur de quota : valeur serveur au chargement, puis ajustée à chaque session
  // ouverte pour que l'étudiant voie son solde bouger sans recharger la page.
  const [used, setUsed] = useState(revisionsUsed);
  const restantes = Math.max(revisionsQuota - used, 0);
  const quotaEpuise = !premium && restantes === 0;

  const persoSources = documentSources.filter((d) => d.source === 'perso');
  const catalogueSources = documentSources.filter((d) => d.source === 'catalogue');

  // Observation du job async (le frontend n'attend jamais Gemini).
  const [flashcardsJobId, setFlashcardsJobId] = useState<string | null>(null);
  const flashcardsToastRef = React.useRef<string | undefined>(undefined);
  useJob(flashcardsJobId, {
    onDone: () => {
      setIsGenerating(false);
      setFlashcardsJobId(null);
      toast.success('Flashcards prêtes !', { id: flashcardsToastRef.current });
      refreshDueCount();
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
        if (selectedSourceId) refreshDueCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedSourceId]);

  /**
   * Combien de cartes sont prêtes — comptage seul, aucun crédit consommé.
   *
   * Les cartes elles-mêmes ne sont plus lues ici : elles arrivent du serveur au
   * démarrage de la session. C'est ce qui rend le quota incontournable — tant que
   * le navigateur pouvait lire la table directement, il suffisait de ne jamais
   * déclarer de session pour réviser sans limite.
   */
  const refreshDueCount = async () => {
    if (!selectedSourceId || !selectedSourceType) return;
    setIsLoadingCards(true);
    try {
      const { countDueCards } = await import('@/app/actions/revision');
      const res: any = await countDueCards({ type: selectedSourceType, id: selectedSourceId });
      setDueCount(res?.count ?? 0);
    } catch (err) {
      console.error(err);
      setDueCount(0);
    } finally {
      setIsLoadingCards(false);
    }
  };

  useEffect(() => {
    if (selectedSourceId) {
      refreshDueCount();
    } else {
      setFlashcards([]);
      setDueCount(0);
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
      const doc = documentSources.find(d => d.documentId === selectedSourceId);
      if (doc) docName = doc.titre;
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

  /**
   * Ouvre la session côté serveur : c'est là que le crédit est consommé et que les
   * cartes sont réellement délivrées. Un clic = une session, quel que soit le nombre
   * de cartes qu'elle contient.
   */
  const startSession = async () => {
    if (!selectedSourceId || !selectedSourceType || isStarting) return;
    setIsStarting(true);
    try {
      const { startRevisionSession } = await import('@/app/actions/revision');
      const res: any = await startRevisionSession({ type: selectedSourceType, id: selectedSourceId });

      if (res?.error) {
        toast.error(res.error);
        if (res.quotaReached) setUsed(res.quota);
        return;
      }
      if (res?.empty) {
        toast('Aucune carte à réviser pour le moment — reviens plus tard.');
        setDueCount(0);
        return;
      }

      setFlashcards(res.cards);
      if (typeof res.used === 'number') setUsed(res.used);
      setIsSessionActive(true);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionStats({ mastered: 0, toReview: 0, hard: 0 });
      setSessionFinished(false);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de démarrer la session.");
    } finally {
      setIsStarting(false);
    }
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
    setFlashcards([]);
    refreshDueCount();
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
            {catalogueSources.length > 0 && (
              <optgroup label="Catalogue SJP">
                {catalogueSources.map(d => (
                  <option key={d.documentId} value={`document|${d.documentId}`}>
                    {d.titre}{d.matiere ? ` — ${d.matiere}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {coursList.length > 0 && (
              <optgroup label="Vos Cours">
                {coursList.map(c => <option key={c.id} value={`cours|${c.id}`}>{c.titre}</option>)}
              </optgroup>
            )}
            {persoSources.length > 0 && (
              <optgroup label="Vos Documents (PDF)">
                {persoSources.map(d => <option key={d.documentId} value={`document|${d.documentId}`}>{d.titre}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {
    selectedSourceId && (
      <div style={{ marginTop: 'var(--spacing-large)', paddingTop: 'var(--spacing-large)', borderTop: '1px solid var(--color-border)' }}>
        {isLoadingCards ? (
          <p>Chargement des flashcards...</p>
        ) : dueCount > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-standard)' }}>
            <h3 style={{ margin: 0 }}>{dueCount} flashcard{dueCount > 1 ? 's' : ''} prête{dueCount > 1 ? 's' : ''}</h3>
            <Button
              onClick={startSession}
              disabled={isStarting || quotaEpuise}
              style={{ backgroundColor: quotaEpuise ? '#9ca3af' : '#6366f1', fontSize: '18px', padding: '16px 32px' }}
            >
              {isStarting ? 'Ouverture…' : 'Démarrer la session'}
            </Button>
            {!premium && (
              quotaEpuise ? (
                <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Tu as atteint tes {revisionsQuota} révisions gratuites aujourd'hui.
                  </p>
                  <p style={{ margin: '4px 0 12px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                    Tes crédits reviennent demain — ou passe au Premium pour réviser sans limite.
                  </p>
                  <a href="/#pricing" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                    Passer au Premium — 2 500 FCFA/mois
                  </a>
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {restantes} révision{restantes > 1 ? 's' : ''} restante{restantes > 1 ? 's' : ''} aujourd'hui
                </span>
              )
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-standard)', textAlign: 'center' }}>
            <p>Aucune flashcard n'existe encore pour cette source.</p>
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
              {isGenerating ? 'Génération en cours...' : 'Générer des Flashcards'}
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

