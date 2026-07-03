"use client";

import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import styles from "./Finale.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

export default function Finale() {
  return (
    <section className={styles.finaleSection}>
      <motion.div 
        className={styles.content}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
      >
        <motion.h2 variants={fadeUp} className={styles.title}>
          Prêt à majorer cette année ?
        </motion.h2>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <Link href="/login" className={styles.hugeBtn}>
            Créer mon compte
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
