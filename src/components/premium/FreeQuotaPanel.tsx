import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import { getDailyUsage, FREE_LIMITS, type FreeFeature } from '@/lib/quota';
import styles from './FreeQuotaPanel.module.css';

/**
 * BANDEAU DE PLAN — ce que l'étudiant Free peut encore faire aujourd'hui.
 *
 * Server Component : les compteurs viennent de la base, pas d'un état navigateur.
 * Un membre Premium ne voit rien du tout — pas de bandeau, pas de compteur, aucune
 * mention de limite qui n'existe pas pour lui.
 *
 * Les quotas sont affichés avant même d'être atteints : découvrir une limite au
 * moment où elle bloque est la meilleure façon de faire fuir quelqu'un.
 */
const LIBELLES: Record<FreeFeature, string> = {
  examen: 'Examens',
  revision: 'Révisions',
  cas_pratique: 'Cas pratiques',
};

export default async function FreeQuotaPanel() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (await isPremium(supabase, user.email)) return null;

  const usage = await getDailyUsage(user.id);
  const features = Object.keys(FREE_LIMITS) as FreeFeature[];

  return (
    <section className={styles.panel} aria-label="Votre plan">
      <div className={styles.head}>
        <div>
          <span className={styles.badge}>Version gratuite</span>
          <p className={styles.baseline}>
            Tu découvres SJP avec le <Link href="/app/catalogue" className={styles.lien}>catalogue de cours</Link>.
            Tes compteurs se remettent à zéro chaque jour.
          </p>
        </div>
        <Link href="/#pricing" className={styles.cta}>
          Passer au Premium
          <span className={styles.prix}>2 500 FCFA/mois</span>
        </Link>
      </div>

      {/* Intitulé indispensable : sans lui, "10 / 10" se lit aussi bien "10 utilisés
          sur 10" que "10 restants sur 10" — l'inverse exact du message voulu. */}
      <p className={styles.quotasTitre}>Ce qu'il te reste aujourd'hui</p>
      <ul className={styles.quotas}>
        {features.map((f) => {
          const quota = FREE_LIMITS[f];
          const used = Math.min(usage[f] ?? 0, quota);
          const restant = quota - used;
          const pct = Math.round((used / quota) * 100);
          return (
            <li key={f} className={styles.quota}>
              <div className={styles.quotaHead}>
                <span className={styles.quotaNom}>{LIBELLES[f]}</span>
                <span className={restant === 0 ? styles.quotaEpuise : styles.quotaReste}>
                  {restant} / {quota}
                </span>
              </div>
              <div className={styles.jauge}>
                <div
                  className={`${styles.jaugeRemplie} ${restant === 0 ? styles.jaugePleine : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
