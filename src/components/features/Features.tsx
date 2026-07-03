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
  { icon: <BookOpen size={20} />, title: "Bibliothèque augmentée", desc: "Chargez vos PDF de cours. L'IA les décortique et vous sort l'essentiel en quelques secondes." },
  { icon: <Calendar size={20} />, title: "Organisation au top", desc: "Créez vos matières et planifiez votre semestre sans prise de tête." },
  { icon: <Zap size={20} />, title: "Révisions optimisées", desc: "Des flashcards générées automatiquement avec un algorithme de répétition pour ne rien oublier." },
  { icon: <Target size={20} />, title: "Entraînement ciblé", desc: "Testez-vous avec des QCM et des quiz générés sur mesure par l'IA." },
  { icon: <PenTool size={20} />, title: "Aide à la rédaction", desc: "Faites corriger intelligemment vos dissertations et commentaires d'arrêt pour viser l'excellence." },
  { icon: <TrendingUp size={20} />, title: "Suivi en direct", desc: "Visualisez votre progression et vos stats pour rester motivé tout au long de l'année." },
  { icon: <Compass size={20} />, title: "Votre tuteur IA", desc: "Un coach virtuel proactif pour vous guider pas à pas (Bientôt disponible).", isNew: true },
];

export default function Features() {
  return (
    <section className={styles.featuresSection} id="features">
      {/* Fond lumineux azur/blanc (arrière-plan profond) */}
      <div className={styles.luminousBackground}>
        <div className={styles.glowCyan} />
        <div className={styles.glowAzure} />
        <div className={styles.glowWhite} />
      </div>

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
