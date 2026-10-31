import React from 'react';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata = { title: 'Politique de confidentialité | SJP' };

/** Politique de confidentialité : ce que SJP collecte, pourquoi, et ce que l'étudiant peut demander. */
export default function ConfidentialitePage() {
  return (
    <main className={styles.page}>
      <p className={styles.retour}><Link href="/">SJP</Link></p>
      <h1 className={styles.titre}>Politique de confidentialité</h1>
      <p className={styles.maj}>Dernière mise à jour : 30 octobre 2026</p>

      <h2>Qui sommes-nous</h2>
      <p>SJP (Sciences juridiques et politiques) est une plateforme d’apprentissage destinée aux étudiants en droit et en sciences politiques. Cette page explique quelles données nous traitons et pourquoi.</p>

      <h2>Les données que nous collectons</h2>
      <ul>
        <li><strong>Ton compte</strong> : ton adresse email, ton mot de passe (conservé chiffré par notre prestataire d’authentification, jamais lisible par nous), ton année d’études et, si tu te connectes avec Google, ton nom et ton adresse email Google.</li>
        <li><strong>Ton travail</strong> : ta progression dans les études guidées, tes réponses aux exercices, tes examens, tes copies de rédaction et tes fiches de révision.</li>
        <li><strong>Tes cours</strong> (comptes Premium) : les PDF que tu importes et le texte qui en est extrait.</li>
        <li><strong>Des données techniques</strong> : adresse IP et informations de connexion, utilisées pour la sécurité (limiter les tentatives de connexion) et le bon fonctionnement du service.</li>
      </ul>

      <h2>Pourquoi nous les utilisons</h2>
      <ul>
        <li>Te connecter et sécuriser ton compte.</li>
        <li>Construire tes parcours d’étude, corriger tes exercices et suivre ta progression.</li>
        <li>Gérer ton abonnement Premium (codes d’accès).</li>
      </ul>
      <p>Nous ne vendons pas tes données et nous ne les utilisons pas pour entraîner un modèle d’intelligence artificielle.</p>

      <h2>Nos prestataires</h2>
      <ul>
        <li><strong>Supabase</strong> : base de données, authentification et stockage des fichiers.</li>
        <li><strong>Vercel</strong> : hébergement du site.</li>
        <li><strong>Google (Gemini)</strong> : le texte de tes cours et tes réponses rédigées lui sont transmis pour produire les explications et les corrections.</li>
        <li><strong>Google</strong> : connexion avec un compte Google, si tu la choisis.</li>
      </ul>
      <p>SJP n’affiche aucune publicité : aucune régie publicitaire ne reçoit tes données.</p>

      <h2>Combien de temps nous les gardons</h2>
      <p>Tes données sont conservées tant que ton compte existe. Si tu supprimes un document, son fichier est supprimé de notre stockage. Sur demande, nous supprimons ton compte et les données qui y sont liées.</p>

      <h2>Tes droits</h2>
      <p>Tu peux demander à consulter, corriger ou supprimer tes données en contactant l’administrateur de SJP depuis la page « Mon compte ».</p>

      <h2>Sécurité</h2>
      <p>Les échanges sont chiffrés (HTTPS), chaque étudiant n’accède qu’à ses propres données, et tes fichiers ne sont lisibles que par toi.</p>
    </main>
  );
}
