"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { BookOpen, Calendar, Zap, Target, PenTool, TrendingUp } from "lucide-react";
import styles from "./Articles.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function Articles() {
  return (
    <section className={styles.bentoSection} id="features">
      <div className={styles.container}>
        <motion.div 
          className={styles.bentoGrid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {/* Feature 1 - Large */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardLarge}`}>
            <div className={styles.iconWrapper}><BookOpen size={24} /></div>
            <h3 className={styles.cardTitle}>Bibliothèque Intelligente</h3>
            <p className={styles.cardDesc}>
              Importez vos PDF de cours. L&apos;IA les analyse, les organise et vous aide à en extraire l&apos;essentiel instantanément pour des révisions accélérées.
            </p>
          </motion.div>

          {/* Feature 2 - Large */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardLarge}`}>
            <div className={styles.iconWrapper}><Zap size={24} /></div>
            <h3 className={styles.cardTitle}>Révisions Intelligentes</h3>
            <p className={styles.cardDesc}>
              Générez des flashcards automatiquement et utilisez notre algorithme de répétition espacée pour ancrer les concepts juridiques à vie.
            </p>
          </motion.div>

          {/* Feature 3 - Small */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardSmall}`}>
            <div className={styles.iconWrapper}><Calendar size={24} /></div>
            <h3 className={styles.cardTitle}>Organisation</h3>
            <p className={styles.cardDesc}>Ne soyez plus jamais débordé.</p>
          </motion.div>

          {/* Feature 4 - Small */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardSmall}`}>
            <div className={styles.iconWrapper}><Target size={24} /></div>
            <h3 className={styles.cardTitle}>Évaluations IA</h3>
            <p className={styles.cardDesc}>QCM et quiz sur mesure.</p>
          </motion.div>

          {/* Feature 5 - Small */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardSmall}`}>
            <div className={styles.iconWrapper}><PenTool size={24} /></div>
            <h3 className={styles.cardTitle}>Rédaction Juridique</h3>
            <p className={styles.cardDesc}>Correction intelligente.</p>
          </motion.div>

          {/* Feature 6 - Small */}
          <motion.div variants={fadeUp} className={`${styles.bentoCard} ${styles.cardSmall}`}>
            <div className={styles.iconWrapper}><TrendingUp size={24} /></div>
            <h3 className={styles.cardTitle}>Progression</h3>
            <p className={styles.cardDesc}>Suivi et analytics.</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
