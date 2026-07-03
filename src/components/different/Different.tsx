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
            Pourquoi Tuina.ai est différente ?
          </motion.h2>
          
          <motion.p variants={fadeUp} className={styles.subtitle}>
            Tuina.ai ne vous remplace pas. Elle vous élève.
          </motion.p>
          
          <motion.p variants={fadeUp} className={styles.desc}>
            Contrairement aux intelligences artificielles génériques, notre plateforme combine l&apos;organisation, la révision, l&apos;entraînement, la correction et un suivi personnalisé dans un seul écosystème conçu spécifiquement pour le droit.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
