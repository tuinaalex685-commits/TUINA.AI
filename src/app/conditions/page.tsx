import React from 'react';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata = { title: 'Conditions d’utilisation | SJP' };

/** Conditions d'utilisation de SJP. */
export default function ConditionsPage() {
  return (
    <main className={styles.page}>
      <p className={styles.retour}><Link href="/">SJP</Link></p>
      <h1 className={styles.titre}>Conditions d’utilisation</h1>
      <p className={styles.maj}>Dernière mise à jour : 30 octobre 2026</p>

      <h2>Le service</h2>
      <p>SJP aide les étudiants en droit et en sciences politiques à comprendre et réviser leurs cours : études guidées, révisions, examens et, en Premium, rédaction corrigée et import de ses propres cours.</p>

      <h2>Ton compte</h2>
      <ul>
        <li>Tu es responsable de la confidentialité de ton mot de passe et de ton code d’accès.</li>
        <li>Un compte est personnel : il ne peut pas être partagé.</li>
        <li>La version gratuite donne accès au catalogue de ton année d’études, avec des limites d’usage.</li>
        <li>La version Premium s’obtient avec un code d’accès remis par l’administrateur, valable 30 jours.</li>
      </ul>

      <h2>Les contenus</h2>
      <ul>
        <li>Tu n’importes que des documents que tu as le droit d’utiliser pour tes études.</li>
        <li>Les explications et corrections sont produites avec l’aide d’une intelligence artificielle à partir de ton cours. Elles peuvent contenir des erreurs : ton cours et ton enseignant font foi.</li>
        <li>Les cours du catalogue sont mis à disposition pour un usage personnel d’étude.</li>
      </ul>

      <h2>Usage interdit</h2>
      <p>Il est interdit de tenter d’accéder aux données d’un autre étudiant, de contourner les limites ou les protections du service, ou de l’utiliser de façon automatisée.</p>

      <h2>Données personnelles</h2>
      <p>Voir notre <Link href="/confidentialite">politique de confidentialité</Link>.</p>

      <h2>Modifications</h2>
      <p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de cette page.</p>
    </main>
  );
}
