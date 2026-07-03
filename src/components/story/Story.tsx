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
            On le sait tous : les études de droit, c&apos;est dense. Entre la montagne de PDF à lire, les arrêts à ficher et l&apos;organisation qui finit souvent par lâcher en cours d&apos;année, on a vite fait de se sentir noyé sans un bon accompagnement.
          </p>
          <p>
            C&apos;est de ce constat qu&apos;est née Tuina.ai. Créée par <strong>Tuina Zoubiesse Alex Ulrich</strong> (lui-même étudiant en droit) et son équipe, c&apos;est très exactement l&apos;outil qu&apos;on aurait tous rêvé d&apos;avoir en première année pour y voir clair et avancer sereinement.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
