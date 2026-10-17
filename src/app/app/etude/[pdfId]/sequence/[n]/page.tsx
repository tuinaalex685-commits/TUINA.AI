import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, etatActivites, getAnalyse, getParcours, getSequence } from '@/lib/etude3/store';
import { Blocks, Rich } from '@/components/etude3/Blocks';
import { SequencePreparing } from '@/components/etude3/StudyClient';
import SequenceRunner, { type EtatInitial } from '@/components/etude3/SequenceRunner';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Séquence | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une séquence. Garde SERVEUR : une séquence au-delà de la plus haute séquence débloquée est
 * refusée, même en tapant l'URL (on renvoie vers la séquence autorisée). Le retour en arrière
 * vers une séquence déjà débloquée est libre.
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
  if (!parcours?.source_hash) redirect(`/app/etude/${pdfId}`);
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
      <div className={styles.seqDots} aria-label={`Séquence ${ordre} sur ${total}`}>
        {plan.map((p) => (
          <span key={p.ordre} className={`${styles.seqDot} ${p.ordre === ordre ? styles.seqDotOn : p.ordre < parcours.sequence_max || parcours.statut === 'termine' ? styles.seqDotDone : ''}`} />
        ))}
      </div>
      <Link href={`/app/etude/${pdfId}/synthese`} className={styles.link}>Synthèse</Link>
    </div>
  );

  const head = (
    <header>
      <p className={styles.crumbs} style={{ marginBottom: 'var(--s-2)' }}>Séquence {ordre} sur {total}</p>
      <h1 className={styles.title}>{sequence?.titre || item.titre}</h1>
    </header>
  );

  if (!sequence) {
    return (
      <div className={styles.page}>
        {bar}
        {head}
        <p className={styles.objective}><strong>Objectif : </strong>{item.objectif}</p>
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

  return (
    <div className={styles.page}>
      {bar}
      {head}
      <p className={styles.objective}><strong>Objectif : </strong><Rich text={sequence.objectif || item.objectif} /></p>

      <article className={styles.prose}>
        <Blocks blocs={sequence.blocs} />
        {sequence.liens.length > 0 && (
          <section>
            <h2 className={styles.h3}>Ce que cela relie dans ton cours</h2>
            <ul className={styles.list} style={{ marginTop: 'var(--s-3)' }}>{sequence.liens.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>
          </section>
        )}
      </article>

      <SequenceRunner documentId={pdfId} ordre={ordre} activites={sequence.activites} initial={initial} isLast={ordre >= total} />

      <nav className={styles.actions} aria-label="Navigation entre séquences">
        {ordre > 1 && <Link href={`/app/etude/${pdfId}/sequence/${ordre - 1}`} className={styles.link}><ChevronLeft size={16} aria-hidden /> Séquence {ordre - 1}</Link>}
        {ordre < parcours.sequence_max && <Link href={`/app/etude/${pdfId}/sequence/${ordre + 1}`} className={styles.link}>Séquence {ordre + 1} <ChevronRight size={16} aria-hidden /></Link>}
      </nav>
    </div>
  );
}
