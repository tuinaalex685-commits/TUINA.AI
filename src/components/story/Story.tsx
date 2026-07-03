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
          Créé par un étudiant, <span>pour les étudiants.</span>
        </motion.h2>
        
        <motion.div variants={fadeUp} className={styles.content}>
          <p>
            Tuina.ai est née d&apos;un constat simple : les études de droit sont exigeantes et la quantité d&apos;informations à assimiler est colossale. Face au manque d&apos;organisation, à la difficulté de réviser des centaines de PDF de cours et à l&apos;absence d&apos;accompagnement personnalisé, il fallait une solution.
          </p>
          <p>
            Conçue par <strong>Tuina Zoubiesse Alex Ulrich</strong>, étudiant en droit, et ses collaborateurs, cette plateforme est exactement l&apos;outil que nous aurions rêvé avoir en première année pour structurer nos révisions et réussir nos examens.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
