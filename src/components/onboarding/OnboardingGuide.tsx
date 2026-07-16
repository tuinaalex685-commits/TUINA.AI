"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

// ---- Petites maquettes illustratives (pas de vraies captures) ---------------
function Screen({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 300, margin: '0 auto', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)', boxShadow: `0 18px 40px -18px ${accent}55` }}>
      <div style={{ display: 'flex', gap: 5, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
      </div>
      <div style={{ padding: 16, minHeight: 156 }}>{children}</div>
    </div>
  );
}
const Bar = ({ w, c = 'rgba(255,255,255,0.12)', h = 8 }: { w: string; c?: string; h?: number }) => (
  <div style={{ width: w, height: h, borderRadius: 6, background: c }} />
);

const ART: Record<string, React.ReactNode> = {
  welcome: (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 156 }}>
      <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 3, repeat: Infinity }}
        style={{ width: 84, height: 84, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, background: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)', boxShadow: '0 12px 30px -8px rgba(168,85,247,0.6)' }}>🎓</motion.div>
      <div style={{ display: 'flex', gap: 6 }}>{['✨', '⚖️', '📚'].map((e) => <span key={e} style={{ fontSize: 18 }}>{e}</span>)}</div>
    </div>
  ),
  biblio: (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, background: 'rgba(59,130,246,0.10)', border: '1px dashed rgba(59,130,246,0.4)' }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Bar w="80%" /><Bar w="50%" /></div>
      </div>
      <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ alignSelf: 'center', fontSize: 22 }}>⬆️</motion.div>
      <div style={{ alignSelf: 'center', fontSize: 11, color: '#93c5fd' }}>Glisse ton PDF ici</div>
    </div>
  ),
  etude: (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 700 }}>Thème 2 · Le consentement</div>
      <Bar w="100%" /><Bar w="88%" /><Bar w="60%" />
      <div style={{ marginTop: 6, padding: 10, borderRadius: 10, background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Bar w="70%" c="rgba(196,181,253,0.5)" />
        <div style={{ display: 'flex', gap: 6 }}><Bar w="46%" c="rgba(255,255,255,0.10)" h={22} /><Bar w="46%" c="rgba(168,85,247,0.4)" h={22} /></div>
      </div>
    </div>
  ),
  examen: (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#94a3b8' }}>Question 3/15</div>
        <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ fontSize: 13, fontWeight: 800, color: '#f472b6' }}>⏱️ 12:30</motion.div>
      </div>
      <Bar w="95%" /><Bar w="70%" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ padding: 8, borderRadius: 8, border: i === 1 ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.10)', background: i === 1 ? 'rgba(168,85,247,0.12)' : 'transparent' }}><Bar w={['60%', '75%', '55%'][i]} /></div>)}
      </div>
    </div>
  ),
  revisions: (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 156 }}>
      <motion.div animate={{ rotateY: [0, 180, 360] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 150, height: 96, borderRadius: 12, background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.25))', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🧠</motion.div>
    </div>
  ),
  redaction: (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Bar w="100%" /><Bar w="92%" /><Bar w="96%" /><Bar w="70%" />
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
        <span style={{ fontSize: 16 }}>✅</span><div style={{ fontSize: 11, color: '#86efac', fontWeight: 700 }}>Corrigé : 14/20 · plan solide</div>
      </div>
    </div>
  ),
  progression: (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[['Consentement', '85%', '#22c55e'], ['Objet & cause', '55%', '#f59e0b'], ['Responsabilité', '30%', '#ef4444']].map(([n, w, c]) => (
        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 10, color: '#cbd5e1' }}>{n}</div>
          <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: w as string }} transition={{ duration: 1 }} style={{ height: '100%', borderRadius: 6, background: c as string }} />
          </div>
        </div>
      ))}
    </div>
  ),
};

interface Step { key: string; icon: string; title: string; text: string; accent: string; }
const STEPS: Step[] = [
  { key: 'welcome', icon: '🎓', title: 'Bienvenue sur Tuina.ai', text: 'Ton assistant d’étude en droit, propulsé par l’IA. Voici en 30 secondes comment il t’accompagne, de ton cours jusqu’à la maîtrise.', accent: '#a855f7' },
  { key: 'biblio', icon: '📁', title: '1. Importe ton cours', text: 'Dans la Bibliothèque, dépose ton cours en PDF. C’est le point de départ : tout part de ton propre support.', accent: '#3b82f6' },
  { key: 'etude', icon: '📖', title: '2. Apprends avec l’Étude Guidée', text: 'L’IA découpe ton cours en thèmes et t’accompagne pas à pas : explications, questions, cas pratiques.', accent: '#a855f7' },
  { key: 'examen', icon: '🎓', title: '3. Teste-toi avec l’Examen', text: 'Un examen chronométré, sans aide, en conditions réelles. Tu obtiens une note et tu vois exactement tes points faibles.', accent: '#ec4899' },
  { key: 'revisions', icon: '🧠', title: '4. Mémorise avec les Révisions', text: 'Des flashcards en répétition espacée pour ancrer durablement ce que tu as appris.', accent: '#6366f1' },
  { key: 'redaction', icon: '✍️', title: '5. Entraîne-toi à la Rédaction', text: 'Dissertations et cas pratiques corrigés par l’IA, avec le regard exigeant d’un correcteur de fac.', accent: '#22c55e' },
  { key: 'progression', icon: '📈', title: '6. Suis ta Progression', text: 'Ta maîtrise de chaque thème, en temps réel. Tu sais toujours quoi retravailler pour progresser.', accent: '#f59e0b' },
  { key: 'cta', icon: '🚀', title: 'Prêt à commencer ?', text: 'Commence par importer ton premier cours dans la Bibliothèque — le reste s’enchaîne naturellement.', accent: '#a855f7' },
];

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
        style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(8,11,24,0.78)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 9, repeat: Infinity }}
          style={{ position: 'absolute', top: '-15%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.20) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.32, 0.15] }} transition={{ duration: 12, repeat: Infinity, delay: 2 }}
          style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

        <motion.div initial={{ y: 20, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
          style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 460, borderRadius: 24, padding: '28px 26px 22px', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

          {/* Passer */}
          {!isLast && (
            <button onClick={() => close(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#94a3b8', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>Passer ✕</button>
          )}

          {/* Illustration animée par étape */}
          <div style={{ width: '100%', marginBottom: 20, marginTop: 6 }}>
            <AnimatePresence mode="wait">
              <motion.div key={step.key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
                <Screen accent={step.accent}>{ART[step.key] || (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 156, fontSize: 48 }}>{step.icon}</div>
                )}</Screen>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Titre + texte */}
          <div style={{ minHeight: 118 }}>
            <AnimatePresence mode="wait">
              <motion.div key={step.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>{step.icon}</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: '#f8fafc' }}>{step.title}</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.55, maxWidth: 380 }}>{step.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Points de progression */}
          <div style={{ display: 'flex', gap: 7, margin: '20px 0 18px' }}>
            {STEPS.map((s, idx) => (
              <button key={s.key} onClick={() => setI(idx)} aria-label={`Étape ${idx + 1}`}
                style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 6, border: 'none', cursor: 'pointer', background: idx === i ? 'linear-gradient(90deg,#6366f1,#ec4899)' : idx < i ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.14)', transition: 'width .3s, background .3s' }} />
            ))}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            {i > 0 && (
              <button onClick={() => setI((n) => Math.max(0, n - 1))}
                style={{ flex: '0 0 auto', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Précédent</button>
            )}
            {isLast ? (
              <button onClick={() => close(true)}
                style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14.5, background: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)', boxShadow: '0 10px 24px -8px rgba(168,85,247,0.6)' }}>Commencer 🚀</button>
            ) : (
              <button onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
                style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14.5, background: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)', boxShadow: '0 10px 24px -8px rgba(168,85,247,0.6)' }}>Suivant →</button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
