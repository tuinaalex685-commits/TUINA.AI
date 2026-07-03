"use client";

import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import styles from "./Finale.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function Finale() {
  return (
    <section className={styles.finaleSection}>
      {/* Background discrete SVG */}
      <div className={styles.bgSvg}>
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path d="M96 40 h8 v110 h-8 zM40 50 h120 v6 h-120 z" fill="rgba(255,255,255,0.02)" />
        </svg>
      </div>

      <motion.div 
        className={styles.content}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      >
        <motion.h2 variants={fadeUp} className={styles.title}>
          L&apos;IA ne vous remplace pas.<br/>
          Elle vous élève.
        </motion.h2>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <Link href="/login" className={styles.pillBtn}>
            Accéder à la plateforme
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
