"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface Step { key: string; icon: string; title: string; text: string; accent: string; img?: string; }
const STEPS: Step[] = [
  { key: 'welcome', icon: '🎓', title: 'Bienvenue sur Tuina.ai', text: 'Ton assistant d’étude en droit, propulsé par l’IA. Voici en 30 secondes comment il t’accompagne, de ton cours jusqu’à la maîtrise.', accent: '#a855f7' },
  { key: 'biblio', icon: '📁', title: '1. Importe ton cours', text: 'Dans la Bibliothèque, dépose ton cours en PDF. C’est le point de départ : tout part de ton propre support.', accent: '#3b82f6', img: '/onboarding/biblio.webp' },
  { key: 'etude', icon: '📖', title: '2. Apprends avec l’Étude Guidée', text: 'L’IA découpe ton cours en thèmes et t’accompagne pas à pas : explications, questions, cas pratiques.', accent: '#a855f7', img: '/onboarding/etude.webp' },
  { key: 'examen', icon: '🎓', title: '3. Teste-toi avec l’Examen', text: 'Un examen chronométré, sans aide. Tu obtiens une note et tu vois exactement quels thèmes retravailler.', accent: '#ec4899', img: '/onboarding/examen.webp' },
  { key: 'revisions', icon: '🧠', title: '4. Mémorise avec les Révisions', text: 'Des flashcards en répétition espacée pour ancrer durablement ce que tu as appris.', accent: '#6366f1', img: '/onboarding/revisions.webp' },
  { key: 'redaction', icon: '✍️', title: '5. Entraîne-toi à la Rédaction', text: 'Dissertations et cas pratiques corrigés par l’IA, avec le regard exigeant d’un correcteur de fac.', accent: '#22c55e', img: '/onboarding/redaction.webp' },
  { key: 'progression', icon: '📈', title: '6. Suis ta Progression', text: 'Ta maîtrise de chaque thème, en temps réel. Tu sais toujours quoi retravailler pour progresser.', accent: '#f59e0b', img: '/onboarding/progression.webp' },
  { key: 'cta', icon: '🚀', title: 'Prêt à commencer ?', text: 'Commence par importer ton premier cours dans la Bibliothèque — le reste s’enchaîne naturellement.', accent: '#a855f7' },
];

// Cadre "fenêtre de navigateur" contenant une vraie capture de la section.
function Shot({ src, accent }: { src: string; accent: string }) {
  return (
    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#fff', boxShadow: `0 18px 40px -16px ${accent}66` }}>
      <div style={{ display: 'flex', gap: 5, padding: '8px 11px', background: 'rgba(15,18,32,0.85)' }}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.8 }} />)}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ display: 'block', width: '100%', height: 224, objectFit: 'cover', objectPosition: 'top' }} />
    </div>
  );
}
function Badge({ icon, accent }: { icon: string; accent: string }) {
  return (
    <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 3, repeat: Infinity }}
      style={{ width: 96, height: 96, margin: '18px auto', borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, background: `linear-gradient(135deg,#6366f1,${accent},#ec4899)`, boxShadow: `0 14px 34px -8px ${accent}99` }}>{icon}</motion.div>
  );
}

export default function OnboardingGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  const close = (goBiblio = false) => {
    setI(0);
    onClose();
    if (goBiblio) router.push('/app/bibliotheque');
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(8,11,24,0.80)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', overflowY: 'auto' }}>
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 9, repeat: Infinity }}
          style={{ position: 'absolute', top: '-15%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.20) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.32, 0.15] }} transition={{ duration: 12, repeat: Infinity, delay: 2 }}
          style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

        <motion.div initial={{ y: 20, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
          style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 470, margin: 'auto', borderRadius: 24, padding: '24px 24px 20px', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

          {!isLast && (
            <button onClick={() => close(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#94a3b8', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>Passer ✕</button>
          )}

          {/* Visuel : vraie capture (sections) ou badge (accueil / fin) */}
          <div style={{ width: '100%', marginTop: 8, marginBottom: 18, minHeight: 132 }}>
            <AnimatePresence mode="wait">
              <motion.div key={step.key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
                {step.img ? <Shot src={step.img} accent={step.accent} /> : <Badge icon={step.icon} accent={step.accent} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div style={{ minHeight: 112 }}>
            <AnimatePresence mode="wait">
              <motion.div key={step.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{step.icon}</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: '#f8fafc' }}>{step.title}</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.55, maxWidth: 390 }}>{step.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div style={{ display: 'flex', gap: 7, margin: '18px 0 16px' }}>
            {STEPS.map((s, idx) => (
              <button key={s.key} onClick={() => setI(idx)} aria-label={`Étape ${idx + 1}`}
                style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 6, border: 'none', cursor: 'pointer', background: idx === i ? 'linear-gradient(90deg,#6366f1,#ec4899)' : idx < i ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.14)', transition: 'width .3s, background .3s' }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            {i > 0 && (
              <button onClick={() => setI((n) => Math.max(0, n - 1))}
                style={{ flex: '0 0 auto', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Précédent</button>
            )}
            <button onClick={() => (isLast ? close(true) : setI((n) => Math.min(STEPS.length - 1, n + 1)))}
              style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14.5, background: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)', boxShadow: '0 10px 24px -8px rgba(168,85,247,0.6)' }}>
              {isLast ? 'Commencer 🚀' : 'Suivant →'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
