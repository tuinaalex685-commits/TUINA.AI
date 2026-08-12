"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import styles from "./Hero.module.css";
import { ArrowRight } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
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
      {/* Dynamic Glow following mouse slightly */}
      <motion.div 
        className={styles.dynamicGlow}
        animate={{
          x: mousePosition.x * 50,
          y: mousePosition.y * 50,
        }}
        transition={{ type: "spring", stiffness: 40, damping: 20 }}
      />
      
      <motion.div 
        className={styles.content}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUp} className={styles.badge}>
          <span className={styles.badgeDot} />
          SJP est officiellement en ligne
        </motion.div>

        {/* Le sigle porte le titre de niveau 1, et sa signification est dans le même
            titre : un « SJP » seul ne dirait rien ni à un moteur de recherche, ni à
            un lecteur d'écran, ni à un visiteur qui découvre le nom. */}
        <motion.h1 variants={fadeUp} className={styles.title}>
          <span className={styles.sigle}>SJP</span>
          <span className={styles.definition}>Sciences Juridiques et Politiques</span>
        </motion.h1>
        
        <motion.p variants={fadeUp} className={styles.subtitle}>
          Votre professeur particulier virtuel disponible 24h/24. Analysez des arrêts complexes en quelques secondes, révisez intelligemment et arrivez confiant à vos examens.
        </motion.p>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <Link href="/login" className={styles.primaryBtn}>
            Débloquer mon potentiel
            <ArrowRight size={20} />
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
