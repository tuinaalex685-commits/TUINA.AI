"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { BookOpen, Calendar, Zap, Target, PenTool, TrendingUp, Compass } from "lucide-react";
import styles from "./Features.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } }
};

const features = [
  { icon: <BookOpen size={20} />, title: "Bibliothèque intelligente", desc: "Importez vos PDF de cours. L'IA les analyse, les organise et vous aide à en extraire l'essentiel instantanément." },
  { icon: <Calendar size={20} />, title: "Organisation", desc: "Créez vos matières et organisez votre semestre." },
  { icon: <Zap size={20} />, title: "Révisions intelligentes", desc: "Flashcards générées automatiquement avec répétition espacée." },
  { icon: <Target size={20} />, title: "Évaluations IA", desc: "Génération automatique de QCM et Quiz sur mesure." },
  { icon: <PenTool size={20} />, title: "Rédaction juridique", desc: "Correction intelligente de vos dissertations et commentaires d'arrêt." },
  { icon: <TrendingUp size={20} />, title: "Progression", desc: "Suivi de la progression et de vos statistiques d'apprentissage." },
  { icon: <Compass size={20} />, title: "Étude guidée", desc: "Un tuteur IA proactif pour vous accompagner (Bientôt).", isNew: true },
];

export default function Features() {
  return (
    <section className={styles.featuresSection} id="features">
      <div className={styles.container}>
        <div className={styles.header}>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className={styles.title}
          >
            Tout ce dont vous avez besoin.
          </motion.h2>
        </div>

        <motion.div 
          className={styles.grid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {features.map((feat, idx) => (
            <motion.div key={idx} variants={fadeUp} className={styles.card}>
              <div className={styles.cardGlow} />
              <div className={styles.iconWrapper}>
                {feat.icon}
              </div>
              <h3 className={styles.cardTitle}>
                {feat.title}
                {feat.isNew && <span className={styles.badge}>Future</span>}
              </h3>
              <p className={styles.cardDesc}>{feat.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
