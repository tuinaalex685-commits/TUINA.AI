import React from 'react';
import Link from 'next/link';
import styles from './auth.module.css';

/**
 * Cadre commun des pages Connexion et Inscription.
 * À gauche (ordinateur) : un article du Code civil annoté comme le fait un étudiant — la
 * méthode SJP en une image. Texte de l'article 1101 dans sa rédaction issue du Code de 1804,
 * celle qu'appliquent encore la plupart des pays francophones d'Afrique de l'Ouest.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <aside className={styles.visual}>
        <Link href="/" className={styles.brand}>SJP</Link>

        <figure className={styles.excerpt}>
          <figcaption className={styles.source}>Code civil, article 1101</figcaption>
          <blockquote className={styles.article}>
            Le contrat est une <mark className={styles.mark}>convention</mark> par laquelle une ou plusieurs
            personnes <mark className={styles.mark}>s’obligent</mark>, envers une ou plusieurs autres, à
            donner, à faire ou à ne pas faire quelque chose.
          </blockquote>
          <p className={styles.note}>
            <span className={styles.noteLine} />
            accord de volontés qui crée des obligations
          </p>
        </figure>

        <p className={styles.tagline}>
          Comprendre le cours, retenir l’essentiel, le réutiliser le jour de l’examen.
        </p>
      </aside>

      <main className={styles.formSide}>
        <Link href="/" className={styles.mobileBrand}>SJP</Link>
        <div className={styles.formBox}>{children}</div>
      </main>
    </div>
  );
}
