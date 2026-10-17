import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, getAnalyse, getParcours } from '@/lib/etude3/store';
import { Blocks, Rich } from '@/components/etude3/Blocks';
import { BeginPath, PrintButton } from '@/components/etude3/StudyClient';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthèse | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Synthèse pédagogique : lue en ligne, téléchargée en PDF par l'impression du navigateur (E-02).
 * Lecture seule en base : AUCUN appel IA, ni à l'affichage ni au téléchargement.
 */
export default async function SynthesePage({ params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;
  if (!UUID_RE.test(pdfId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const acces = await accesEtude(user.id, user.email, pdfId);
  if (!acces.ok) redirect('/app/etude');

  const parcours = await getParcours(user.id, pdfId);
  if (!parcours?.source_hash) redirect(`/app/etude/${pdfId}`);
  const analyse = await getAnalyse(parcours.source_hash, true);
  const s = analyse?.synthese;
  if (analyse?.statut !== 'pret' || !s) redirect(`/app/etude/${pdfId}`);

  const couv = analyse.couverture;
  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.crumbs} aria-label="Fil d’Ariane">
          <Link href="/app/etude">Études guidées</Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/app/etude/${pdfId}`}>{acces.nom}</Link>
        </nav>
        <h1 className={styles.title}>{s.titre}</h1>
        <p className={styles.printOnly} style={{ marginTop: 8, fontSize: '10pt', color: '#555' }}>
          Synthèse pédagogique SJP. Cours : {acces.nom}{couv ? `. Pages lues : ${couv.pages_lues} sur ${couv.pages_total}` : ''}.
        </p>
        <div className={styles.actions} data-print="hide" style={{ marginTop: 'var(--s-5)' }}>
          {!parcours.synthese_vue_at ? <BeginPath documentId={pdfId} /> : <Link href={`/app/etude/${pdfId}`} className={styles.primary}>Retour au parcours</Link>}
          <PrintButton />
        </div>
      </header>

      <div className={styles.reader}>
        <nav className={styles.toc} aria-label="Sommaire de la synthèse">
          <ol className={styles.tocList}>
            {s.sections.map((sec) => <li key={sec.id}><a href={`#${sec.id}`}>{sec.titre}</a></li>)}
            {s.fiche_memo.length > 0 && <li><a href="#memo">À retenir</a></li>}
          </ol>
        </nav>

        <article className={styles.prose}>
          {s.presentation && <p className={`${styles.p} ${styles.lead}`}><Rich text={s.presentation} /></p>}
          {s.plan.length > 0 && (
            <div>
              <p className={styles.p} style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>Le plan du cours</p>
              <ol className={styles.list}>{s.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </div>
          )}
          {s.sections.map((sec) => (
            <section key={sec.id} aria-labelledby={sec.id}>
              <h2 id={sec.id} className={styles.h2}>{sec.titre}</h2>
              {sec.idee_centrale && <p className={`${styles.p} ${styles.ideeCentrale}`} style={{ marginTop: 'var(--s-3)' }}><Rich text={sec.idee_centrale} /></p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)', marginTop: 'var(--s-5)' }}>
                <Blocks blocs={sec.blocs} />
              </div>
            </section>
          ))}
          {s.fiche_memo.length > 0 && (
            <section id="memo" className={styles.memo} style={{ marginTop: 'var(--s-10)' }}>
              <h2>À retenir</h2>
              <ul>{s.fiche_memo.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
            </section>
          )}
          {s.a_approfondir.length > 0 && (
            <section>
              <h2 className={styles.h2}>Pour aller plus loin</h2>
              <ul className={styles.list} style={{ marginTop: 'var(--s-3)' }}>{s.a_approfondir.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
            </section>
          )}
          <p className={styles.notice} style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
            Les mentions « Cours » renvoient à ton document et à ses pages ; « Explication » signale une reformulation pédagogique ; « Complément » une information générale qui ne figure pas dans ton cours. En cas de doute, ton cours et ton enseignant font foi.
          </p>
          {!parcours.synthese_vue_at && <div className={styles.actions} data-print="hide"><BeginPath documentId={pdfId} /></div>}
        </article>
      </div>
    </div>
  );
}
