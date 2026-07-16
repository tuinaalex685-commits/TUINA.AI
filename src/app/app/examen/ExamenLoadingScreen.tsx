"use client";

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  progress: number;        // progression RÉELLE du backend (0-100)
  phase?: string | null;   // libellé de phase émis par le worker
  done?: boolean;          // true → état de succès (bascule instantanée)
}

// Phases alignées sur la progression réelle (processing → generating → saving).
const PHASES = [
  { label: 'Préparation', sub: 'Initialisation du générateur d’examen…', min: 0 },
  { label: 'Analyse du cours', sub: 'Lecture des thèmes et repérage des pièges d’examen…', min: 25 },
  { label: 'Création des questions', sub: 'QCM, vrai/faux, textes à trous, associations, classements…', min: 45 },
  { label: 'Équilibrage', sub: 'Répartition par thème et par niveau de difficulté…', min: 70 },
  { label: 'Finalisation', sub: 'Enregistrement de votre banque d’examen…', min: 90 },
];

const TIPS = [
  '🎯 Aucune aide pendant l’épreuve : c’est un vrai entraînement en conditions d’examen.',
  '💾 Tes réponses sont sauvegardées automatiquement — tu peux fermer, tu retrouveras tout.',
  '⚖️ La note est pondérée : une question difficile rapporte plus qu’un simple vrai/faux.',
  '📊 À la fin, tu verras exactement quels thèmes sont acquis et lesquels retravailler.',
  '🔁 L’examen adaptatif ciblera ensuite tes points faibles, sans jamais oublier le reste.',
  '⏱️ Un chrono s’affiche pendant l’examen : gère ton temps comme le jour J.',
];

export default function ExamenLoadingScreen({ progress, phase, done }: Props) {
  const pct = done ? 100 : Math.max(0, Math.min(99, Math.round(progress)));

  const stepIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < PHASES.length; i++) if (pct >= PHASES[i].min) idx = i;
    return idx;
  }, [pct]);
  const current = PHASES[stepIndex];

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [done]);
  const EST_TOTAL = 60;
  const remaining = Math.max(0, EST_TOTAL - elapsed);
  const remainingLabel = done ? 'Terminé !' : pct >= 90 ? 'Presque prêt…' : remaining > 0 ? `~${remaining}s restantes` : 'Encore un instant…';

  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', background: 'rgba(8,11,24,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 20,
      }}>
      {/* Orbes animés */}
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.20) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.18, 0.35, 0.18] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.20) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'relative', zIndex: 10, width: '100%', maxWidth: 540, padding: '36px 32px', borderRadius: 24,
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        }}>

        {/* Anneau de progression RÉELLE (vire au vert au succès) */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
            <motion.circle cx="60" cy="60" r={R} fill="none" stroke={done ? '#22c55e' : 'url(#eg)'} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={C} animate={{ strokeDashoffset: C - (C * pct) / 100 }} transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
            <defs>
              <linearGradient id="eg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" /><stop offset="50%" stopColor="#a855f7" /><stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <AnimatePresence mode="wait">
              {done ? (
                <motion.span key="ok" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ fontSize: 40, lineHeight: 1 }}>✅</motion.span>
              ) : (
                <motion.span key="pct" exit={{ opacity: 0 }} style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</motion.span>
              )}
            </AnimatePresence>
            <span style={{ fontSize: 11, color: done ? '#86efac' : '#94a3b8', marginTop: 4 }}>{remainingLabel}</span>
          </div>
        </div>

        <div style={{ padding: '6px 16px', borderRadius: 20, background: 'rgba(99,102,241,0.14)', color: '#a5b4fc', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
          {done ? 'Banque prête' : `Étape ${stepIndex + 1}/${PHASES.length}`}
        </div>
        <div style={{ minHeight: 60 }}>
          <AnimatePresence mode="wait">
            <motion.div key={done ? 'done' : stepIndex} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#f8fafc' }}>{done ? 'Votre examen est prêt !' : (phase || current.label)}</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>{done ? 'Lancement dans un instant…' : current.sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Timeline des phases */}
        <div style={{ display: 'flex', gap: 6, width: '100%', margin: '22px 0 18px' }}>
          {PHASES.map((p, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', height: 4, borderRadius: 4, background: (done || i < stepIndex) ? '#a855f7' : i === stepIndex ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.09)', transition: 'background 0.4s' }} />
              <span style={{ fontSize: 9, color: (done || i <= stepIndex) ? '#c4b5fd' : '#64748b', fontWeight: i === stepIndex ? 700 : 500, textAlign: 'center', lineHeight: 1.2 }}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Message rassurant : préparation unique */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.16)', marginBottom: 16, width: '100%' }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚡</span>
          <p style={{ margin: 0, fontSize: 12.5, color: '#86efac', textAlign: 'left', lineHeight: 1.5 }}>
            Cette préparation n’a lieu qu’<strong>une seule fois pour ce cours</strong>. Ensuite, tous vos examens démarrent <strong>instantanément</strong>. Inutile de rafraîchir : l’affichage est automatique.
          </p>
        </div>

        {/* Astuce rotative */}
        <div style={{ minHeight: 42, display: 'flex', alignItems: 'center', width: '100%' }}>
          <AnimatePresence mode="wait">
            <motion.p key={tip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
              style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, textAlign: 'center' }}>
              {TIPS[tip]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Points pulsants */}
        {!done && (
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
