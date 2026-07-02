"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  BookOpen, 
  Layout, 
  BrainCircuit, 
  CheckSquare, 
  Edit3, 
  TrendingUp, 
  Sparkles,
  ArrowRight
} from "lucide-react";
import styles from "./page.module.css";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

export default function Home() {
  return (
    <div className={styles.container}>
      {/* Background elements */}
      <div className={styles.background}>
        <div className={`${styles.glow} ${styles.glow1}`} />
        <div className={`${styles.glow} ${styles.glow2}`} />
      </div>

      <div className={styles.content}>
        {/* Navigation */}
        <nav className={styles.nav}>
          <div className={styles.logo}>Tuina.ai</div>
          <Link href="/login" className={styles.loginBtn}>
            Connexion
          </Link>
        </nav>

        {/* Hero Section */}
        <motion.section 
          className={styles.hero}
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp} className={styles.badge}>
            <Sparkles size={16} />
            <span>La nouvelle façon d'étudier le droit</span>
          </motion.div>
          
          <motion.h1 variants={fadeUp} className={styles.title}>
            L'IA qui accompagne <span>réellement</span> les étudiants en droit.
          </motion.h1>
          
          <motion.p variants={fadeUp} className={styles.subtitle}>
            Plus qu'une simple IA, Tuina.ai est une plateforme complète pour organiser, réviser et exceller dans vos études juridiques.
          </motion.p>
          
          <motion.div variants={fadeUp}>
            <Link href="/login" className={styles.primaryBtn}>
              Commencer mon apprentissage <ArrowRight size={20} />
            </Link>
          </motion.div>
        </motion.section>

        {/* Creator Story */}
        <motion.section 
          className={styles.story}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.span variants={fadeUp} className={styles.sectionTag}>L'histoire</motion.span>
          <motion.h2 variants={fadeUp}>Créé par un étudiant, pour les étudiants.</motion.h2>
          <motion.p variants={fadeUp}>
            Tuina.ai est née d'un besoin réel : le manque d'organisation, la difficulté à synthétiser des centaines de pages de cours et l'absence d'accompagnement personnalisé. 
          </motion.p>
          <motion.p variants={fadeUp}>
            Ce n'est pas un énième outil gadget. C'est la plateforme que j'aurais rêvé avoir en première année pour structurer mes révisions, m'entraîner et réussir mes examens de droit.
          </motion.p>
        </motion.section>

        {/* Features */}
        <section className={styles.features}>
          <motion.div 
            className={styles.featuresHeader}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.span variants={fadeUp} className={styles.sectionTag}>Fonctionnalités</motion.span>
            <motion.h2 variants={fadeUp}>Tout ce dont vous avez besoin.</motion.h2>
            <motion.p variants={fadeUp} className={styles.subtitle} style={{ margin: '0 auto' }}>
              Une suite d'outils intelligents pour maximiser votre efficacité.
            </motion.p>
          </motion.div>

          <motion.div 
            className={styles.grid}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><BookOpen size={28} /></div>
              <h3>Bibliothèque intelligente</h3>
              <p>Importez vos PDF de cours. L'IA les analyse, les organise et vous aide à en extraire l'essentiel instantanément.</p>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><Layout size={28} /></div>
              <h3>Organisation</h3>
              <p>Créez vos matières, structurez votre semestre et ne soyez plus jamais débordé par la charge de travail.</p>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><BrainCircuit size={28} /></div>
              <h3>Révisions intelligentes</h3>
              <p>Générez des flashcards automatiquement et utilisez la répétition espacée pour ancrer les concepts juridiques.</p>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><CheckSquare size={28} /></div>
              <h3>Évaluations IA</h3>
              <p>Testez vos connaissances avec des QCM et des quiz générés sur mesure à partir de vos propres cours.</p>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><Edit3 size={28} /></div>
              <h3>Rédaction juridique</h3>
              <p>Soumettez vos dissertations et commentaires d'arrêt pour une correction intelligente et une analyse détaillée.</p>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.card}>
              <div className={styles.cardIcon}><TrendingUp size={28} /></div>
              <h3>Suivi de progression</h3>
              <p>Visualisez vos points forts et vos faiblesses. Suivez votre évolution tout au long de l'année universitaire.</p>
            </motion.div>
          </motion.div>
        </section>

        {/* Philosophy */}
        <motion.section 
          className={styles.philosophy}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h2 variants={fadeUp}>L'IA ne vous remplace pas.<br/>Elle vous élève.</motion.h2>
          <motion.p variants={fadeUp}>
            Tuina.ai ne fait pas le travail à votre place. Elle combine organisation, révision, entraînement et correction pour faire de vous un meilleur juriste.
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link href="/login" className={styles.primaryBtn} style={{ padding: '20px 48px', fontSize: '20px' }}>
              Accéder à la plateforme
            </Link>
          </motion.div>
        </motion.section>

        {/* Footer */}
        <footer className={styles.footer}>
          <p>© {new Date().getFullYear()} Tuina.ai. Tous droits réservés.</p>
        </footer>
      </div>
    </div>
  );
}
