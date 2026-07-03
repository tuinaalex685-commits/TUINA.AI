"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

import Hero from "../components/hero/Hero";
import Story from "../components/story/Story";
import Features from "../components/features/Features";
import Different from "../components/different/Different";
import Finale from "../components/finale/Finale";

export default function Home() {
  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.logo}>TUINA.AI</div>
        <Link href="/login" className={styles.loginBtn}>
          Se connecter
        </Link>
      </nav>

      <Hero />
      <Story />
      <Features />
      <Different />
      <Finale />

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Tuina.ai. Tous droits réservés.</p>
      </footer>
    </div>
  );
}
