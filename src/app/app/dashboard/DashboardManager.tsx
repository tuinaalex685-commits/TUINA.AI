"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpenText, Layers, GraduationCap, Upload, Library } from 'lucide-react';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase/client';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import { markOnboardingSeen } from '@/app/actions/onboarding';
import { formatDate } from '@/lib/format';

export interface ResumeItem { title: string; href: string; finished: boolean }
export interface ExamItem { id: string; title: string; score: number | null; date: string | null; documentId: string | null }

interface Props {
  premium: boolean;
  resume: ResumeItem | null;
  dueCount: number;
  stats: { documents: number; flashcards: number; redactions: number };
  exams: ExamItem[];
  objectifs: { id: string; titre: string; progression: number; cible: number }[];
  onboardingSeen?: boolean;
  expiredOn?: string | null;
}

function todayLabel(): string {
  const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Ouagadougou' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const RENEW_URL = `https://wa.me/22657138126?text=${encodeURIComponent('Bonjour, je souhaite renouveler mon abonnement SJP Premium (2 500 FCFA pour 30 jours).')}`;

export default function DashboardManager({ premium, resume, dueCount, stats, exams, objectifs, onboardingSeen = true, expiredOn = null }: Props) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(!onboardingSeen);
  const [today] = useState(todayLabel);
  const closeGuide = () => { setGuideOpen(false); markOnboardingSeen().catch(() => {}); };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // router.refresh() relance tout le rendu serveur : on regroupe les changements sur 5 s
        // et on ne recharge que si l'onglet est visible.
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (document.visibilityState === 'visible') router.refresh();
        }, 5000);
      })
      .subscribe();
    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className={styles.page}>
      <OnboardingGuide open={guideOpen} onClose={closeGuide} premium={premium} />

      {expiredOn && (
        <section className={styles.expired} role="status">
          <div>
            <p className={styles.expiredTitle}>Ton abonnement Premium a expiré le {formatDate(expiredOn)}.</p>
            <p className={styles.expiredText}>Tu es repassé en version gratuite. Tes documents, ta progression et ton historique sont conservés.</p>
          </div>
          <div className={styles.expiredActions}>
            <a href={RENEW_URL} target="_blank" rel="noopener noreferrer" className={styles.expiredCta}>Renouveler sur WhatsApp</a>
            <Link href="/app/compte" className={styles.expiredLink}>J’ai un nouveau code</Link>
          </div>
        </section>
      )}

      <header className={styles.head}>
        <p className={styles.date}>{today}</p>
        <h1 className={styles.title}>Bonjour</h1>
      </header>

      {/* L'action principale : reprendre, ou commencer. */}
      <section className={styles.hero} aria-labelledby="reprendre">
        {resume ? (
          <>
            <p className={styles.heroKicker} id="reprendre">{resume.finished ? 'Dernier cours terminé' : 'Reprendre où tu t’es arrêté'}</p>
            <h2 className={styles.heroTitle}>{resume.title}</h2>
            <Link href={resume.href} className={styles.heroCta}>
              <BookOpenText size={18} aria-hidden />
              {resume.finished ? 'Revoir le cours' : 'Continuer l’étude guidée'}
            </Link>
          </>
        ) : premium ? (
          <>
            <p className={styles.heroKicker} id="reprendre">Pour commencer</p>
            <h2 className={styles.heroTitle}>Importe ton premier cours en PDF</h2>
            <p className={styles.heroText}>SJP le découpe en notions, te l’explique pas à pas, puis t’entraîne dessus.</p>
            <Link href="/app/bibliotheque" className={styles.heroCta}>
              <Upload size={18} aria-hidden /> Importer un cours
            </Link>
          </>
        ) : (
          <>
            <p className={styles.heroKicker} id="reprendre">Pour commencer</p>
            <h2 className={styles.heroTitle}>Choisis un cours dans le catalogue</h2>
            <p className={styles.heroText}>Étude guidée, révisions et examens sont prêts sur chaque cours du catalogue.</p>
            <Link href="/app/catalogue" className={styles.heroCta}>
              <Library size={18} aria-hidden /> Ouvrir le catalogue
            </Link>
          </>
        )}
      </section>

      <div className={styles.grid}>
        {/* Révisions dues */}
        <section className={styles.panel} aria-labelledby="reviser">
          <div className={styles.panelHead}>
            <Layers size={18} className={styles.panelIcon} aria-hidden />
            <h3 id="reviser" className={styles.panelTitle}>À réviser aujourd’hui</h3>
          </div>
          {dueCount > 0 ? (
            <>
              <p className={styles.bigNumber}><span className="tabular">{dueCount}</span> <span className={styles.bigUnit}>{dueCount > 1 ? 'cartes' : 'carte'}</span></p>
              <Link href="/app/revisions" className={styles.panelLink}>Commencer la révision <ArrowRight size={16} aria-hidden /></Link>
            </>
          ) : (
            <p className={styles.muted}>
              {stats.flashcards > 0
                ? 'Rien de dû aujourd’hui. Tes cartes reviendront au bon moment.'
                : 'Pas encore de cartes. Elles se créent depuis un cours, dans Révisions.'}
            </p>
          )}
        </section>

        {/* Derniers examens */}
        <section className={styles.panel} aria-labelledby="examens">
          <div className={styles.panelHead}>
            <GraduationCap size={18} className={styles.panelIcon} aria-hidden />
            <h3 id="examens" className={styles.panelTitle}>Derniers examens</h3>
          </div>
          {exams.length > 0 ? (
            <ul className={styles.list}>
              {exams.map((e) => (
                <li key={e.id} className={styles.listRow}>
                  <Link href={e.documentId ? `/app/examen/resultats/${e.documentId}` : '/app/examen'} className={styles.listLink}>
                    <span className={styles.listTitle}>{e.title}</span>
                    <span className={styles.listMeta}>{formatDate(e.date)}</span>
                  </Link>
                  {e.score !== null && (
                    <span className={`${styles.score} tabular ${e.score >= 10 ? styles.scoreOk : styles.scoreLow}`}>
                      {e.score.toFixed(1).replace('.', ',')}/20
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className={styles.muted}>Aucun examen passé pour l’instant.</p>
              <Link href="/app/examen" className={styles.panelLink}>Passer un examen <ArrowRight size={16} aria-hidden /></Link>
            </>
          )}
        </section>

        {/* Objectifs (Premium) */}
        {premium && (
          <section className={styles.panel} aria-labelledby="objectifs">
            <div className={styles.panelHead}>
              <h3 id="objectifs" className={styles.panelTitle}>Objectifs</h3>
              <Link href="/app/objectifs" className={styles.headLink}>Gérer</Link>
            </div>
            {objectifs.length > 0 ? (
              <ul className={styles.list}>
                {objectifs.map((o) => {
                  const pct = Math.min(100, Math.round((o.progression / Math.max(1, o.cible)) * 100));
                  return (
                    <li key={o.id} className={styles.goal}>
                      <div className={styles.goalTop}>
                        <span className={styles.listTitle}>{o.titre}</span>
                        <span className={`${styles.listMeta} tabular`}>{o.progression}/{o.cible}</span>
                      </div>
                      <div className={styles.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={o.titre}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.muted}>Fixe-toi un objectif simple, par exemple « réviser 30 cartes cette semaine ».</p>
            )}
          </section>
        )}
      </div>

      <footer className={styles.footer}>
        <dl className={styles.stats}>
          {premium && (<div><dt>Documents</dt><dd className="tabular">{stats.documents}</dd></div>)}
          <div><dt>Cartes de révision</dt><dd className="tabular">{stats.flashcards}</dd></div>
          {premium && (<div><dt>Rédactions</dt><dd className="tabular">{stats.redactions}</dd></div>)}
        </dl>
        <button type="button" className={styles.guideLink} onClick={() => setGuideOpen(true)}>Revoir le guide de démarrage</button>
      </footer>
    </div>
  );
}
