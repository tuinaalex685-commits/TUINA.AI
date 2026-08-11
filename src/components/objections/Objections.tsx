"use client";

import React from "react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import styles from "./Objections.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

/**
 * Les trois freins qui reviennent le plus souvent chez un étudiant en droit,
 * chacun illustré par un portrait et suivi de la réponse concrète de SJP.
 *
 * Les réponses décrivent le produit tel qu'il existe vraiment (catalogue gratuit,
 * correction de cas pratique, Mobile Money) : aucune promesse qui ne serait pas
 * tenue une fois l'étudiant inscrit.
 */
const OBJECTIONS = [
  {
    photo: "/photos/portrait-bleu.jpg",
    // Les trois portraits ne sont pas cadrés pareil à la source (deux plans larges,
    // un gros plan). Ce recadrage rapproche la taille des visages, sinon la rangée
    // paraît bancale.
    framing: styles.framingWide,
    alt: "Étudiant en droit en costume bleu marine, les bras croisés",
    quote: "« Je n'ai pas le temps de tout relire. »",
    answer: (
      <>
        Vous déposez votre cours, SJP en tire l'essentiel, des fiches de révision et une
        banque de questions. Ce qui vous prenait <strong>des soirées entières</strong> tient
        désormais en une session.
      </>
    )
  },
  {
    photo: "/photos/portrait-alex.png",
    framing: styles.framingWide,
    alt: "Étudiant en droit en costume noir, sur fond gris clair",
    quote: "« Je révise seul, sans savoir si c'est juste. »",
    answer: (
      <>
        Chaque cas pratique que vous rédigez est corrigé point par point : qualification des
        faits, règle applicable, conclusion. Vous voyez <strong>exactement où vous perdez
        des points</strong>.
      </>
    )
  },
  {
    photo: "/photos/portrait-gris.jpg",
    framing: styles.framingClose,
    alt: "Étudiant en droit en veste grise et col roulé noir",
    quote: "« Je n'ai pas de carte bancaire. »",
    answer: (
      <>
        Le catalogue de cours est <strong>gratuit</strong>, sans carte ni engagement. Et le
        Pass Premium se règle par Mobile Money, à 2 500 FCFA par mois.
      </>
    )
  }
];

export default function Objections() {
  return (
    <section className={styles.objectionsSection}>
      <motion.div
        className={styles.container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
      >
        <motion.h2 variants={fadeUp} className={styles.title}>
          Ce qui vous a empêché de réussir <span>jusqu&apos;ici.</span>
        </motion.h2>

        <div className={styles.grid}>
          {OBJECTIONS.map((item) => (
            <motion.article key={item.quote} variants={fadeUp} className={styles.card}>
              <div className={styles.photoFrame}>
                <Image
                  src={item.photo}
                  alt={item.alt}
                  fill
                  className={`${styles.photo} ${item.framing}`}
                  sizes="(max-width: 768px) 100vw, (max-width: 1100px) 45vw, 360px"
                />
                {/* Voile bleu très léger : les trois portraits n'ont pas le même fond
                    d'origine, ce voile leur donne une teinte commune sans dénaturer
                    les visages. */}
                <div className={styles.photoTint} aria-hidden="true" />
              </div>

              <h3 className={styles.quote}>{item.quote}</h3>
              <p className={styles.answer}>{item.answer}</p>
            </motion.article>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
