"use client";

import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
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
          Ne laissez pas vos examens au hasard.
        </motion.h2>
        
        <motion.div variants={fadeUp} className={styles.ctaWrapper}>
          <div className={styles.actionGroup}>
            <Link href="/login" className={styles.hugeBtn}>
              Je prends mon Pass Premium
              <ArrowRight size={24} />
            </Link>
            <p className={styles.accessCodeNotice}>
              <span className={styles.lockIcon}>🔒</span> Un code d'accès est requis pour rejoindre la plateforme.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
