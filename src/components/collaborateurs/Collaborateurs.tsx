"use client";

import React from "react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import styles from "./Collaborateurs.module.css";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

interface Membre {
  photo: string;
  /** Recadrage : les portraits ne sont pas cadrés pareil à la source. */
  framing: string;
  nom: string;
  roles: string[];
}

/**
 * Les personnes réelles derrière SJP.
 *
 * Règle : aucune carte n'est affichée sans nom ET sans fonction. Il s'agit de
 * personnes identifiables sur un site public — une carte incomplète, ou une
 * fonction approximative, engage leur image autant que celle du produit.
 */
const MEMBRES: Membre[] = [
  {
    photo: "/photos/portrait-alex.png",
    framing: styles.framingWide,
    nom: "Tuina Zoubiesse Alex Ulrich",
    roles: ["Étudiant en droit", "Fondateur"]
  },
  {
    photo: "/photos/portrait-ali.jpg",
    framing: styles.framingClose,
    nom: "Ali Conseiga",
    roles: ["Ingénieur Infographe", "Designer Graphique"]
  },
  {
    photo: "/photos/portrait-bleu.jpg",
    framing: styles.framingWide,
    nom: "ILBOUDO Salif",
    roles: ["Étudiant en gestion marketing"]
  }
];

export default function Collaborateurs() {
  return (
    <section className={styles.collaborateursSection}>
      <motion.div
        className={styles.container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
      >
        <motion.h2 variants={fadeUp} className={styles.title}>
          Fondateur et collaborateurs
        </motion.h2>

        <motion.p variants={fadeUp} className={styles.intro}>
          SJP n&apos;est pas un outil anonyme. Voici les visages qui le construisent.
        </motion.p>

        <div className={styles.grid}>
          {MEMBRES.map((membre) => (
            <motion.article key={membre.nom} variants={fadeUp} className={styles.card}>
              <div className={styles.photoFrame}>
                <Image
                  src={membre.photo}
                  alt={`Portrait de ${membre.nom}`}
                  fill
                  className={`${styles.photo} ${membre.framing}`}
                  sizes="(max-width: 768px) 100vw, 340px"
                />
                {/* Voile bleu : les portraits n'ont pas le même fond d'origine
                    (noir, gris, beige). Ce dégradé leur donne une teinte commune. */}
                <div className={styles.photoTint} aria-hidden="true" />
              </div>

              <h3 className={styles.nom}>{membre.nom}</h3>
              <p className={styles.roles}>
                {membre.roles.map((role, i) => (
                  <React.Fragment key={role}>
                    {i > 0 && <span className={styles.puce} aria-hidden="true"> • </span>}
                    {role}
                  </React.Fragment>
                ))}
              </p>
            </motion.article>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
