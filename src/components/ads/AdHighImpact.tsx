"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * FORMAT PUBLICITAIRE HAUTE VISIBILITÉ (Social Bar / Interstitiel Adsterra).
 *
 * Contrairement à la bannière, ces formats ne s'insèrent pas à un endroit précis
 * de la page : la régie injecte un script unique qui gère lui-même son affichage
 * (barre flottante, plein écran entre deux navigations). L'intégration se limite
 * donc à charger ce script — sur les pages où c'est acceptable, et pour les
 * comptes Free uniquement.
 *
 * Ce composant n'est JAMAIS rendu pour un membre Premium : c'est <AdHighImpactSlot />,
 * côté serveur, qui décide de son existence. Aucun script n'est chargé, il n'y a
 * donc rien à masquer.
 *
 * ROUTES EXCLUES — un format plein écran qui surgit au milieu d'un examen chronométré
 * ou d'un cas pratique ne fait pas fuir que la publicité, il fait fuir l'étudiant.
 * La publicité accompagne la navigation, elle n'interrompt jamais un travail en cours.
 */
const ROUTES_SANS_PUB = [
  '/app/examen/',      // épreuve chronométrée en cours
  '/app/etude/',       // étude guidée / cas pratique en cours
  '/app/redaction',    // rédaction en cours
];

export default function AdHighImpact({ scriptUrl }: { scriptUrl: string }) {
  const pathname = usePathname() || '';
  const exclue = ROUTES_SANS_PUB.some((r) => pathname.startsWith(r));

  useEffect(() => {
    if (exclue || !scriptUrl) return;

    // Garde d'unicité : Next.js conserve le layout entre les navigations, un montage
    // par page empilerait les scripts et multiplierait les affichages.
    const marqueur = 'data-ad-high-impact';
    if (document.querySelector(`script[${marqueur}]`)) return;

    const s = document.createElement('script');
    s.src = scriptUrl;
    s.async = true;
    s.setAttribute(marqueur, 'true');
    document.body.appendChild(s);

    // Pas de retrait au démontage : ces formats gèrent leur propre cycle de vie et
    // retirer le script en cours de route laisse des éléments orphelins dans la page.
  }, [scriptUrl, exclue]);

  return null;
}
