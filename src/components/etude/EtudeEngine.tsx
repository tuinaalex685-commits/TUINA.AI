"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import styles from './EtudeEngine.module.css';

export default function EtudeEngine({ 
  pdfId, 
  coursId, 
  initialState, 
  sections, 
  themes 
}: any) {
  const router = useRouter();
  const [loading, setLoading] = useState(!coursId);
  const [error, setError] = useState('');
  const [isQueued, setIsQueued] = useState(false);
  const [pollingCoursId, setPollingCoursId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // Nouveau state pour la barre de progression
  
  // State Machine logic simplified for the MVP
  // states: 'synthese' | 'explication' | 'question_forme' | 'cas_pratique' | 'cloture'
  const [currentSectionIdx, setCurrentSectionIdx] = useState(initialState?.sectionIdx || 0);
  const [currentThemeIdx, setCurrentThemeIdx] = useState(initialState?.themeIdx || 0);
  const [currentClotureIdx, setCurrentClotureIdx] = useState(0);
  const [step, setStep] = useState(initialState?.step || 'synthese');
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [remediation, setRemediation] = useState<string | null>(null);

  // Nouveaux états pour le cas pratique interactif
  const [userPratiqueAnswer, setUserPratiqueAnswer] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pratiqueFeedback, setPratiqueFeedback] = useState<{correct: boolean, explication: string} | null>(null);
  const [dynamicCas, setDynamicCas] = useState<any>(null); // Pour stocker un nouveau cas généré par l'IA

  // Mettre à jour l'étape ou le thème réinitialise les états dynamiques
  useEffect(() => {
    setDynamicCas(null);
    setUserPratiqueAnswer("");
    setPratiqueFeedback(null);
  }, [currentThemeIdx, step]);

  // Helper to get current objects
  const currentSection = sections?.[currentSectionIdx];
  const sectionThemes = themes?.filter((t: any) => t.section_id === currentSection?.id)?.sort((a:any, b:any) => a.ordre - b.ordre);
  const currentTheme = sectionThemes?.[currentThemeIdx];

  // Helper pour obtenir le cas actif (celui de base, ou celui généré par l'IA)
  const activeCas = dynamicCas || (currentTheme?.cas_pratique_fond);

  // Helper pour normaliser les chaines (gérer la ponctuation IA)
  const normalize = (s?: string) => s?.trim().toLowerCase().replace(/[.,!?;:]/g, "") || "";

  // Animation de la barre de progression (0 à 95% en ~90s pour correspondre au temps réel de l'IA)
  useEffect(() => {
    let progressInterval: any;
    if (loading) {
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev; 
          // 1% toutes les 950ms = ~90s pour atteindre 95%
          return prev + 1; 
        });
      }, 950);
    }
    return () => clearInterval(progressInterval);
  }, [loading]);

  useEffect(() => {
    if (!coursId && !pollingCoursId) {
      // Trigger generation
      generateCourse();
    }
  }, [coursId]);

  // Bugfix React: Cacher le chargement dès que Next.js reçoit les données (suite à router.refresh())
  useEffect(() => {
    if (coursId && sections && sections.length > 0) {
      setLoading(false);
      setIsQueued(false);
    }
  }, [coursId, sections]);

  // Realtime + Polling Fallback
  useEffect(() => {
    let interval: any;
    let channel: any;
    
    if (pollingCoursId) {
      // ABONNEMENT REALTIME POUR LA MISE À JOUR AUTOMATIQUE DU STATUT(Mise à jour instantanée)
      channel = supabase.channel(`etude_cours_${pollingCoursId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'etude_cours', filter: `id=eq.${pollingCoursId}` },
          (payload) => {
            if (payload.new.statut_generation === 'pret') {
              console.log("[Realtime] Cours généré avec succès !");
              router.refresh();
            } else if (payload.new.statut_generation === 'erreur') {
              setError("Erreur lors de la génération. Veuillez réessayer.");
              setLoading(false);
              setIsQueued(false);
            }
          }
        )
        .subscribe();

      // 2. FALLBACK POLLING (Toutes les 10s au lieu de 5s, en cas de perte WebSocket)
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/etude/status?coursId=${pollingCoursId}`);
          const data = await res.json();
          if (data.success && data.status === 'pret') {
            router.refresh();
          } else if (data.status === 'erreur') {
            setError("Erreur lors de la génération. Veuillez réessayer.");
            setLoading(false);
            setIsQueued(false);
          }
        } catch (err) {}
      }, 10000); 
    }
    
    return () => {
      if (interval) clearInterval(interval);
      if (channel) channel.unsubscribe();
    };
  }, [pollingCoursId, router]);

  const generateCourse = async (force: boolean = false) => {
    try {
      setLoading(true);
      setError('');
      setIsQueued(true);
      const res = await fetch('/api/etude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: pdfId, force })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération");
      
      if (data.status === 'pret') {
        router.refresh();
      } else {
        setPollingCoursId(data.coursId);
        // FORCE WAKEUP du Worker Asynchrone (Fire-And-Forget)
        // Ceci garantit que le Worker démarre même si la fonction `after()` de Vercel/Next.js échoue silencieusement.
        fetch('/api/worker/process', { method: 'POST' }).catch(e => console.log('Worker trigger silently failed:', e));
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setIsQueued(false);
    }
  };

  const saveProgress = (action: string, payloadData: any) => {
    if (coursId) {
      fetch('/api/etude/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          coursId, 
          sectionId: currentSection?.id, 
          themeId: currentTheme?.id,
          data: payloadData 
        })
      }).catch(console.error);
    }
  };

  const submitPratiqueEvaluation = async () => {
    if (!userPratiqueAnswer.trim() || !activeCas) return;
    setIsEvaluating(true);
    setPratiqueFeedback(null);

    try {
      const res = await fetch('/api/etude/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeTitre: currentTheme?.titre,
          themeExplication: currentTheme?.explication,
          situation: activeCas.situation,
          question: activeCas.question,
          expectedAnswer: activeCas.reponse_attendue_ou_choix,
          userAnswer: userPratiqueAnswer
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'évaluation");

      setPratiqueFeedback({ correct: data.correct, explication: data.explication });

      if (data.correct) {
        saveProgress('update_theme', { fond_valide: true });
      } else {
        saveProgress('update_theme', { increments: { tentative_fond: 1 } });
        if (data.nouveau_cas) {
          // On garde le nouveau cas en mémoire, l'utilisateur cliquera sur "Réessayer avec un nouveau cas" pour l'afficher
          setDynamicCas(data.nouveau_cas);
        }
      }
    } catch (err: any) {
      console.error(err);
      setPratiqueFeedback({ correct: false, explication: "Une erreur est survenue lors de l'évaluation. Veuillez réessayer." });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextStep = async () => {
    setRemediation(null);
    setSelectedAnswer(null);
    setShowFeedback(false);

    if (step === 'synthese') {
      saveProgress('update_section', { etat: 'themes_en_cours' });
      setStep('explication');
    } else if (step === 'explication') {
      setStep('question_forme');
    } else if (step === 'question_forme') {
      setStep('cas_pratique');
    } else if (step === 'cas_pratique') {
      // Theme finished
      if (currentThemeIdx < sectionThemes.length - 1) {
        setCurrentThemeIdx(currentThemeIdx + 1);
        setStep('explication');
      } else {
        setStep('cloture');
      }
    } else if (step === 'cloture') {
      if (currentClotureIdx < (currentSection?.questions_cloture?.length || 0)) {
        setCurrentClotureIdx(currentClotureIdx + 1);
        return; 
      }
      // Section completed
      saveProgress('update_section', { etat: 'cloture_reussie' });
      setStep('fin_section');
    } else if (step === 'fin_section') {
      if (currentSectionIdx < sections.length - 1) {
        setCurrentSectionIdx(currentSectionIdx + 1);
        setCurrentThemeIdx(0);
        setCurrentClotureIdx(0);
        setStep('synthese');
        saveProgress('update_section', { etat: 'synthese_vue' }); // Optionnel, mais sécurise la reprise
      } else {
        setStep('fin_cours');
        saveProgress('start_cours', { statut: 'termine' });
      }
    }
  };

  const handleAnswer = async (answer: string) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    
    let isCorrect = false;
    let remediationText = "";

    if (step === 'question_forme') {
      isCorrect = normalize(answer) === normalize(currentTheme.question_forme.reponse_correcte);
      if (!isCorrect && currentTheme.remediation_forme?.length > 0) {
        remediationText = currentTheme.remediation_forme[0].reexplication;
      }
    } else if (step === 'cas_pratique') {
      isCorrect = normalize(answer) === normalize(currentTheme.cas_pratique_fond.reponse_attendue_ou_choix);
      if (!isCorrect && currentTheme.remediation_fond?.length > 0) {
        remediationText = currentTheme.remediation_fond[0].reexplication;
      }
    } else if (step === 'cloture') {
      isCorrect = normalize(answer) === normalize(currentSection.questions_cloture[currentClotureIdx]?.reponse_correcte);
    }

    setShowFeedback(true);

    if (!isCorrect) {
      setRemediation(remediationText || "Ce n'est pas la bonne réponse. Relisez attentivement le concept.");
      
      saveProgress('update_theme', { 
        increments: { 
          tentative_forme: step === 'question_forme' ? 1 : 0,
          tentative_fond: step === 'cas_pratique' ? 1 : 0
        } 
      });
    } else {
      // Si correct
      if (step === 'question_forme') saveProgress('update_theme', { forme_validee: true });
      if (step === 'cloture') {
        // Optionnel : enregistrer la progression de la cloture, mais ici la section entière sera validée à la fin
      }
    }
  };

  if (loading) {
    return (
      <div className={styles.engineContainer}>
        <div className={styles.loaderContainer}>
          <div style={{ textAlign: 'center', marginBottom: 20, width: '100%', maxWidth: '400px' }}>
            <div style={{ 
              width: '100%', height: '16px', 
              background: 'var(--color-bg-secondary, rgba(0,0,0,0.05))', borderRadius: '8px', 
              overflow: 'hidden', margin: '10px auto',
              border: '1px solid var(--color-border)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
            }}>
              <div style={{ 
                width: `${progress}%`, height: '100%', 
                background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)', 
                transition: 'width 0.3s ease', borderRadius: '8px' 
              }} />
            </div>
            <p style={{ fontSize: '24px', color: 'var(--color-text-main)', fontWeight: 800, margin: '12px 0' }}>{progress}%</p>
          </div>
          <p className={styles.loadingText} style={{ fontSize: '18px', lineHeight: '1.6' }}>
            {progress < 20 && <><b>Étape 1/4 :</b> Connexion au moteur d'intelligence juridique...<br/><span style={{fontSize: '14px', opacity: 0.7}}>Veuillez patienter, cela peut prendre un instant.</span></>}
            {progress >= 20 && progress < 50 && <><b>Étape 2/4 :</b> Analyse approfondie de votre document...<br/><span style={{fontSize: '14px', opacity: 0.7}}>Extraction des concepts clés et des pièges.</span></>}
            {progress >= 50 && progress < 80 && <><b>Étape 3/4 :</b> Élaboration de la stratégie pédagogique...<br/><span style={{fontSize: '14px', opacity: 0.7}}>Création des questions de forme et de fond.</span></>}
            {progress >= 80 && <><b>Étape 4/4 :</b> Finalisation et assemblage de votre cours interactif...<br/><span style={{fontSize: '14px', opacity: 0.7}}>Encore quelques secondes, l'affichage sera automatique.</span></>}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.engineContainer}>
        <div className={styles.card}>
          <h2 className={styles.title} style={{ color: '#FF3232' }}>Erreur de génération</h2>
          <p className={styles.content}>{error}</p>
          <button className={styles.primaryBtn} onClick={() => generateCourse(true)}>Réessayer</button>
        </div>
      </div>
    );
  }

  if (!currentSection) return <div>Cours terminé ou introuvable.</div>;

  return (
    <div className={styles.engineContainer}>
      
      {/* SECTION SYNTHESE */}
      {step === 'synthese' && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagSynthese}`}>Introduction de Section</span>
          <h2 className={styles.title}>{currentSection.titre}</h2>
          <p className={styles.content}>{currentSection.synthese}</p>
          <button className={styles.primaryBtn} onClick={handleNextStep}>Démarrer l&apos;étude</button>
        </div>
      )}

      {/* EXPLICATION DU THEME */}
      {step === 'explication' && currentTheme && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagExplication}`}>Explication du concept</span>
          <h2 className={styles.title}>{currentTheme.titre}</h2>
          <p className={styles.content}>{currentTheme.explication}</p>
          <button className={styles.primaryBtn} onClick={handleNextStep}>J&apos;ai compris, on teste !</button>
        </div>
      )}

      {/* QUESTION DE FORME (Definition) */}
      {step === 'question_forme' && currentTheme && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagQuestion}`}>Vérification (Concept)</span>
          <h2 className={styles.title}>{currentTheme.question_forme.question}</h2>
          
          <div className={styles.optionsGrid}>
            {currentTheme.question_forme.choix.map((choix: string, i: number) => {
              const isSelected = selectedAnswer === choix;
              const isCorrect = normalize(choix) === normalize(currentTheme.question_forme.reponse_correcte);
              let btnClass = styles.optionBtn;
              
              if (showFeedback) {
                if (isCorrect) btnClass += ` ${styles.correct}`;
                else if (isSelected) btnClass += ` ${styles.incorrect}`;
              } else if (isSelected) {
                btnClass += ` ${styles.selected}`;
              }

              return (
                <button 
                  key={i} 
                  disabled={showFeedback}
                  className={btnClass}
                  onClick={() => handleAnswer(choix)}
                >
                  {choix}
                </button>
              );
            })}
          </div>

          {showFeedback && (
            <div className={styles.feedbackBox}>
              {(selectedAnswer && normalize(selectedAnswer) === normalize(currentTheme.question_forme.reponse_correcte)) ? (
                <>
                  <p className={styles.feedbackTitle} style={{color: '#00C864'}}>Excellent !</p>
                  <button className={styles.primaryBtn} onClick={handleNextStep}>Passer à la pratique</button>
                </>
              ) : (
                <>
                  <p className={styles.feedbackTitle} style={{color: '#FF3232'}}>Aïe, pas tout à fait.</p>
                  <p className={styles.content} style={{marginBottom: 16}}>{remediation}</p>
                  <button className={styles.primaryBtn} onClick={() => {setShowFeedback(false); setSelectedAnswer(null);}}>Réessayer la question</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* CAS PRATIQUE (Fond) */}
      {step === 'cas_pratique' && currentTheme && activeCas && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagCasPratique}`}>Mise en Situation (Pratique)</span>
          <p className={styles.content} style={{ fontStyle: 'italic', background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
            {activeCas.situation}
          </p>
          <h2 className={styles.title} style={{ fontSize: 22 }}>{activeCas.question}</h2>
          
          {!pratiqueFeedback && (
            <div style={{ marginTop: 20 }}>
              <textarea 
                value={userPratiqueAnswer}
                onChange={(e) => setUserPratiqueAnswer(e.target.value)}
                placeholder="Rédigez votre réponse ici (l'IA évaluera votre compréhension)..."
                disabled={isEvaluating}
                style={{ 
                  width: '100%', minHeight: 120, padding: 16, 
                  borderRadius: 8, border: '1px solid var(--color-border)', 
                  background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)',
                  fontSize: 16, fontFamily: 'inherit', resize: 'vertical'
                }}
              />
              <button 
                className={styles.primaryBtn} 
                style={{ marginTop: 16, opacity: (!userPratiqueAnswer.trim() || isEvaluating) ? 0.5 : 1 }}
                disabled={!userPratiqueAnswer.trim() || isEvaluating}
                onClick={submitPratiqueEvaluation}
              >
                {isEvaluating ? "L'IA analyse votre réponse..." : "Soumettre à l'IA"}
              </button>
            </div>
          )}

          {pratiqueFeedback && (
            <div className={styles.feedbackBox} style={{ marginTop: 24 }}>
              <p className={styles.feedbackTitle} style={{ color: pratiqueFeedback.correct ? '#00C864' : '#FF3232' }}>
                {pratiqueFeedback.correct ? "Excellent ! L'IA valide." : "Pas tout à fait correct..."}
              </p>
              <p className={styles.content}>{pratiqueFeedback.explication}</p>
              
              {pratiqueFeedback.correct ? (
                <button className={styles.primaryBtn} style={{ marginTop: 16 }} onClick={handleNextStep}>
                  Continuer
                </button>
              ) : (
                <button className={styles.primaryBtn} style={{ marginTop: 16, background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' }} onClick={() => {
                  setUserPratiqueAnswer("");
                  setPratiqueFeedback(null);
                  // Si l'IA a généré un nouveau cas, il est déjà dans dynamicCas (grâce à useEffect ou au setState dans submitPratiqueEvaluation)
                }}>
                  {dynamicCas && dynamicCas.situation !== currentTheme.cas_pratique_fond.situation 
                    ? "Réessayer avec un nouveau cas" 
                    : "Réessayer cette question"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CLOTURE DE SECTION */}
      {step === 'cloture' && currentSection && currentSection.questions_cloture && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagSynthese}`}>Validation Finale (Section)</span>
          
          {currentClotureIdx < currentSection.questions_cloture.length ? (
            <>
              <h2 className={styles.title}>{currentSection.questions_cloture[currentClotureIdx].question}</h2>
              
              <div className={styles.optionsGrid}>
                {currentSection.questions_cloture[currentClotureIdx].choix.map((choix: string, i: number) => {
                  const isSelected = selectedAnswer === choix;
                  const isCorrect = normalize(choix) === normalize(currentSection.questions_cloture[currentClotureIdx].reponse_correcte);
                  let btnClass = styles.optionBtn;
                  
                  if (showFeedback) {
                    if (isCorrect) btnClass += ` ${styles.correct}`;
                    else if (isSelected) btnClass += ` ${styles.incorrect}`;
                  } else if (isSelected) {
                    btnClass += ` ${styles.selected}`;
                  }

                  return (
                    <button 
                      key={i} 
                      disabled={showFeedback}
                      className={btnClass}
                      onClick={() => handleAnswer(choix)}
                    >
                      {choix}
                    </button>
                  );
                })}
              </div>

              {showFeedback && (
                <div className={styles.feedbackBox}>
                  {(selectedAnswer && normalize(selectedAnswer) === normalize(currentSection.questions_cloture[currentClotureIdx].reponse_correcte)) ? (
                    <>
                      <p className={styles.feedbackTitle} style={{color: '#00C864'}}>Correct !</p>
                      <button className={styles.primaryBtn} onClick={handleNextStep}>Question suivante</button>
                    </>
                  ) : (
                    <>
                      <p className={styles.feedbackTitle} style={{color: '#FF3232'}}>Incorrect</p>
                      <p className={styles.content} style={{marginBottom: 16}}>Relisez bien la question et réessayez pour valider la section.</p>
                      <button className={styles.primaryBtn} onClick={() => {setShowFeedback(false); setSelectedAnswer(null);}}>Réessayer</button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className={styles.title}>Bravo, section validée ! 🎉</h2>
              <p className={styles.content}>Vous maîtrisez désormais tous les concepts de cette partie.</p>
              <button className={styles.primaryBtn} onClick={handleNextStep}>Continuer vers la suite</button>
            </>
          )}
        </div>
      )}

      {/* FIN DE SECTION (Transition) */}
      {step === 'fin_section' && currentSection && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagSynthese}`} style={{background: '#00C864', color: '#fff'}}>Section Validée !</span>
          <h2 className={styles.title}>Bravo, vous avez maîtrisé cette section.</h2>
          <p className={styles.content}>
            Vous venez de consolider vos connaissances sur le thème : <strong>{currentSection.titre}</strong>.
          </p>
          <div className={styles.feedbackBox}>
            <p className={styles.feedbackTitle}>Synthèse :</p>
            <p className={styles.content}>{currentSection.synthese}</p>
          </div>
          
          <button className={styles.primaryBtn} onClick={handleNextStep}>
            {currentSectionIdx < sections.length - 1 ? "Passer à la section suivante" : "Terminer le cours"}
          </button>
        </div>
      )}

      {/* FIN DE COURS */}
      {step === 'fin_cours' && (
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '64px', display: 'block', marginBottom: '24px' }}>🏆</span>
          <h2 className={styles.title}>Cours terminé avec succès !</h2>
          <p className={styles.content}>Vous avez parcouru et validé l'intégralité de ce document.</p>
          
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '32px' }}>
            <button className={styles.primaryBtn} onClick={() => router.push('/app/revisions')} style={{ background: '#7C5CFF' }}>
              Aller aux Révisions (Flashcards)
            </button>
            <button className={styles.primaryBtn} onClick={() => router.push('/app/evaluations')} style={{ background: '#0070F3' }}>
              Passer une Évaluation
            </button>
          </div>
          
          <button style={{ marginTop: '24px', background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => router.push('/app/etude')}>
            Retour à la liste des cours
          </button>
        </div>
      )}

    </div>
  );
}
