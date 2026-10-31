import Link from 'next/link';
import styles from '@/components/etude3/etude3.module.css';

/**
 * Écran d'une section suspendue pour le lancement (lib/features.ts). Pas une impasse : il dit ce
 * qui arrive et renvoie vers ce que l'étudiant peut déjà faire. Composant serveur, sans requête.
 */
const CONTENU = {
  etude: {
    titre: 'Étude guidée',
    texte: 'Nous finalisons l’Étude guidée : tes cours expliqués leçon par leçon, avec des vérifications corrigées. Elle sera ouverte très bientôt, et rien de ce que tu as déjà commencé ne sera perdu.',
  },
  catalogue: {
    titre: 'Catalogue',
    texte: 'Nous préparons les cours du catalogue de ton année. Ils seront disponibles très bientôt.',
  },
} as const;

export default function BientotDisponible({ section, premium }: { section: keyof typeof CONTENU; premium: boolean }) {
  const { titre, texte } = CONTENU[section];
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>Bientôt disponible</p>
        <h1 className={styles.title}>{titre}</h1>
        <p className={styles.lead} style={{ maxWidth: '62ch' }}>{texte}</p>
      </header>
      <section aria-labelledby="deja-t" style={{ marginTop: 'var(--s-6, 32px)' }}>
        <h2 id="deja-t" className={styles.kicker}>En attendant, tu peux déjà</h2>
        <div className={styles.actions}>
          {premium ? (
            <>
              <Link href="/app/examen" className={styles.primary}>Passer un examen sur ton cours</Link>
              <Link href="/app/redaction" className={styles.secondary}>T’entraîner à la rédaction</Link>
              <Link href="/app/bibliotheque" className={styles.secondary}>Ouvrir mes documents</Link>
            </>
          ) : (
            <>
              <Link href="/app/revisions" className={styles.primary}>Réviser</Link>
              <Link href="/app/progression" className={styles.secondary}>Voir ma progression</Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
