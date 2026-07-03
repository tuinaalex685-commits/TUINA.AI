"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  
  // State Machine logic simplified for the MVP
  // states: 'synthese' | 'explication' | 'question_forme' | 'cas_pratique' | 'cloture'
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [currentThemeIdx, setCurrentThemeIdx] = useState(0);
  const [step, setStep] = useState('synthese');
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [remediation, setRemediation] = useState<string | null>(null);

  // Helper to get current objects
  const currentSection = sections?.[currentSectionIdx];
  const sectionThemes = themes?.filter((t: any) => t.section_id === currentSection?.id)?.sort((a:any, b:any) => a.ordre - b.ordre);
  const currentTheme = sectionThemes?.[currentThemeIdx];

  useEffect(() => {
    if (!coursId) {
      // Trigger generation
      generateCourse();
    }
  }, [coursId]);

  const generateCourse = async () => {
    try {
      const res = await fetch('/api/etude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: pdfId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération");
      
      // Generation done, reload page to get server data
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleNextStep = async () => {
    setRemediation(null);
    setSelectedAnswer(null);
    setShowFeedback(false);

    if (step === 'synthese') {
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
      // Section finished
      if (currentSectionIdx < sections.length - 1) {
        setCurrentSectionIdx(currentSectionIdx + 1);
        setCurrentThemeIdx(0);
        setStep('synthese');
      } else {
        router.push('/app/etude');
      }
    }
    
    // Save progress async
    if (coursId) {
      fetch('/api/etude/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update_section', 
          sectionId: currentSection?.id, 
          data: { etat: step } 
        })
      }).catch(console.error);
    }
  };

  const handleAnswer = async (answer: string) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    
    let isCorrect = false;
    let remediationText = "";

    if (step === 'question_forme') {
      isCorrect = answer === currentTheme.question_forme.reponse_correcte;
      if (!isCorrect && currentTheme.remediation_forme?.length > 0) {
        remediationText = currentTheme.remediation_forme[0].reexplication;
      }
    } else if (step === 'cas_pratique') {
      isCorrect = answer === currentTheme.cas_pratique_fond.reponse_attendue_ou_choix;
      if (!isCorrect && currentTheme.remediation_fond?.length > 0) {
        remediationText = currentTheme.remediation_fond[0].reexplication;
      }
    } else if (step === 'cloture') {
      isCorrect = answer === currentSection.questions_cloture[0]?.reponse_correcte;
    }

    setShowFeedback(true);

    if (!isCorrect) {
      setRemediation(remediationText || "Ce n'est pas la bonne réponse. Relisez attentivement le concept.");
      
      // Update progress with attempt increment
      fetch('/api/etude/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update_theme', 
          themeId: currentTheme?.id, 
          data: { 
            increments: { 
              tentative_forme: step === 'question_forme' ? 1 : 0,
              tentative_fond: step === 'cas_pratique' ? 1 : 0
            } 
          } 
        })
      }).catch(console.error);
    }
  };

  if (loading) {
    return (
      <div className={styles.engineContainer}>
        <div className={styles.loaderContainer}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>
            L&apos;IA découpe, analyse et prépare votre cours...<br/>
            Cette étape peut prendre jusqu&apos;à 30 secondes, mais n&apos;est faite qu&apos;une seule fois !
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
          <button className={styles.primaryBtn} onClick={() => window.location.reload()}>Réessayer</button>
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
              const isCorrect = choix === currentTheme.question_forme.reponse_correcte;
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
              {selectedAnswer === currentTheme.question_forme.reponse_correcte ? (
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
      {step === 'cas_pratique' && currentTheme && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagCasPratique}`}>Mise en Situation (Pratique)</span>
          <p className={styles.content} style={{ fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8 }}>
            {currentTheme.cas_pratique_fond.situation}
          </p>
          <h2 className={styles.title} style={{ fontSize: 22 }}>{currentTheme.cas_pratique_fond.question}</h2>
          
          {/* S'il n'y a pas de choix générés, on affiche une réponse attendue ou on simule des choix. Pour le MVP, on suppose que l'IA peut fournir des choix via reponse_attendue_ou_choix si adapté. */}
          <div className={styles.feedbackBox}>
            <p className={styles.feedbackTitle}>Réponse attendue par l&apos;IA :</p>
            <p className={styles.content}>{currentTheme.cas_pratique_fond.reponse_attendue_ou_choix}</p>
            <p style={{marginBottom: 16, fontSize: 14, color: 'var(--text-muted)'}}>Avez-vous répondu correctement dans votre tête ou sur brouillon ?</p>
            <div style={{display: 'flex', gap: 12}}>
              <button className={styles.primaryBtn} style={{background: '#00C864', color: '#000'}} onClick={handleNextStep}>Oui, j&apos;avais bon !</button>
              <button className={styles.primaryBtn} style={{background: 'rgba(255,255,255,0.1)'}} onClick={() => setRemediation(currentTheme.remediation_fond?.[0]?.reexplication || "Lisez bien l'application.")}>Non, j&apos;ai fait erreur</button>
            </div>
            
            {remediation && (
              <div style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                <p className={styles.content}>{remediation}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLOTURE */}
      {step === 'cloture' && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagSynthese}`}>Fin de la section</span>
          <h2 className={styles.title}>Bravo, section validée !</h2>
          <p className={styles.content}>Vous maîtrisez désormais tous les concepts de cette partie.</p>
          <button className={styles.primaryBtn} onClick={handleNextStep}>Continuer</button>
        </div>
      )}

    </div>
  );
}
