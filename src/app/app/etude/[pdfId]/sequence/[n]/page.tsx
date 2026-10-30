import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, etatActivites, getAnalyse, getParcours, getSequence, parcoursAncien } from '@/lib/etude3/store';
import { ETAPES, versPublique } from '@/lib/etude3/types';
import { Blocks, Rich } from '@/components/etude3/Blocks';
import { SequencePreparing } from '@/components/etude3/StudyClient';
import SequenceRunner, { type EtatInitial } from '@/components/etude3/SequenceRunner';
import LeconGuidee from '@/components/etude3/LeconGuidee';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leçon | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une leçon. Garde SERVEUR : une leçon au-delà de la plus haute leçon débloquée est refusée,
 * même en tapant l'URL (on renvoie vers la leçon autorisée). Le retour en arrière vers une leçon
 * déjà débloquée est libre.
 */
export default async function SequencePage({ params }: { params: Promise<{ pdfId: string; n: string }> }) {
  const { pdfId, n } = await params;
  const ordre = Number(n);
  if (!UUID_RE.test(pdfId) || !Number.isInteger(ordre) || ordre < 1) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const acces = await accesEtude(user.id, user.email, pdfId);
  if (!acces.ok) redirect('/app/etude');

  const parcours = await getParcours(user.id, pdfId);
  if (!parcours?.source_hash || parcoursAncien(parcours)) redirect(`/app/etude/${pdfId}`);
  if (!parcours.synthese_vue_at) redirect(`/app/etude/${pdfId}/synthese`);
  if (ordre > parcours.sequence_max) redirect(`/app/etude/${pdfId}/sequence/${parcours.sequence_max}`);

  const analyse = await getAnalyse(parcours.source_hash);
  const plan = analyse?.plan || [];
  const item = plan.find((p) => p.ordre === ordre);
  if (!item) redirect(`/app/etude/${pdfId}`);

  const sequence = await getSequence(parcours.source_hash, ordre);
  const total = plan.length;

  const bar = (
    <div className={styles.seqBar}>
      <Link href={`/app/etude/${pdfId}`} className={styles.link}><ChevronLeft size={16} aria-hidden /> Parcours</Link>
      <p className={styles.seqCount}>Leçon {ordre} sur {total}</p>
      <span className={styles.seqLinks}>
        <Link href={`/app/etude/${pdfId}/carte`} className={styles.link}>Carte</Link>
        <Link href={`/app/etude/${pdfId}/synthese`} className={styles.link}>Introduction</Link>
      </span>
    </div>
  );

  const head = (
    <header>
      <p className={styles.kicker}>Leçon {ordre}</p>
      <h1 className={styles.title}>{sequence?.titre || item.titre}</h1>
      <p className={styles.objective}><strong>Ce que tu vas comprendre : </strong><Rich text={sequence?.objectif || item.objectif} /></p>
    </header>
  );

  if (!sequence) {
    return (
      <div className={styles.page}>
        {bar}
        {head}
        <SequencePreparing documentId={pdfId} ordre={ordre} />
      </div>
    );
  }

  const etats = await etatActivites(user.id, pdfId, ordre);
  const initial: Record<string, EtatInitial> = {};
  for (const a of sequence.activites) {
    const e = etats[a.id];
    initial[a.id] = e
      ? { tentatives: e.tentatives, reussie: e.reussie, aRevoir: e.aRevoir, termine: e.termine, dernier: e.retours[e.retours.length - 1]?.retour ?? null }
      : { tentatives: 0, reussie: false, aRevoir: false, termine: false, dernier: null };
  }
  const dejaRepondu = sequence.activites.some((a) => (etats[a.id]?.tentatives || 0) > 0);

  const verification = (
    <SequenceRunner documentId={pdfId} ordre={ordre} activites={sequence.activites.map(versPublique)} initial={initial} isLast={ordre >= total} suite={sequence.suite} />
  );

  const navigation = (
    <nav className={styles.actions} aria-label="Navigation entre leçons">
      {ordre > 1 && <Link href={`/app/etude/${pdfId}/sequence/${ordre - 1}`} className={styles.link}><ChevronLeft size={16} aria-hidden /> Leçon {ordre - 1}</Link>}
      {ordre < parcours.sequence_max && <Link href={`/app/etude/${pdfId}/sequence/${ordre + 1}`} className={styles.link}>Leçon {ordre + 1} <ChevronRight size={16} aria-hidden /></Link>}
    </nav>
  );

  // Leçon v4 : découverte guidée, étape par étape.
  if (sequence.etapes?.length) {
    const etapes = sequence.etapes.map((e) => {
      const meta = ETAPES.find((x) => x.cle === e.cle)!;
      return {
        cle: e.cle, titre: meta.titre, sousTitre: meta.sousTitre,
        contenu: (
          <>
            <Blocks blocs={e.blocs} />
            {e.cle === 'retenir' && sequence.savoir_expliquer && (
              <aside className={styles.explain}>
                <p className={styles.exampleTitle}>Pour l’expliquer à un camarade</p>
                <p className={styles.p}><Rich text={sequence.savoir_expliquer} /></p>
              </aside>
            )}
            {e.cle === 'retenir' && sequence.liens.length > 0 && (
              <div>
                <p className={styles.p} style={{ fontWeight: 700 }}>Ce que cela relie dans ton cours</p>
                <ul className={styles.list}>{sequence.liens.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>
              </div>
            )}
          </>
        ),
      };
    });
    return (
      <div className={styles.page}>
        {bar}
        {head}
        <article className={`${styles.prose} ${styles.lesson}`}>
          <LeconGuidee
            cleStockage={`sjp-lecon:${pdfId}:${ordre}`}
            accroche={sequence.accroche ? { situation: <Rich text={sequence.accroche.situation} />, question: sequence.accroche.question ? <Rich text={sequence.accroche.question} /> : null } : null}
            etapes={etapes}
            verification={verification}
            toutOuvert={dejaRepondu}
          />
        </article>
        {navigation}
      </div>
    );
  }

  // Leçon d'une version antérieure du contenu (lecture simple).
  return (
    <div className={styles.page}>
      {bar}
      {head}
      <article className={styles.prose}><Blocks blocs={sequence.blocs} /></article>
      {verification}
      {navigation}
    </div>
  );
}
