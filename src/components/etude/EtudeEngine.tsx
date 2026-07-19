"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './EtudeEngine.module.css';
import EtudeLoadingScreen from './EtudeLoadingScreen';
import EtudeMarkdown from './EtudeMarkdown';
import { useJob } from '@/lib/hooks/useJob';
import { getAmorce, buildCloze, clozeOk, matchRemediation, buildExpliqueAutrement } from '@/lib/etude/pedagogy';

export default function EtudeEngine({
  pdfId,
  coursId,
  initialState,
  sections,
  themes,
  intelligence
}: any) {
  const router = useRouter();
  const [loading, setLoading] = useState(!coursId);
  const [error, setError] = useState('');
  const [isQueued, setIsQueued] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const detectedPretRef = React.useRef(false);

  // Observation du job de génération = SOURCE DE VÉRITÉ backend (polling). Complétion et erreur
  // increvables : plus aucune dépendance à la propagation des props React (cause des blocages à 95%).
  const job = useJob(jobId, {
    onDone: () => {
      if (detectedPretRef.current) return;
      detectedPretRef.current = true;
      setProgress(100);
      setTimeout(() => window.location.reload(), 300); // page.tsx re-rend le cours (etude_cours prêt)
    },
    onError: (e: string) => {
      setError(e || 'Erreur lors de la génération. Veuillez réessayer.');
      setLoading(false);
      setIsQueued(false);
    },
  });
  
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

  // États des paliers d'apprentissage (EG.2a) — participation active, jamais notée.
  const [amorceRevealed, setAmorceRevealed] = useState(false); // P0 : dévoiler l'explication après anticipation
  const [clozeInput, setClozeInput] = useState('');            // P1 : saisie du terme-clé
  const [clozeRevealed, setClozeRevealed] = useState(false);   // P1 : révélation du terme
  const [casEtape, setCasEtape] = useState(0);                 // P3 : 0 qualifier, 1 règle, 2 répondre
  const [qualifierVu, setQualifierVu] = useState(false);       // P3 : notion en jeu révélée
  const [revoirExplication, setRevoirExplication] = useState(false); // P3 : re-voir l'explication
  const [indiceVu, setIndiceVu] = useState(false);             // P3 : indice (remediation_fond) révélé
  const [aideOuverte, setAideOuverte] = useState(false);       // EG.2b : panneau « Explore autrement »
  const [reexIndex, setReexIndex] = useState(0);               // EG.2b : angle de ré-explication courant
  const [aideContenu, setAideContenu] = useState<{ titre: string; texte: string } | null>(null);

  // Mettre à jour l'étape ou le thème réinitialise les états dynamiques
  useEffect(() => {
    setDynamicCas(null);
    setUserPratiqueAnswer("");
    setPratiqueFeedback(null);
    setAmorceRevealed(false);
    setClozeInput('');
    setClozeRevealed(false);
    setCasEtape(0);
    setQualifierVu(false);
    setRevoirExplication(false);
    setIndiceVu(false);
    setAideOuverte(false);
    setReexIndex(0);
    setAideContenu(null);
  }, [currentThemeIdx, step]);

  // Helper to get current objects
  const currentSection = sections?.[currentSectionIdx];
  const sectionThemes = themes?.filter((t: any) => t.section_id === currentSection?.id)?.sort((a:any, b:any) => a.ordre - b.ordre);
  const currentTheme = sectionThemes?.[currentThemeIdx];

  // Helper pour obtenir le cas actif (celui de base, ou celui généré par l'IA)
  const activeCas = dynamicCas || (currentTheme?.cas_pratique_fond);

  // Paliers dérivés du contenu déjà généré (déterministe, 0 appel IA).
  const amorce = currentTheme ? getAmorce(currentTheme.explication) : null; // P0
  const cloze = currentTheme ? buildCloze(currentTheme.explication) : null; // P1
  // EG.2b — angles « Explique autrement » (remédiations + intelligence du cours, déjà générés).
  const angles = currentTheme ? buildExpliqueAutrement(currentTheme, intelligence) : { reexplications: [], confusions: [], exceptions: [], examen: [] };
  const aTotalAngles = angles.reexplications.length + angles.confusions.length + angles.exceptions.length + angles.examen.length;
  const montrerAutreAngle = () => {
    if (reexIndex < angles.reexplications.length) {
      setAideContenu({ titre: 'Vu autrement', texte: angles.reexplications[reexIndex] });
      setReexIndex(reexIndex + 1);
    } else {
      setAideContenu({ titre: 'Tu l’as vu sous tous ses angles 🎯', texte: 'Le mieux maintenant, c’est d’avancer et de t’entraîner — l’Examen te dira où tu brilles déjà.' });
    }
  };
  const chipStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 20, border: '1px solid var(--color-border)', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', cursor: 'pointer', fontSize: 13, fontWeight: 600 };

  // Helper pour normaliser les chaines (gérer la ponctuation IA)
  const normalize = (s?: string) => s?.trim().toLowerCase().replace(/[.,!?;:]/g, "") || "";

  // Barre de progression PILOTÉE PAR LA PROGRESSION RÉELLE du job (backend), avec un léger lissage
  // borné par la phase courante (pending/processing/generating/saving). Elle ne peut jamais rester
  // figée : à la complétion RÉELLE, useJob déclenche onDone → reload. Plus de barre factice.
  const ceilingForStatus = (s?: string | null) =>
    s === 'saving' ? 97 : s === 'generating' ? 80 : s === 'processing' ? 40 : s === 'pending' ? 20 : 15;
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setProgress(prev => {
        const target = Math.max(prev, job.progress || 0);
        const ceil = ceilingForStatus(job.status);
        return target < ceil ? Math.min(ceil, target + 1) : target;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [loading, job.progress, job.status]);

  // Déclenchement UNIQUE de la génération quand le cours n'est pas encore prêt.
  const startedGenRef = React.useRef(false);
  useEffect(() => {
    if (!coursId && !startedGenRef.current) { startedGenRef.current = true; generateCourse(); }
  }, [coursId]);

  // Dès que les sections arrivent (après reload), on bascule sur l'affichage du cours.
  useEffect(() => {
    if (coursId && sections && sections.length > 0) {
      setLoading(false);
      setIsQueued(false);
    }
  }, [coursId, sections]);

  const generateCourse = async (force: boolean = false) => {
    try {
      detectedPretRef.current = false;
      setLoading(true);
      setError('');
      setIsQueued(true);
      const tClick = Date.now();
      console.log(`[ETUDE ${new Date().toISOString()}] Clic Générer → POST /api/etude/generate (force=${force})`);
      const res = await fetch('/api/etude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: pdfId, force })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération");
      console.log(`[ETUDE ${new Date().toISOString()}] generate répond en ${Date.now() - tClick}ms: status=${data.status}, jobId=${data.jobId}`);

      // Déjà prêt (cours existant OU aucun job nécessaire) → on affiche immédiatement via reload.
      if (data.status === 'completed' || data.status === 'pret' || !data.jobId) {
        if (!detectedPretRef.current) {
          detectedPretRef.current = true;
          setProgress(100);
          setTimeout(() => window.location.reload(), 300);
        }
      } else {
        // Observation du job (source de vérité backend). useJob → onDone/onError.
        // Le worker est déjà déclenché côté serveur par /api/etude/generate (avec le secret) + le cron,
        // et /api/jobs/[id] le relance sur 'pending' → pas de poke client (endpoint worker protégé).
        setJobId(data.jobId);
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
      if (!isCorrect) {
        // Remédiation CIBLÉE sur l'option choisie (déjà générée), avec repli bienveillant.
        remediationText = matchRemediation(currentTheme.remediation_forme, answer)
          || "Regarde à nouveau : la bonne réponse découle du concept que tu viens de lire.";
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
        <EtudeLoadingScreen progress={progress} phase={job.phase} status={job.status} />
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
          <EtudeMarkdown className={styles.content}>{currentSection.synthese}</EtudeMarkdown>
          <button className={styles.primaryBtn} onClick={handleNextStep}>Démarrer l&apos;étude</button>
        </div>
      )}

      {/* COMPRENDRE (P0 Amorcer + P1 Récupérer) */}
      {step === 'explication' && currentTheme && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagExplication}`}>Comprendre</span>
          <h2 className={styles.title}>{currentTheme.titre}</h2>

          {/* P0 — Amorcer : anticiper AVANT de dévoiler la règle (participation active) */}
          {!amorceRevealed ? (
            <>
              {amorce && (
                <p className={styles.content} style={{ fontStyle: 'italic', background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
                  {amorce}
                </p>
              )}
              <p className={styles.content} style={{ marginTop: 12 }}>Avant de lire : à ton avis, que dit le droit ici ?</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <button className={styles.primaryBtn} onClick={() => setAmorceRevealed(true)}>J&apos;ai une idée 💭</button>
                <button className={styles.primaryBtn} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' }} onClick={() => setAmorceRevealed(true)}>Découvrons ensemble 👀</button>
              </div>
            </>
          ) : (
            <>
              <EtudeMarkdown className={styles.content}>{currentTheme.explication}</EtudeMarkdown>

              {/* EG.2b — « Explique autrement » : angles déjà générés, à la demande (0 appel IA) */}
              {aTotalAngles > 0 && (
                <div style={{ marginTop: 16 }}>
                  {!aideOuverte ? (
                    <button className={styles.primaryBtn} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' }} onClick={() => setAideOuverte(true)}>
                      🤔 Pas clair ? Explore autrement
                    </button>
                  ) : (
                    <div className={styles.feedbackBox}>
                      <p className={styles.feedbackTitle}>Explore autrement</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: aideContenu ? 12 : 0 }}>
                        {angles.reexplications.length > 0 && (
                          <button style={chipStyle} onClick={montrerAutreAngle}>✨ Explique-moi autrement</button>
                        )}
                        {angles.confusions.length > 0 && (
                          <button style={chipStyle} onClick={() => setAideContenu({ titre: '🔀 À ne pas confondre', texte: angles.confusions.join('  ·  ') })}>À ne pas confondre</button>
                        )}
                        {angles.exceptions.length > 0 && (
                          <button style={chipStyle} onClick={() => setAideContenu({ titre: '🚫 Les exceptions', texte: angles.exceptions.join('  ·  ') })}>Les exceptions</button>
                        )}
                        {angles.examen.length > 0 && (
                          <button style={chipStyle} onClick={() => setAideContenu({ titre: '🎯 Ça tombe à l’examen', texte: angles.examen.join('  ·  ') })}>À l’examen</button>
                        )}
                      </div>
                      {aideContenu && (
                        <div style={{ padding: 12, borderRadius: 8, background: 'var(--color-bg-main)', border: '1px solid var(--color-border)' }}>
                          <p style={{ fontWeight: 700, margin: '0 0 6px', color: 'var(--color-text-main)' }}>{aideContenu.titre}</p>
                          <p className={styles.content} style={{ margin: 0 }}>{aideContenu.texte}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* P1 — Comprendre en récupérant : rappel actif du terme-clé (cloze) */}
              {cloze && !clozeRevealed ? (
                <div className={styles.feedbackBox} style={{ marginTop: 8 }}>
                  <p className={styles.feedbackTitle}>Le mot juste, tu l&apos;as ?</p>
                  <p className={styles.content} style={{ marginBottom: 12 }}>{cloze.contexte}</p>
                  <input
                    value={clozeInput}
                    onChange={(e) => setClozeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setClozeRevealed(true); }}
                    placeholder="Le terme manquant…"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', fontSize: 16 }}
                  />
                  <button className={styles.primaryBtn} style={{ marginTop: 12 }} onClick={() => setClozeRevealed(true)}>Voir le mot</button>
                </div>
              ) : (
                <>
                  {cloze && clozeRevealed && (
                    <div className={styles.feedbackBox} style={{ marginTop: 8 }}>
                      <p className={styles.content}>
                        {clozeOk(clozeInput, cloze.reponse) ? '✅ Exactement — ' : 'Le mot juste : '}
                        <strong>{cloze.reponse}</strong>
                      </p>
                    </div>
                  )}
                  <button className={styles.primaryBtn} style={{ marginTop: 16 }} onClick={handleNextStep}>Continuer</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* RECONNAÎTRE LE PIÈGE (P2) */}
      {step === 'question_forme' && currentTheme && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagQuestion}`}>Repérons le piège ensemble</span>
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
                  <p className={styles.feedbackTitle} style={{color: '#00C864'}}>Bien vu ! 🎯</p>
                  <button className={styles.primaryBtn} onClick={handleNextStep}>Passer à la pratique</button>
                </>
              ) : (
                <>
                  <p className={styles.feedbackTitle} style={{color: 'var(--color-primary)'}}>Bonne piste — voici la subtilité :</p>
                  <p className={styles.content} style={{marginBottom: 16}}>{remediation}</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button className={styles.primaryBtn} onClick={handleNextStep}>J&apos;ai compris, on continue</button>
                    <button className={styles.primaryBtn} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' }} onClick={() => {setShowFeedback(false); setSelectedAnswer(null);}}>Réessayer</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* CAS PRATIQUE (Fond) */}
      {step === 'cas_pratique' && currentTheme && activeCas && (
        <div className={styles.card}>
          <span className={`${styles.tag} ${styles.tagCasPratique}`}>Mets-le en pratique</span>
          <p className={styles.content} style={{ fontStyle: 'italic', background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
            {activeCas.situation}
          </p>

          {/* P3 — Appliquer par étapes : on gravit le cas (qualifier → règle → conclure) */}
          {!pratiqueFeedback && casEtape < 2 && (
            <div className={styles.feedbackBox} style={{ marginTop: 8 }}>
              {casEtape === 0 ? (
                <>
                  <p className={styles.feedbackTitle}>Étape 1 · Qualifier</p>
                  <p className={styles.content} style={{ marginBottom: 12 }}>De quoi parle cette situation ? Quelle notion de ce thème est en jeu ?</p>
                  {!qualifierVu ? (
                    <button className={styles.primaryBtn} onClick={() => setQualifierVu(true)}>Voir la notion en jeu</button>
                  ) : (
                    <>
                      <p className={styles.content} style={{ marginBottom: 12 }}>👉 Ici, il s&apos;agit de : <strong>{currentTheme.titre}</strong>.</p>
                      <button className={styles.primaryBtn} onClick={() => setCasEtape(1)}>Étape suivante</button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className={styles.feedbackTitle}>Étape 2 · La règle</p>
                  <p className={styles.content} style={{ marginBottom: 12 }}>Quelle règle as-tu retenue pour trancher ce genre de situation ?</p>
                  <button
                    className={styles.primaryBtn}
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)', marginBottom: 12 }}
                    onClick={() => setRevoirExplication((v) => !v)}
                  >
                    {revoirExplication ? "Masquer l'explication" : "Revoir l'explication"}
                  </button>
                  {revoirExplication && (
                    <div style={{ marginBottom: 12 }}><EtudeMarkdown className={styles.content}>{currentTheme.explication}</EtudeMarkdown></div>
                  )}
                  <div><button className={styles.primaryBtn} onClick={() => setCasEtape(2)}>J&apos;ai la règle, je réponds</button></div>
                </>
              )}
            </div>
          )}

          {/* Étape 3 — Conclure : la réponse complète (évaluation IA existante, inchangée) */}
          {!pratiqueFeedback && casEtape === 2 && (
            <div style={{ marginTop: 20 }}>
              <h2 className={styles.title} style={{ fontSize: 22 }}>{activeCas.question}</h2>
              <textarea
                value={userPratiqueAnswer}
                onChange={(e) => setUserPratiqueAnswer(e.target.value)}
                placeholder="Rédige ta réponse ici — pense à qualifier, citer la règle, puis conclure…"
                disabled={isEvaluating}
                style={{
                  width: '100%', minHeight: 120, padding: 16,
                  borderRadius: 8, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)',
                  fontSize: 16, fontFamily: 'inherit', resize: 'vertical'
                }}
              />
              {currentTheme.remediation_fond?.length > 0 && (
                indiceVu ? (
                  <p className={styles.content} style={{ marginTop: 12, background: 'var(--color-bg-secondary)', padding: 12, borderRadius: 8 }}>
                    💡 {currentTheme.remediation_fond[0].reexplication}
                  </p>
                ) : (
                  <button className={styles.primaryBtn} style={{ marginTop: 12, background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' }} onClick={() => setIndiceVu(true)}>
                    Besoin d&apos;un indice ?
                  </button>
                )
              )}
              <div>
                <button
                  className={styles.primaryBtn}
                  style={{ marginTop: 16, opacity: (!userPratiqueAnswer.trim() || isEvaluating) ? 0.5 : 1 }}
                  disabled={!userPratiqueAnswer.trim() || isEvaluating}
                  onClick={submitPratiqueEvaluation}
                >
                  {isEvaluating ? "L'IA analyse ta réponse…" : "Soumettre ma réponse"}
                </button>
              </div>
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
