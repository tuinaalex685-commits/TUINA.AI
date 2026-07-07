"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import styles from "./Story.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

export default function Story() {
  return (
    <section className={styles.storySection}>
      {/* Animated Background & Bridge Image */}
      <div className={styles.animatedBg}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
      </div>

      <motion.div 
        className={styles.container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
      >
        <motion.div variants={fadeUp} className={styles.lineIndicator} />
        
        <motion.h2 variants={fadeUp} className={styles.title}>
          Pensé par un étudiant, <span>pour les étudiants.</span>
        </motion.h2>
        
        <motion.div variants={fadeUp} className={styles.content}>
          <p>
            Le droit est fascinant, mais la charge de travail est écrasante. Entre les centaines de pages de doctrine à lire, la jurisprudence à ficher et la méthodologie stricte, la plupart des étudiants se sentent noyés.
          </p>
          <p>
            C'est exactement pour cela que Tuina.ai a été créé par un étudiant en droit (Tuina Zoubiesse Alex Ulrich). C'est <strong>l'outil qu'il nous manquait en L1</strong> pour y voir clair, gagner du temps et réussir sereinement.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
