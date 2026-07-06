"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

import Hero from "../components/hero/Hero";
import Story from "../components/story/Story";
import Features from "../components/features/Features";
import Different from "../components/different/Different";
import Pricing from "../components/pricing/Pricing";
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
      <Pricing />
      <Finale />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p className={styles.copyright}>© {new Date().getFullYear()} Tuina.ai. Tous droits réservés.</p>
          <div className={styles.footerInfo}>
            <span style={{ fontSize: '18px' }}>🇧🇫</span>
            <span className={styles.separator}>•</span>
            <a href="tel:+22657138126" className={styles.contactLink}>Contact : +226 57 13 81 26</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
