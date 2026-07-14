"use client";

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EtudeLoadingScreenProps {
  progress: number;          // progression RÉELLE du backend (0-100)
  phase?: string | null;     // libellé de phase émis par le worker (facultatif)
  status?: string | null;    // statut canonique du job (facultatif)
}

// 6 phases affichées, alignées sur la progression RÉELLE du backend (pending→processing→generating→saving).
const PHASES = [
  { label: 'Préparation', sub: 'Initialisation du moteur pédagogique…', min: 0 },
  { label: 'Analyse du PDF', sub: 'Lecture et structuration de votre document…', min: 22 },
  { label: 'Compréhension du contenu', sub: 'Repérage des notions clés et des pièges d’examen…', min: 42 },
  { label: 'Construction du cours', sub: 'Découpage en sections cohérentes et progressives…', min: 62 },
  { label: 'Création des thèmes', sub: 'Questions, cas pratiques et remédiations sur mesure…', min: 82 },
  { label: 'Finalisation', sub: 'Enregistrement de votre cours…', min: 94 },
];

const TIPS = [
  '💡 Méthodo : en cas pratique, qualifie toujours les faits AVANT d’appliquer la règle (le syllogisme fait la note).',
  '⚖️ Le sais-tu ? La distinction obligation de moyens / de résultat détermine à qui revient la charge de la preuve.',
  '📚 Conseil : relis la synthèse de chaque section avant d’attaquer les thèmes — ta mémorisation en dépend.',
  '🎯 À l’examen, un plan apparent et équilibré (I/II, A/B) rapporte des points même avant le fond.',
  '🧠 Répétition espacée : revoir une notion à J+1, J+3 puis J+7 multiplie la rétention par 2 à 3.',
  '✍️ Une introduction de dissertation se rédige au brouillon EN DERNIER, une fois le plan trouvé.',
  '⏱️ Gère ton temps : en cas pratique, ~1/3 du temps pour qualifier, 2/3 pour appliquer et conclure.',
  '🔍 Traque les exceptions : c’est souvent là que se cachent les pièges et les meilleurs points.',
];

export default function EtudeLoadingScreen({ progress, phase }: EtudeLoadingScreenProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  // Phase courante déduite de la progression réelle.
  const stepIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < PHASES.length; i++) if (pct >= PHASES[i].min) idx = i;
    return idx;
  }, [pct]);
  const current = PHASES[stepIndex];

  // Estimation du temps restant : compte à rebours depuis ~110s (durée moyenne mesurée), borné.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const EST_TOTAL = 110;
  const remaining = Math.max(0, EST_TOTAL - elapsed);
  const remainingLabel = pct >= 94 ? 'Presque terminé…' : remaining > 0 ? `~${remaining}s restantes` : 'Encore quelques instants…';

  // Rotation des astuces.
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div style={{
      position: 'relative', width: '100%', minHeight: 620, display: 'flex', alignItems: 'center',
      justifyContent: 'center', overflow: 'hidden', borderRadius: 16, background: 'var(--color-bg-main, #0f172a)',
      padding: '24px'
    }}>
      {/* Orbes animés */}
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.18, 0.35, 0.18] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          position: 'relative', zIndex: 10, width: '100%', maxWidth: 560, padding: '36px 32px', borderRadius: 24,
          background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
        }}>

        {/* Anneau de progression RÉELLE */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
            <motion.circle cx="60" cy="60" r={R} fill="none" stroke="url(#g)" strokeWidth={7} strokeLinecap="round"
              strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C - (C * pct) / 100 }}
              transition={{ duration: 0.6, ease: 'easeOut' }} style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" /><stop offset="50%" stopColor="#a855f7" /><stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{remainingLabel}</span>
          </div>
        </div>

        {/* Badge + libellé de phase (réel) */}
        <div style={{ padding: '6px 16px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
          Étape {stepIndex + 1}/{PHASES.length}
        </div>
        <div style={{ minHeight: 64 }}>
          <AnimatePresence mode="wait">
            <motion.div key={stepIndex} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#f8fafc' }}>{phase || current.label}</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>{current.sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Timeline des 6 phases */}
        <div style={{ display: 'flex', gap: 6, width: '100%', margin: '22px 0 20px' }}>
          {PHASES.map((p, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', height: 4, borderRadius: 4, background: i < stepIndex ? '#a855f7' : i === stepIndex ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.08)', transition: 'background 0.4s' }} />
              <span style={{ fontSize: 9, color: i <= stepIndex ? '#c4b5fd' : '#64748b', fontWeight: i === stepIndex ? 700 : 500, textAlign: 'center', lineHeight: 1.2 }}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Message rassurant : génération unique */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', marginBottom: 16, width: '100%' }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>✅</span>
          <p style={{ margin: 0, fontSize: 12.5, color: '#86efac', textAlign: 'left', lineHeight: 1.5 }}>
            Cette analyse approfondie n’a lieu qu’<strong>une seule fois pour ce PDF</strong>. Vos prochains accès à ce cours seront <strong>instantanés</strong>. Inutile de rafraîchir la page — l’affichage est automatique.
          </p>
        </div>

        {/* Astuce rotative */}
        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', width: '100%' }}>
          <AnimatePresence mode="wait">
            <motion.p key={tip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
              style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, textAlign: 'center' }}>
              {TIPS[tip]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Points pulsants "ça travaille" */}
        <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
          {[0, 1, 2].map((i) => (
            <motion.span key={i} animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
