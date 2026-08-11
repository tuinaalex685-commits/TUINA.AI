"use client";

import React from 'react';
import { getAdUnit } from '@/lib/ads/config';
import AdsterraUnit from './AdsterraUnit';

/**
 * PUBLICITÉ PENDANT UNE GÉNÉRATION.
 *
 * Une régie publicitaire ne se "déclenche" pas à la demande : ses formats décident
 * eux-mêmes quand s'afficher. Ce qu'on peut faire, en revanche, c'est placer une
 * unité là où l'étudiant a de toute façon quelque chose à attendre — la génération
 * d'une banque d'examen ou d'un paquet de flashcards prend plusieurs dizaines de
 * secondes. L'attente existe déjà ; la publicité l'occupe au lieu de la subir.
 *
 * Deux règles tenues :
 *   - elle n'apparaît QUE pendant l'attente et disparaît avec elle ;
 *   - rien n'oblige à la regarder ni à cliquer dessus : le travail continue tout
 *     seul dès qu'il est prêt.
 *
 * `premium` vient du serveur (page ou layout). Pour un membre Premium, ce composant
 * ne rend rien et aucun script de régie n'est chargé.
 */
export default function AdWaitBanner({ premium }: { premium?: boolean }) {
  if (premium) return null;

  const unit = getAdUnit('dashboard');
  if (!unit) return null;

  return (
    <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', width: '100%' }}>
      <AdsterraUnit unit={unit} />
    </div>
  );
}
