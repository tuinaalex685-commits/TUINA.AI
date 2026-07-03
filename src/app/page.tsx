"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

import Hero from "../components/hero/Hero";
import Status from "../components/status/Status";
import Articles from "../components/articles/Articles";
import Finale from "../components/finale/Finale";

export default function Home() {
  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.logo}>TUINA.AI</div>
        <Link href="/login" className={styles.loginBtn}>
          Connexion
        </Link>
      </nav>

      <Hero />
      <Status />
      <Articles />
      <Finale />

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Tuina.ai. Tous droits réservés.</p>
      </footer>
    </div>
  );
}
