import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, getAnalyse, getCartesModules, getParcours, parcoursAncien } from '@/lib/etude3/store';
import { bornesLecons, leconsPourCarte, vuesDuCours } from '@/lib/etude3/cartes';
import { Rich } from '@/components/etude3/Blocks';
import { BeginPath, PrintButton } from '@/components/etude3/StudyClient';
import CarteInteractive from '@/components/etude3/CarteInteractive';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Introduction au cours | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Synthèse v4 : l'INTRODUCTION PÉDAGOGIQUE au cours, lue avant le parcours (et téléchargeable).
 * Elle ne reproduit pas le cours : elle dit ce que l'étudiant va apprendre et pourquoi, montre
 * la carte, explique chaque grande branche comme un enseignant au tableau, et prépare le détail.
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
  if (!parcours?.source_hash || parcoursAncien(parcours)) redirect(`/app/etude/${pdfId}`);
  const [analyse, modules] = await Promise.all([getAnalyse(parcours.source_hash, true), getCartesModules(parcours.source_hash)]);
  const s = analyse?.synthese;
  if (analyse?.statut !== 'pret' || !s || !Array.isArray(s.branches)) redirect(`/app/etude/${pdfId}`);

  const plan = analyse.plan || [];
  const couv = analyse.couverture;
  const vues = vuesDuCours(s.carte, modules, s.titre);
  const debloquee = parcours.synthese_vue_at ? parcours.sequence_max : 0;
  const titreModule = new Map(modules.map((m) => [m.id, m.titre]));

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.crumbs} aria-label="Fil d’Ariane">
          <Link href="/app/etude">Études guidées</Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/app/etude/${pdfId}`}>{acces.nom}</Link>
        </nav>
        <p className={styles.kicker}>Avant de commencer</p>
        <h1 className={styles.title}>{s.titre}</h1>
        <p className={styles.printOnly} style={{ marginTop: 8, fontSize: '10pt', color: '#555' }}>
          Introduction au cours, SJP. Cours : {acces.nom}{couv ? `. Pages lues : ${couv.pages_lues} sur ${couv.pages_total}` : ''}.
        </p>
        <div className={styles.actions} data-print="hide" style={{ marginTop: 'var(--s-5)' }}>
          {!parcours.synthese_vue_at ? <BeginPath documentId={pdfId} /> : <Link href={`/app/etude/${pdfId}`} className={styles.primary}>Retour au parcours</Link>}
          <PrintButton />
        </div>
      </header>

      <div className={styles.reader}>
        <nav className={styles.toc} aria-label="Sommaire">
          <ol className={styles.tocList}>
            <li><a href="#apprendre">Ce que tu vas apprendre</a></li>
            {s.questions.length > 0 && <li><a href="#questions">Les grandes questions</a></li>}
            {vues.length > 0 && <li><a href="#carte">La carte du cours</a></li>}
            <li><a href="#branches">Le cours, partie par partie</a></li>
            {(s.pieges.length > 0 || s.a_retenir.length > 0) && <li><a href="#retenir">Pièges et points clés</a></li>}
          </ol>
        </nav>

        <article className={styles.prose}>
          <section id="apprendre" aria-labelledby="apprendre-t">
            <h2 id="apprendre-t" className={styles.h2} style={{ marginTop: 0 }}>Ce que tu vas apprendre</h2>
            <div className={styles.lead}>{s.presentation.split(/\n{2,}/).map((p, i) => <p key={i} className={styles.p}><Rich text={p} /></p>)}</div>
            {s.pourquoi && <p className={`${styles.p} ${styles.ideeCentrale}`}><strong>Pourquoi c’est important. </strong><Rich text={s.pourquoi} /></p>}
          </section>

          {s.questions.length > 0 && (
            <section id="questions" aria-labelledby="questions-t">
              <h2 id="questions-t" className={styles.h2}>Les grandes questions de ce cours</h2>
              <p className={styles.p}>Tout le cours répond à ces questions. Garde-les en tête : chaque leçon t’apporte une partie de la réponse.</p>
              <ol className={styles.questions}>
                {s.questions.map((q, i) => (
                  <li key={i} className={styles.questionCard}>
                    <p className={styles.questionQ}>{q.question}</p>
                    <p className={styles.questionR}><Rich text={q.reponse} /></p>
                    {q.ou && <p className={styles.questionOu}>{q.ou}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {vues.length > 0 && (
            <section id="carte" aria-labelledby="carte-t" data-print="hide">
              <h2 id="carte-t" className={styles.h2}>La carte du cours</h2>
              <p className={styles.p}>Commence par la vue d’ensemble, puis ouvre la carte de chaque partie. Touche une notion pour voir ce qu’elle recouvre et où tu l’apprendras.</p>
              <CarteInteractive vues={vues} lecons={leconsPourCarte(plan)} pdfId={pdfId} debloquee={debloquee} />
            </section>
          )}

          <section id="branches" aria-labelledby="branches-t">
            <h2 id="branches-t" className={styles.h2}>Le cours, partie par partie</h2>
            <div className={styles.branches}>
              {s.branches.map((b, i) => {
                const bornes = bornesLecons(plan, b.modules);
                return (
                  <section key={b.id} className={styles.branch} aria-labelledby={`${b.id}-t`}>
                    <span className={styles.branchNum} aria-hidden>{i + 1}</span>
                    <h3 id={`${b.id}-t`} className={styles.h3}>{b.titre}</h3>
                    <p className={`${styles.p} ${styles.branchIdee}`}><Rich text={b.idee} /></p>
                    <p className={styles.p}><span className={styles.branchLabel}>En mots simples. </span><Rich text={b.simple} /></p>
                    <p className={styles.p}><span className={styles.branchLabel}>Comment elle se relie au reste. </span><Rich text={b.liens} /></p>
                    {b.essentiel && b.essentiel.length > 0 && (
                      <div className={styles.essentiel}>
                        <p className={styles.essentielTitre}>L’essentiel de cette partie</p>
                        <ul className={styles.list}>{b.essentiel.map((e, k) => <li key={k}><Rich text={e} /></li>)}</ul>
                      </div>
                    )}
                    {b.exemple && (
                      <aside className={styles.example}><p className={styles.exampleTitle}>Exemple</p><p className={styles.p}><Rich text={b.exemple} /></p></aside>
                    )}
                    <p className={styles.warning}><span className={styles.calloutLabel}>Avant d’attaquer le détail. </span><Rich text={b.avant_de_commencer} /></p>
                    {b.modules.length > 0 && (
                      <p className={styles.branchMeta} data-print="hide">
                        {bornes ? `Dans ton parcours : leçon${bornes.a > bornes.de ? `s ${bornes.de} à ${bornes.a}` : ` ${bornes.de}`}. ` : ''}
                        {b.modules.some((m) => vues.some((v) => v.id === m)) && 'Cartes : '}
                        {b.modules.filter((m) => vues.some((v) => v.id === m)).map((m, k) => (
                          <React.Fragment key={m}>{k > 0 && ' · '}<Link href={`/app/etude/${pdfId}/carte?vue=${m}`}>{titreModule.get(m) || m}</Link></React.Fragment>
                        ))}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          </section>

          {(s.pieges.length > 0 || s.a_retenir.length > 0) && (
            <section id="retenir" aria-labelledby="retenir-t">
              <h2 id="retenir-t" className={styles.h2}>Dès le départ</h2>
              {s.pieges.length > 0 && (
                <div className={styles.trap} style={{ marginTop: 'var(--s-4)' }}>
                  <p className={styles.calloutLabel} style={{ margin: '0 0 var(--s-2)' }}>Les confusions à éviter</p>
                  <ul className={styles.list}>{s.pieges.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
                </div>
              )}
              {s.a_retenir.length > 0 && (
                <div className={styles.memo} style={{ marginTop: 'var(--s-6)' }}>
                  <h2>À retenir</h2>
                  <ul>{s.a_retenir.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
                </div>
              )}
            </section>
          )}

          {s.a_approfondir.length > 0 && (
            <section>
              <h2 className={styles.h2}>Ce que le cours laisse ouvert</h2>
              <ul className={styles.list} style={{ marginTop: 'var(--s-3)' }}>{s.a_approfondir.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
            </section>
          )}

          <p className={styles.notice} style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
            Cette introduction présente l’organisation de ton cours ; les leçons en donnent le détail, avec les définitions de l’auteur et les pages de ton document. En cas de doute, ton cours et ton enseignant font foi.
          </p>
          {!parcours.synthese_vue_at && <div className={styles.actions} data-print="hide"><BeginPath documentId={pdfId} /></div>}
          {parcours.synthese_vue_at && vues.length > 0 && (
            <p data-print="hide"><Link href={`/app/etude/${pdfId}/carte`} className={styles.link}><MapIcon size={16} aria-hidden /> Ouvrir la carte en plein écran</Link></p>
          )}
        </article>
      </div>
    </div>
  );
}
