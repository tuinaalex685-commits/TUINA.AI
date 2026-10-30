import React from 'react';
import styles from './etude3.module.css';

/**
 * Texte produit par l'IA, rendu en texte React uniquement (jamais de HTML injecté) ; seul le
 * **gras** devient un terme surligné. Utilisable côté serveur comme dans un composant client.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4
          ? <strong key={i} className={styles.term}>{p.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>,
      )}
    </>
  );
}
