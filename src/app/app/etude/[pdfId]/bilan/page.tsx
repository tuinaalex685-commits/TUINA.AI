import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, getAnalyse, getParcours, notionsARevoir } from '@/lib/etude3/store';
import { MindMap } from '@/components/etude3/MindMap';
import { PrintButton } from '@/components/etude3/StudyClient';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bilan | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fin du parcours : progression mesurée (sans prétendre mesurer une « maîtrise »), notions à
 * revoir et carte mentale du cours (consultable, téléchargeable par l'impression).
 */
export default async function BilanPage({ params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;
  if (!UUID_RE.test(pdfId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const acces = await accesEtude(user.id, user.email, pdfId);
  if (!acces.ok) redirect('/app/etude');
  const parcours = await getParcours(user.id, pdfId);
  if (!parcours?.source_hash) redirect(`/app/etude/${pdfId}`);
  if (parcours.statut !== 'termine') redirect(`/app/etude/${pdfId}`);

  const [analyse, revoir, { data: tentatives }] = await Promise.all([
    getAnalyse(parcours.source_hash),
    notionsARevoir(user.id, pdfId),
    supabaseAdmin.from('etude_tentatives').select('sequence_ordre, activite_id, numero, verdict').eq('user_id', user.id).eq('document_id', pdfId),
  ]);

  // Activités réussies du premier coup / après plusieurs essais.
  const parActivite = new Map<string, { premier: boolean; reussie: boolean }>();
  for (const t of tentatives || []) {
    const k = `${t.sequence_ordre}:${t.activite_id}`;
    const cur = parActivite.get(k) ?? { premier: false, reussie: false };
    if (t.verdict === 'juste') { cur.reussie = true; if (t.numero === 1) cur.premier = true; }
    parActivite.set(k, cur);
  }
  const total = parActivite.size;
  const premier = [...parActivite.values()].filter((v) => v.premier).length;
  const reussies = [...parActivite.values()].filter((v) => v.reussie).length;

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.crumbs} aria-label="Fil d’Ariane">
          <Link href="/app/etude">Études guidées</Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/app/etude/${pdfId}`}>{acces.nom}</Link>
        </nav>
        <h1 className={styles.title}>Ton bilan : {analyse?.carte?.titre || acces.nom}</h1>
        <p className={styles.subtitle}>Tu as terminé toutes les séquences. Voici ce que montrent tes réponses, et la carte du cours pour réviser.</p>
        <div className={styles.actions} data-print="hide" style={{ marginTop: 'var(--s-5)' }}>
          <Link href={`/app/etude/${pdfId}/synthese`} className={styles.secondary}>Relire la synthèse</Link>
          <PrintButton label="Télécharger le bilan en PDF" />
        </div>
      </header>

      <ul className={styles.stats}>
        <li><span className={styles.statValue}>{analyse?.plan?.length ?? 0}</span><span className={styles.statLabel}>séquences terminées</span></li>
        <li><span className={styles.statValue}>{premier}/{total}</span><span className={styles.statLabel}>activités réussies du premier coup</span></li>
        <li><span className={styles.statValue}>{reussies}/{total}</span><span className={styles.statLabel}>activités réussies au total</span></li>
        <li><span className={styles.statValue}>{revoir.length}</span><span className={styles.statLabel}>notion{revoir.length > 1 ? 's' : ''} à revoir</span></li>
      </ul>
      <p className={styles.notice} style={{ maxWidth: '68ch' }}>
        Ces chiffres décrivent tes réponses pendant le parcours. Ils ne mesurent pas à eux seuls ta maîtrise du cours : les examens de maîtrise et la révision espacée le vérifieront.
      </p>

      {revoir.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Les notions à revoir</h2>
          <ul className={styles.review}>
            {revoir.map((r) => <li key={`${r.sequence_ordre}-${r.activite_id}`}><Link href={`/app/etude/${pdfId}/sequence/${r.sequence_ordre}`}>{r.notion} (séquence {r.sequence_ordre})</Link></li>)}
          </ul>
        </section>
      )}

      {analyse?.carte_mentale && analyse.carte_mentale.noeuds.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>La carte du cours</h2>
          <MindMap carte={analyse.carte_mentale} />
        </section>
      )}

      <div className={styles.actions} data-print="hide">
        <Link href="/app/examen" className={styles.primary}>Passer aux examens de maîtrise</Link>
        <Link href="/app/revisions" className={styles.secondary}>Réviser</Link>
      </div>
    </div>
  );
}
