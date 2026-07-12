"use client";

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EtudeLoadingScreenProps {
  progress: number;
}

export default function EtudeLoadingScreen({ progress }: EtudeLoadingScreenProps) {
  // Détermination de l'étape actuelle en fonction de la progression
  const currentStep = useMemo(() => {
    if (progress < 20) return {
      step: 1,
      title: "Connexion au moteur d'intelligence juridique...",
      subtitle: "Veuillez patienter, cela peut prendre un instant."
    };
    if (progress < 50) return {
      step: 2,
      title: "Analyse approfondie de votre document...",
      subtitle: "Extraction des concepts clés et des pièges."
    };
    if (progress < 80) return {
      step: 3,
      title: "Élaboration de la stratégie pédagogique...",
      subtitle: "Création des questions de forme et de fond."
    };
    return {
      step: 4,
      title: "Finalisation et assemblage de votre cours...",
      subtitle: "Encore quelques secondes, l'affichage sera automatique."
    };
  }, [progress]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '600px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: '16px',
      background: 'var(--color-bg-main, #0f172a)'
    }}>
      
      {/* Background Animated Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}
      />
      <motion.div
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }}
      />

      {/* Glassmorphism Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '90%',
          maxWidth: '500px',
          padding: '40px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}
      >
        {/* Progress Circle / Value */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            {/* Background Circle */}
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="6"
            />
            {/* Animated Progress Circle */}
            <motion.circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={339.292}
              initial={{ strokeDashoffset: 339.292 }}
              animate={{ strokeDashoffset: 339.292 - (339.292 * progress) / 100 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }}
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: 800,
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            {progress}%
          </div>
        </div>

        {/* Dynamic Step Text */}
        <div style={{ minHeight: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div
            key={`badge-${currentStep.step}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.1)',
              color: '#818cf8',
              fontSize: '13px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '16px'
            }}
          >
            Étape {currentStep.step}/4
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <h3 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: 600, 
                color: '#f8fafc',
                lineHeight: 1.4
              }}>
                {currentStep.title}
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: '14px', 
                color: '#94a3b8',
                lineHeight: 1.5
              }}>
                {currentStep.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
