"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import styles from "./Different.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

export default function Different() {
  return (
    <section className={styles.differentSection}>
      <div className={styles.container}>
        <motion.div 
          className={styles.contentBox}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <div className={styles.glowBg} />
          
          <motion.h2 variants={fadeUp} className={styles.title}>
            Pourquoi Tuina.ai change la donne ?
          </motion.h2>
          
          <motion.p variants={fadeUp} className={styles.subtitle}>
            On ne fait pas le travail à votre place. On vous rend meilleur.
          </motion.p>
          
          <motion.p variants={fadeUp} className={styles.desc}>
            Oubliez les IA génériques qui recrachent du texte sans comprendre votre besoin. Tuina.ai rassemble l&apos;organisation, l&apos;entraînement et la correction dans un seul endroit, pensé à 100% pour la rigueur des études de droit.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
