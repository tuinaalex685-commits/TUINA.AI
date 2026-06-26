"use client";

import React, { useEffect } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function DashboardManager({
  user,
  stats,
  objectifs,
  flashcardsCount
}: {
  user: any;
  stats: any;
  objectifs: any[];
  flashcardsCount: number;
}) {
  const router = useRouter();

  // Écoute globale sur la base de données pour rafraîchir le dashboard en temps réel
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        router.refresh(); // Soft-refresh Next.js (récupère les nouvelles données serveur sans recharger la page)
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const progression = (stats.chapitresCount || 0) > 0 ? 5 : 0;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.welcome}>Bonjour, {user.email?.split('@')[0]} 👋</h1>
        <p className={styles.subtitle}>Voici un résumé de votre progression réelle.</p>
      </header>

      <div className={styles.grid}>
        {/* Progression Globale */}
        <Card className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <h3>Progression Globale</h3>
            {progression > 0 ? <Badge status="mastered">En cours</Badge> : <Badge status="neutral">Nouveau</Badge>}
          </div>
          <div className={styles.donutContainer}>
            <svg viewBox="0 0 36 36" className={styles.circularChart}>
              <path className={styles.circleBg}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {progression > 0 && (
                <path className={styles.circle}
                  strokeDasharray={`${progression}, 100`}
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              )}
              <text x="18" y="20.35" className={styles.percentage}>{progression}%</text>
            </svg>
            <p className={styles.donutSubtitle}>Du programme maîtrisé</p>
          </div>
        </Card>

        {/* Section Objectifs */}
        <Card className={styles.objectivesCard}>
          <div className={styles.objectivesHeader}>
            <h3>Vos Objectifs</h3>
            <a href="/app/objectifs" className={styles.link}>Voir tout</a>
          </div>
          {objectifs.length > 0 ? (
            <ul className={styles.objectivesList}>
              {objectifs.map((obj: any) => (
                <li key={obj.id} className={styles.objectiveItem}>
                  <div className={styles.objectiveInfo}>
                    <span className={styles.objectiveIcon}>🎯</span>
                    <div>
                      <div className={styles.objectiveTitle}>{obj.titre}</div>
                    </div>
                  </div>
                  <span className={styles.objectiveProgress}>{obj.progression} / {obj.cible}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: '20px 0', color: 'var(--color-text-secondary)', textAlign: 'center', fontSize: '14px' }}>
              Aucun objectif en cours.
            </div>
          )}
        </Card>

        {/* Section Prochaines révisions */}
        <Card className={styles.revisionsCard}>
          <div className={styles.revisionsHeader}>
            <h3>À réviser aujourd'hui</h3>
            {flashcardsCount > 0 ? <Badge status="review">{flashcardsCount} éléments</Badge> : <Badge status="neutral">0 élément</Badge>}
          </div>
          <div className={styles.revisionsContent}>
            {flashcardsCount > 0 ? (
              <>
                <p>{flashcardsCount} Flashcards en attente</p>
                <button className={styles.startSessionButton} onClick={() => router.push('/app/revisions')}>Lancer la session</button>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Aucune révision prévue pour le moment. Importez des PDF pour générer des flashcards.</p>
            )}
          </div>
        </Card>

        {/* Activité récente */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard) 0' }}>Statistiques Réelles</h3>
          <div style={{ display: 'flex', gap: 'var(--spacing-large)' }}>
            <div><strong>Matières :</strong> {stats.matieresCount || 0}</div>
            <div><strong>Cours :</strong> {stats.coursCount || 0}</div>
            <div><strong>Chapitres :</strong> {stats.chapitresCount || 0}</div>
            <div><strong>Documents PDF :</strong> {stats.documentsCount || 0}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
