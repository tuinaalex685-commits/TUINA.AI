import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { accesEtude, getAnalyse, getCartesModules, getParcours, parcoursAncien } from '@/lib/etude3/store';
import { leconsPourCarte, vuesDuCours } from '@/lib/etude3/cartes';
import CarteInteractive from '@/components/etude3/CarteInteractive';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carte du cours | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les cartes mentales du cours, consultables à tout moment du parcours. Lecture seule, aucun appel IA. */
export default async function CartePage({ params, searchParams }: { params: Promise<{ pdfId: string }>; searchParams: Promise<{ vue?: string }> }) {
  const { pdfId } = await params;
  const { vue } = await searchParams;
  if (!UUID_RE.test(pdfId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const acces = await accesEtude(user.id, user.email, pdfId);
  if (!acces.ok) redirect('/app/etude');

  const parcours = await getParcours(user.id, pdfId);
  if (!parcours?.source_hash || parcoursAncien(parcours)) redirect(`/app/etude/${pdfId}`);
  const [analyse, modules] = await Promise.all([getAnalyse(parcours.source_hash), getCartesModules(parcours.source_hash)]);
  if (analyse?.statut !== 'pret') redirect(`/app/etude/${pdfId}`);
  const vues = vuesDuCours(analyse.carte_mentale, modules, analyse.carte?.titre || acces.nom);
  if (vues.length === 0) redirect(`/app/etude/${pdfId}`);

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.crumbs} aria-label="Fil d’Ariane">
          <Link href="/app/etude">Études guidées</Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/app/etude/${pdfId}`}>{acces.nom}</Link>
        </nav>
        <h1 className={styles.title}>La carte du cours</h1>
        <p className={styles.subtitle}>Comment les notions s’organisent et se relient. Une vue d’ensemble, puis une carte par partie du cours.</p>
      </header>
      <CarteInteractive vues={vues} lecons={leconsPourCarte(analyse.plan || [])} pdfId={pdfId} debloquee={parcours.synthese_vue_at ? parcours.sequence_max : 0} initiale={typeof vue === 'string' ? vue : undefined} />
    </div>
  );
}
