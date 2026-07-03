"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import styles from "./Hero.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className={styles.heroSection}>
      {/* Background Image of Young Lawyers */}
      <div className={styles.imageBg} />
      
      {/* Grid and Particles Background */}
      <div className={styles.gridBg} />
      
      {/* Dynamic Glow following mouse slightly */}
      <motion.div 
        className={styles.dynamicGlow}
        animate={{
          x: mousePosition.x * 30,
          y: mousePosition.y * 30,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20 }}
      />

      
      <motion.div 
        className={styles.content}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUp} className={styles.badge}>
          <span className={styles.badgeDot} />
          Tuina.ai est maintenant disponible
        </motion.div>

        <motion.h1 variants={fadeUp} className={styles.title}>
          L&apos;IA qui accompagne <span>réellement</span><br />
          les étudiants en droit.
        </motion.h1>
        
        <motion.p variants={fadeUp} className={styles.subtitle}>
          Tuina.ai n&apos;est pas seulement une IA. C&apos;est une plateforme complète conçue pour organiser, réviser et exceller dans vos études universitaires.
        </motion.p>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <Link href="/login" className={styles.primaryBtn}>
            Commencer mon apprentissage
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
