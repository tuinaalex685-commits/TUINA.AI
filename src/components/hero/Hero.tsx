"use client";

import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import styles from "./Hero.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

export default function Hero() {
  return (
    <section className={styles.heroSection}>
      {/* Animated Mesh Gradient Background */}
      <div className={styles.meshGradient} />
      
      {/* Floating 3D/Glass Balance of Justice SVG */}
      <div className={styles.glassBalanceContainer}>
        <svg viewBox="0 0 200 200" className={styles.glassBalanceSvg} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
            <linearGradient id="chromeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C9CDD3" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#8A8E94" />
            </linearGradient>
            <filter id="glassFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#7C5CFF" floodOpacity="0.2" />
            </filter>
          </defs>
          
          <g filter="url(#glassFilter)">
            {/* Center Pillar */}
            <path d="M96 40 h8 v110 h-8 z" fill="url(#glassGradient)" stroke="url(#chromeGradient)" strokeWidth="1.5" />
            <path d="M85 150 h30 v10 h-30 z" fill="url(#glassGradient)" stroke="url(#chromeGradient)" strokeWidth="1.5" />
            
            {/* Top Beam */}
            <path d="M40 50 h120 v6 h-120 z" fill="url(#glassGradient)" stroke="url(#chromeGradient)" strokeWidth="1.5" />
            
            {/* Left Scale */}
            <path d="M40 56 l-15 40 h30 z" fill="none" stroke="url(#chromeGradient)" strokeWidth="1" opacity="0.6"/>
            <path d="M20 96 q20 15 40 0" fill="url(#glassGradient)" stroke="url(#chromeGradient)" strokeWidth="1.5" />
            
            {/* Right Scale */}
            <path d="M160 56 l-15 40 h30 z" fill="none" stroke="url(#chromeGradient)" strokeWidth="1" opacity="0.6"/>
            <path d="M140 96 q20 15 40 0" fill="url(#glassGradient)" stroke="url(#chromeGradient)" strokeWidth="1.5" />
          </g>
        </svg>
      </div>
      
      <motion.div 
        className={styles.content}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.h1 variants={fadeUp} className={styles.title}>
          TUINA<span className={styles.highlight}>.AI</span>
        </motion.h1>
        
        <motion.p variants={fadeUp} className={styles.subtitle}>
          Deviens le juriste que tu es censé devenir.
        </motion.p>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <Link href="/login" className={styles.pillBtn}>
            Rejoindre maintenant
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
