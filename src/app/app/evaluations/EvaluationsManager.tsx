"use client";

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { updateEvaluationScore } from '@/app/actions/student';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function EvaluationsManager({ initialQuiz, documentList }: { initialQuiz: any[], documentList: any[] }) {
  const router = useRouter();

  const [quizList, setQuizList] = useState<any[]>(initialQuiz);

  // L'abonnement Realtime a été supprimé pour économiser les WebSockets (Scalabilité SaaS).
  // La synchronisation se fait désormais via router.refresh() (RSC) après chaque action (Génération/Validation).

  useEffect(() => {
    setQuizList(initialQuiz);
  }, [initialQuiz]);

  // --- GÉNÉRATION D'ÉVALUATION ---
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedType, setSelectedType] = useState<'qcm' | 'quiz' | 'vrai_faux' | 'juridique'>('qcm');
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Cleanup on unmount to prevent memory leaks in Vercel
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!selectedDocumentId) {
      toast.error("Veuillez sélectionner un PDF avant de générer l'évaluation.");
      return;
    }
    setIsGenerating(true);
    let count = 10;
    if (selectedType === 'qcm') count = 20; // max 20
    else count = 15; // max 15 pour quiz, etc.

    const documentName = documentList.find(d => d.id === selectedDocumentId)?.nom || '';

    try {
      const toastId = toast.loading('Création de l\'évaluation en cours...');
      // Memory leak prevention: cancel previous request if still running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Appel sécurisé au backend (qui valide les limites, appelle l'IA et insère en base)
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          documentName,
          documentId: selectedDocumentId,
          type: selectedType,
          count
        })
      });

      if (!response.body) throw new Error("Pas de flux de réponse");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = "";

      // Lecture du stream
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          fullText += decoder.decode(value, { stream: true });
        }
      }
      
      // On s'assure d'avoir tout décodé
      fullText += decoder.decode();

      // Tentative de parsing
      let questionsJson;
      try {
        let cleanedText = fullText.trim();
        if (cleanedText.startsWith('```json')) cleanedText = cleanedText.slice(7);
        else if (cleanedText.startsWith('```')) cleanedText = cleanedText.slice(3);
        if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);
        
        questionsJson = JSON.parse(cleanedText.trim());
        
        if (questionsJson.error) {
          throw new Error(questionsJson.error);
        }

        // Si le JSON est un objet au lieu d'un tableau (ex: { questions: [...] })
        if (questionsJson && typeof questionsJson === 'object' && !Array.isArray(questionsJson)) {
          if (Array.isArray(questionsJson.questions)) {
            questionsJson = questionsJson.questions;
          } else if (Array.isArray(questionsJson.quiz)) {
            questionsJson = questionsJson.quiz;
          } else {
            questionsJson = [questionsJson];
          }
        }
      } catch (parseError: any) {
        setIsGenerating(false);
        if (parseError.name === 'AbortError') {
           console.log("Génération annulée par l'utilisateur.");
           toast.dismiss(toastId);
           return;
        }
        toast.error(`Erreur de format renvoyé par l'IA.`, { id: toastId });
        return;
      }

      // Insertion en base via la nouvelle action rapide
      const { saveEvaluationAction } = await import('@/app/actions/ai');
      const saveRes = await saveEvaluationAction({
        type: selectedType,
        meta_type: selectedType,
        titre: `Évaluation - ${documentName || 'Document'}`,
        questions: questionsJson,
        document_id: selectedDocumentId
      });

      setIsGenerating(false);

      if (saveRes.error) {
        console.error(`[EVAL ERROR] Erreur sauvegarde BDD :`, saveRes.error);
        toast.error(`Erreur de sauvegarde: ${saveRes.error}`, { id: toastId });
      } else {
        toast.success(`Évaluation prête !`, { id: toastId });
        router.refresh();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Génération annulée par l'utilisateur.");
      } else {
        toast.error("Erreur système ou délai dépassé.");
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Grouping (Optimisation React avec useMemo)
  const { myQCM, myQuiz, myVraiFaux, myJuridique } = React.useMemo(() => {
    return {
      myQCM: quizList.filter(q => q.meta_type === 'qcm' || (q.type === 'qcm' && !q.meta_type)),
      myQuiz: quizList.filter(q => q.meta_type === 'quiz' || (q.type === 'quiz' && !q.meta_type)),
      myVraiFaux: quizList.filter(q => q.meta_type === 'vrai_faux'),
      myJuridique: quizList.filter(q => q.meta_type === 'juridique')
    };
  }, [quizList]);

  // États pour la session
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);
  const [score, setScore] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [responses, setResponses] = useState<any[]>([]);

  const startSession = async (quiz: any) => {
    if (!quiz.questions) {
      const toastId = toast.loading("Chargement des questions...");
      try {
        const { data, error } = await supabase.from('evaluations').select('questions').eq('id', quiz.id).single();
        if (error || !data?.questions) throw new Error();
        quiz.questions = data.questions;
        toast.dismiss(toastId);
      } catch (e) {
        toast.error("Erreur lors du chargement des questions.", { id: toastId });
        return;
      }
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      alert("Ce quiz ne contient aucune question.");
      return;
    }
    setActiveSession(quiz);
    setCurrentIndex(0);
    setScore(0);
    setResponses([]);
    setSessionFinished(false);
    setShowCorrection(false);
    setSelectedOption(null);
    setOpenAnswer('');
  };

  const handleValidation = () => {
    const question = activeSession.questions[currentIndex];
    const type = activeSession.meta_type || activeSession.type;

    let isCorrect = false;

    if (type === 'qcm' || type === 'vrai_faux') {
      if (selectedOption === null) return;
      const correctText = question.options[question.correctAnswer];
      isCorrect = selectedOption === correctText;
    } else {
      if (!openAnswer.trim()) return;
      // Simulation simple pour les questions ouvertes (en vrai l'IA analyserait)
      isCorrect = true; // on accorde le point pour la forme
    }

    if (isCorrect) setScore(prev => prev + 1);

    setResponses(prev => [...prev, {
      questionId: question.id,
      userAnswer: (type === 'qcm' || type === 'vrai_faux') ? selectedOption : openAnswer,
      isCorrect
    }]);

    setShowCorrection(true);
  };

  const handleNext = async () => {
    setShowCorrection(false);
    setSelectedOption(null);
    setOpenAnswer('');

    if (currentIndex < activeSession.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSessionFinished(true);
      const finalScore = responses.filter(r => r.isCorrect).length;
      await updateEvaluationScore(activeSession.id, finalScore);
      router.refresh();
    }
  };

  const endSession = () => {
    setActiveSession(null);
    setSessionFinished(false);
  };

  // VUE DE SESSION TERMINÉE
  if (sessionFinished && activeSession) {
    const total = activeSession.questions.length;
    const finalScore = responses.filter(r => r.isCorrect).length;
    const successRate = Math.round((finalScore / total) * 100);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 'var(--spacing-standard)', gap: 'var(--spacing-large)', width: '100%' }}>
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', color: 'var(--color-text-main)', textAlign: 'center', margin: 0 }}>Évaluation Terminée ! 🎉</h1>
        <Card style={{ padding: 'var(--spacing-large)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)', width: '100%', maxWidth: '400px', boxSizing: 'border-box' }}>
          <h2 style={{ margin: 0, textAlign: 'center', fontSize: '18px' }}>{activeSession.titre}</h2>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '64px', fontWeight: 'bold', color: successRate >= 50 ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {finalScore} / {total}
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '18px' }}>({successRate}%)</div>
          </div>
        </Card>
        <Button onClick={endSession} style={{ padding: '12px 32px', fontSize: '16px' }}>Retour</Button>
      </div>
    );
  }

  // VUE DE SESSION ACTIVE
  if (activeSession) {
    // Sécurisation anti-crash au cas où le tableau est mal formaté dans la BDD
    let questionsList: any[] = [];
    if (Array.isArray(activeSession.questions)) {
      questionsList = activeSession.questions;
    } else if (activeSession.questions && typeof activeSession.questions === 'object') {
      if (Array.isArray(activeSession.questions.questions)) questionsList = activeSession.questions.questions;
      else if (Array.isArray(activeSession.questions.quiz)) questionsList = activeSession.questions.quiz;
      else questionsList = [activeSession.questions];
    }
    
    const question = questionsList[currentIndex];
    
    if (!question) {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <h2>Erreur de lecture du quiz</h2>
          <p>Les questions n&apos;ont pas pu être chargées correctement.</p>
          <Button onClick={endSession}>Retour</Button>
        </div>
      );
    }

    const type = activeSession.meta_type || activeSession.type;
    const isOptionsBased = type === 'qcm' || type === 'vrai_faux';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', gap: 'var(--spacing-large)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button variant="secondary" onClick={() => setActiveSession(null)}>Quitter</Button>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Question {currentIndex + 1} / {questionsList.length}</span>
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Score : {score}</span>
        </div>

        <Card style={{ padding: 'var(--spacing-large)' }}>
          <h2 style={{ fontSize: '22px', marginBottom: 'var(--spacing-large)' }}>{question.question || "Question sans titre"}</h2>

          {isOptionsBased ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(question.options || []).map((opt: string, idx: number) => {
                const isSelected = selectedOption === opt;
                let bgStyle = isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--color-bg-secondary)';
                let borderStyle = isSelected ? '2px solid var(--color-primary)' : '2px solid transparent';
                const correctText = question.options && question.correctAnswer !== undefined ? question.options[question.correctAnswer] : undefined;

                if (showCorrection) {
                  if (correctText && opt === correctText) { bgStyle = 'rgba(16, 185, 129, 0.1)'; borderStyle = '2px solid #10b981'; }
                  else if (isSelected && opt !== correctText) { bgStyle = 'rgba(239, 68, 68, 0.1)'; borderStyle = '2px solid #ef4444'; }
                }

                return (
                  <div key={idx} onClick={() => !showCorrection && setSelectedOption(opt)} style={{ padding: '16px', borderRadius: '8px', backgroundColor: bgStyle, border: borderStyle, cursor: showCorrection ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: isSelected ? '6px solid var(--color-primary)' : '2px solid var(--color-border)' }} />
                    <span style={{ fontSize: '16px' }}>{opt}</span>
                    {showCorrection && opt === correctText && <span style={{ marginLeft: 'auto' }}>?</span>}
                    {showCorrection && isSelected && opt !== correctText && <span style={{ marginLeft: 'auto' }}>?</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea value={openAnswer} onChange={e => setOpenAnswer(e.target.value)} disabled={showCorrection} placeholder="Rédigez votre réponse détaillée..." style={{ width: '100%', height: '150px', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontSize: '16px', resize: 'vertical' }} />
              {showCorrection && (
                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#10b981' }}>Éléments de réponse attendus :</h4>
                  <p style={{ margin: 0 }}>{question.expectedAnswer}</p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--spacing-large)' }}>
            {!showCorrection ? (
              <Button onClick={handleValidation} disabled={isOptionsBased ? !selectedOption : !openAnswer.trim()} style={{ padding: '12px 24px', backgroundColor: '#f59e0b', color: 'white' }}>Valider</Button>
            ) : (
              <Button onClick={handleNext} style={{ padding: '12px 24px' }}>{currentIndex < activeSession.questions.length - 1 ? 'Question suivante ??' : 'Terminer ??'}</Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Composant Helper pour rendre les listes de quiz
  const renderQuizGrid = (title: string, list: any[]) => {
    if (list.length === 0) return null;
    return (
      <section>
        <h2 style={{ fontSize: '20px', marginBottom: 'var(--spacing-standard)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>{title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--spacing-standard)' }}>
          {list.map(quiz => (
            <Card key={quiz.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 var(--spacing-small)', color: 'var(--color-text-main)' }}>{quiz.titre}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  <span>?? Généré le {new Date(quiz.created_at).toLocaleDateString()}</span>
                  <span>? {quiz.questions?.length || 0} Questions</span>
                </div>
              </div>
              <Button style={{ marginTop: 'var(--spacing-standard)', width: '100%', backgroundColor: '#6366f1' }} onClick={() => startSession(quiz)}>
                ? Lancer
              </Button>
            </Card>
          ))}
        </div>
      </section>
    );
  };

  // VUE PAR DÉFAUT (Liste)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Vos Évaluations</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>
          Testez vos connaissances avec des QCM, Quiz, Vrai/Faux et Cas juridiques générés par l'IA.
        </p>
      </header>

      <Card style={{ padding: 'var(--spacing-large)', border: '2px solid var(--color-primary)' }}>
        <h2 style={{ margin: '0 0 var(--spacing-standard)', fontSize: '18px' }}>Générer une nouvelle évaluation</h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-standard)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Source du document (Obligatoire)</label>
            <select
              value={selectedDocumentId}
              onChange={e => setSelectedDocumentId(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            >
              <option value="">-- Sélectionnez un PDF --</option>
              {documentList.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Type d'évaluation</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as any)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            >
              <option value="qcm">QCM (Max 20)</option>
              <option value="quiz">Questions Ouvertes (Max 15)</option>
              <option value="vrai_faux">Vrai ou Faux (Max 15)</option>
              <option value="juridique">Cas Pratiques Juridiques (Max 15)</option>
            </select>
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating || !selectedDocumentId} style={{ padding: '12px 24px', backgroundColor: '#10b981' }}>
            {isGenerating ? 'Génération IA en cours...' : '? Générer l\'évaluation'}
          </Button>
        </div>
      </Card>

      {quizList.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--spacing-large)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', marginBottom: 'var(--spacing-small)' }}>?</span>
          <h3>Aucun quiz disponible.</h3>
          <p>Utilisez le formulaire ci-dessus pour générer votre première évaluation à partir d'un cours.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
          {renderQuizGrid("Mes QCM (Choix Multiples)", myQCM)}
          {renderQuizGrid("Mes Quiz (Questions Ouvertes)", myQuiz)}
          {renderQuizGrid("Mes Vrai/Faux", myVraiFaux)}
          {renderQuizGrid("Mes Cas Juridiques", myJuridique)}
        </div>
      )}
    </div>
  );
}

