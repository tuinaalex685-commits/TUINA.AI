"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import styles from "./Status.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export default function Status() {
  const stats = [
    { label: "ÉTUDIANTS ACTIFS", value: "15,240" },
    { label: "TAUX DE RÉUSSITE", value: "92%" },
    { label: "UNIVERSITÉS", value: "8" }
  ];

  return (
    <div className={styles.statusSection}>
      <div className={styles.container}>
        <motion.div 
          className={styles.statusGrid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {stats.map((stat, idx) => (
            <motion.div key={idx} variants={fadeUp} className={styles.statusItem}>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
