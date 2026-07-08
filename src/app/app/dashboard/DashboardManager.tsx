"use client";

import React, { useEffect } from 'react';
import { Badge } from '@/components/ui/Badge/Badge';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  BookOpen, 
  Library, 
  FileText, 
  BrainCircuit, 
  CheckSquare, 
  PenTool, 
  ArrowRight,
  Target,
  Zap
} from 'lucide-react';

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

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // Debounce pour éviter de spammer router.refresh()
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          router.refresh();
        }, 1000);
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const totalActivities = (stats.matieresCount || 0) + (stats.evaluationsCount || 0) + flashcardsCount + (stats.redactionsCount || 0);
  const progression = totalActivities > 0 ? Math.min(100, Math.round(totalActivities * 2)) : 0;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.welcome}>Bonjour, {user.email?.split('@')[0]} 👋</h1>
        <p className={styles.subtitle}>Prêt à exceller ? Voici votre espace de pilotage.</p>
      </header>

      <div className={styles.grid}>
        {/* Progression Globale */}
        <div className={`${styles.cardPremium} ${styles.progressCard}`}>
          <div className={styles.progressHeader}>
            <h3>Activité Globale</h3>
            {progression > 0 ? <Badge status="mastered">En cours</Badge> : <Badge status="neutral">Nouveau</Badge>}
          </div>
          <div className={styles.donutContainer}>
            <svg viewBox="0 0 36 36" className={styles.circularChart}>
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2D6BE4" />
                  <stop offset="100%" stopColor="#7C5CFF" />
                </linearGradient>
              </defs>
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
              <text x="18" y="20.8" className={styles.percentage}>{progression}%</text>
            </svg>
            <p className={styles.donutSubtitle}>Indice de régularité</p>
          </div>
        </div>

        {/* Section Objectifs */}
        <div className={`${styles.cardPremium} ${styles.objectivesCard}`}>
          <div className={styles.objectivesHeader}>
            <h3>Vos Objectifs Actifs</h3>
            <Link href="/app/objectifs" className={styles.link}>
              Gérer <ArrowRight size={16} />
            </Link>
          </div>
          {objectifs.length > 0 ? (
            <ul className={styles.objectivesList}>
              {objectifs.map((obj: any) => (
                <li key={obj.id} className={styles.objectiveItem}>
                  <div className={styles.objectiveInfo}>
                    <div className={styles.objectiveIcon}>
                      <Target size={20} />
                    </div>
                    <div>
                      <div className={styles.objectiveTitle}>{obj.titre || obj.type || 'Objectif'}</div>
                    </div>
                  </div>
                  <div className={styles.objectiveProgressContainer}>
                    <span className={styles.objectiveProgressText}>{obj.progression || 0} / {obj.cible || 1}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
              Aucun objectif en cours. Fixez-vous des buts pour rester motivé !
            </div>
          )}
        </div>

        {/* Section Prochaines révisions */}
        <div className={`${styles.cardPremium} ${styles.revisionsCard}`}>
          <div className={styles.revisionsHeader}>
            <h3>À réviser aujourd'hui</h3>
            {flashcardsCount > 0 ? <Badge status="review">{flashcardsCount} éléments</Badge> : <Badge status="neutral">Prêt</Badge>}
          </div>
          <div className={styles.revisionsContent}>
            {flashcardsCount > 0 ? (
              <>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--color-text-main)' }}>Entraînement de l'esprit</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>Vous avez {flashcardsCount} flashcards qui vous attendent.</p>
                </div>
                <Link href="/app/revisions" prefetch={true} className={styles.startSessionButton}>
                  <Zap size={18} /> Lancer la session
                </Link>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: 0 }}>
                Aucune révision prévue pour le moment. Importez des PDF pour générer des flashcards.
              </p>
            )}
          </div>
        </div>

        {/* Statistiques Réelles (Mosaïque) */}
        <div className={styles.statsContainer}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>Vos Connaissances</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(27, 58, 107, 0.1)', color: 'var(--color-primary)' }}>
                <Library size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{stats.matieresCount || 0}</p>
                <p className={styles.statWidgetLabel}>Matières</p>
              </div>
            </div>

            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(45, 107, 228, 0.1)', color: 'var(--color-accent)' }}>
                <BookOpen size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{stats.coursCount || 0}</p>
                <p className={styles.statWidgetLabel}>Cours</p>
              </div>
            </div>

            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' }}>
                <FileText size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{stats.documentsCount || 0}</p>
                <p className={styles.statWidgetLabel}>PDF Indexés</p>
              </div>
            </div>

            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
                <BrainCircuit size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{flashcardsCount}</p>
                <p className={styles.statWidgetLabel}>Flashcards</p>
              </div>
            </div>

            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(22, 163, 74, 0.1)', color: '#16A34A' }}>
                <CheckSquare size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{stats.evaluationsCount || 0}</p>
                <p className={styles.statWidgetLabel}>Évaluations</p>
              </div>
            </div>

            <div className={styles.statWidget}>
              <div className={styles.statWidgetIcon} style={{ background: 'rgba(124, 92, 255, 0.1)', color: '#7C5CFF' }}>
                <PenTool size={24} />
              </div>
              <div>
                <p className={styles.statWidgetValue}>{stats.redactionsCount || 0}</p>
                <p className={styles.statWidgetLabel}>Rédactions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
