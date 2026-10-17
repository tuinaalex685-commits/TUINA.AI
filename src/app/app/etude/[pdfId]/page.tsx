import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/viewer';
import { lastJob } from '@/lib/jobs/enqueue';
import { accesEtude, getAnalyse, getParcours, notionsARevoir } from '@/lib/etude3/store';
import { ENGINE_VERSION } from '@/lib/etude3/types';
import { StartStudy, cleanError } from '@/components/etude3/StudyClient';
import styles from '@/components/etude3/etude3.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Étude guidée | SJP' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ['pending', 'queued', 'processing', 'generating', 'saving'];

/**
 * Accueil d'une étude guidée : démarrer, suivre l'analyse, puis le parcours.
 * La consultation de cette page ne démarre RIEN (Q-01) : seul le bouton « Commencer l'étude »
 * enregistre un démarrage. Aucun appel IA au simple affichage.
 */
export default async function EtudeHub({ params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;
  if (!UUID_RE.test(pdfId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const acces = await accesEtude(user.id, user.email, pdfId);
  if (!acces.ok) redirect(acces.raison === 'premium' ? '/app/catalogue' : '/app/etude');

  const [parcours, legacy] = await Promise.all([
    getParcours(user.id, pdfId),
    supabaseAdmin.from('etude_cours').select('id').eq('pdf_id', pdfId).eq('statut_generation', 'pret').maybeSingle(),
  ]);
  // Ancienne version (v2) : page propriétaire, ou page catalogue avec ?ancienne=1.
  let legacyHref: string | null = null;
  if (legacy.data) {
    if (acces.via === 'owner') legacyHref = `/app/etude/${pdfId}/ancienne`;
    else {
      const { data: entry } = await supabaseAdmin.from('catalog_courses').select('id').eq('etude_cours_id', legacy.data.id).eq('actif', true).maybeSingle();
      if (entry) legacyHref = `/app/etude/catalogue/${entry.id}?ancienne=1`;
    }
  }
  const analyse = parcours?.source_hash ? await getAnalyse(parcours.source_hash) : null;
  const pret = analyse?.statut === 'pret' && !!analyse.plan?.length;
  const job = parcours && !pret ? await lastJob('etude3_analyse', `${ENGINE_VERSION}:${pdfId}`) : null;
  const jobActif = job && ACTIVE.includes(job.status) ? job.id as string : null;
  const jobEchec = job && job.status === 'failed' ? cleanError(job.error) : null;

  const header = (titre: string, sousTitre?: string | null) => (
    <header>
      <nav className={styles.crumbs} aria-label="Fil d’Ariane">
        <Link href="/app/etude">Études guidées</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{acces.nom}</span>
      </nav>
      <h1 className={styles.title}>{titre}</h1>
      {sousTitre && <p className={styles.subtitle}>{sousTitre}</p>}
    </header>
  );

  // ---------- Pas encore prêt : démarrage, analyse en cours, ou échec ----------
  if (!pret) {
    return (
      <div className={styles.page}>
        {header(acces.nom, 'Une étude guidée en trois temps : SJP lit tout ton cours, te remet une synthèse pédagogique, puis t’accompagne séquence par séquence.')}
        <div className={styles.intro}>
          <ol className={styles.steps}>
            <li className={`${styles.step} ${jobActif ? styles.stepOn : ''}`}>
              <span className={styles.stepTitle}>Lecture complète du cours</span>
              <span className={styles.stepText}>Page par page. SJP te dira exactement combien de pages il a pu lire.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>Ta synthèse pédagogique</span>
              <span className={styles.stepText}>Les définitions, les mécanismes, les distinctions et les pièges, expliqués simplement. Téléchargeable en PDF.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>Le parcours, séquence par séquence</span>
              <span className={styles.stepText}>Des explications, des schémas et des vérifications. Tu reprends là où tu t’es arrêté, sur n’importe quel appareil.</span>
            </li>
          </ol>
          <div className={styles.aside}>
            {jobEchec && (
              <p className={styles.alert} role="alert"><strong>L’analyse n’a pas abouti. </strong>{jobEchec}</p>
            )}
            <StartStudy
              documentId={pdfId}
              initialJobId={jobActif}
              label={!parcours ? 'Commencer l’étude' : jobEchec ? 'Relancer l’analyse' : 'Lancer l’analyse'}
            />
            {!parcours && <p className={styles.notice}>Si un autre étudiant a déjà étudié ce même cours, ta synthèse est prête tout de suite.</p>}
            {legacyHref && <Link href={legacyHref} className={styles.link}>Ouvrir l’ancienne version de cette étude</Link>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Parcours prêt ----------
  const plan = analyse!.plan!;
  const couv = analyse!.couverture;
  const termine = parcours!.statut === 'termine';
  const syntheseVue = !!parcours!.synthese_vue_at;
  const valides = termine ? plan.length : Math.min(plan.length, parcours!.sequence_max - 1);
  const pct = Math.round((valides / plan.length) * 100);
  const revoir = await notionsARevoir(user.id, pdfId);
  const suite = !syntheseVue ? { href: `/app/etude/${pdfId}/synthese`, label: 'Lire ma synthèse' }
    : termine ? { href: `/app/etude/${pdfId}/bilan`, label: 'Voir mon bilan' }
    : { href: `/app/etude/${pdfId}/sequence/${parcours!.sequence_max}`, label: `Reprendre la séquence ${parcours!.sequence_max}` };

  return (
    <div className={styles.page}>
      <div>
        {header(analyse!.carte?.titre || acces.nom, analyse!.carte?.idee_centrale)}
        <ul className={styles.facts}>
          {couv && <li><strong>{couv.pages_lues}</strong> page{couv.pages_lues > 1 ? 's' : ''} lue{couv.pages_lues > 1 ? 's' : ''} sur <strong>{couv.pages_total}</strong></li>}
          <li><strong>{plan.length}</strong> séquences</li>
          {revoir.length > 0 && <li><strong>{revoir.length}</strong> notion{revoir.length > 1 ? 's' : ''} à revoir</li>}
        </ul>
        <div className={styles.progress}>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
          <p className={styles.progressLabel}>{termine ? 'Parcours terminé' : `${valides} séquence${valides > 1 ? 's' : ''} terminée${valides > 1 ? 's' : ''} sur ${plan.length}`}</p>
        </div>
        <div className={styles.actions} style={{ marginTop: 'var(--s-5)' }}>
          <Link href={suite.href} className={styles.primary}>{suite.label}</Link>
        </div>
        {couv && (couv.tronque || couv.pages_vides.length > 0) && (
          <p className={styles.notice} style={{ marginTop: 'var(--s-4)', maxWidth: '68ch' }}>
            {couv.tronque && 'Ton cours est très long : SJP en a analysé le début, soit les pages indiquées ci-dessus. '}
            {couv.pages_vides.length > 0 && `Pages sans texte lisible (scannées ou images) : ${couv.pages_vides.slice(0, 12).join(', ')}${couv.pages_vides.length > 12 ? '…' : ''}. Leur contenu n’a pas pu être pris en compte.`}
          </p>
        )}
      </div>

      <div className={styles.board}>
        <section aria-labelledby="parcours">
          <h2 id="parcours" className={styles.sectionTitle}>Ton parcours</h2>
          <ol className={styles.rail}>
            <li className={`${styles.railItem} ${syntheseVue ? styles.railDone : styles.railCurrent}`}>
              <span className={styles.railDot} aria-hidden>{syntheseVue ? '✓' : '0'}</span>
              <div className={styles.railBody}>
                <p className={styles.railTitle}>Synthèse pédagogique</p>
                <p className={styles.railText}>Tout le cours, expliqué, avant de commencer.</p>
                <Link href={`/app/etude/${pdfId}/synthese`} className={styles.railLink}>{syntheseVue ? 'Relire la synthèse' : 'Lire la synthèse'}</Link>
              </div>
            </li>
            {plan.map((s) => {
              const fait = termine || s.ordre < parcours!.sequence_max;
              const actuelle = !termine && syntheseVue && s.ordre === parcours!.sequence_max;
              const ouverte = syntheseVue && s.ordre <= parcours!.sequence_max;
              const cls = fait ? styles.railDone : actuelle ? styles.railCurrent : ouverte ? '' : styles.railLocked;
              return (
                <li key={s.ordre} className={`${styles.railItem} ${cls}`}>
                  <span className={styles.railDot} aria-hidden>{fait ? '✓' : ouverte ? s.ordre : <Lock size={14} />}</span>
                  <div className={styles.railBody}>
                    <p className={styles.railTitle}>{s.titre}</p>
                    <p className={styles.railText}>{s.objectif}</p>
                    {ouverte ? (
                      <Link href={`/app/etude/${pdfId}/sequence/${s.ordre}`} className={styles.railLink}>{fait ? 'Revoir la séquence' : 'Ouvrir la séquence'}</Link>
                    ) : (
                      <p className={styles.railMeta}>{syntheseVue ? 'Se débloque à la fin de la séquence précédente.' : 'Lis d’abord la synthèse.'}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className={styles.aside}>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>Ta synthèse</p>
            <p className={styles.panelText}>À relire pendant le parcours, et à télécharger en PDF pour réviser.</p>
            <Link href={`/app/etude/${pdfId}/synthese`} className={styles.secondary}>Ouvrir la synthèse</Link>
          </section>
          {revoir.length > 0 && (
            <section className={styles.panel}>
              <p className={styles.panelTitle}>À revoir</p>
              <p className={styles.panelText}>Les notions sur lesquelles tu as eu du mal. Reviens-y avant un examen.</p>
              <ul className={styles.review}>
                {revoir.map((r) => (
                  <li key={`${r.sequence_ordre}-${r.activite_id}`}>
                    <Link href={`/app/etude/${pdfId}/sequence/${r.sequence_ordre}`}>{r.notion}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {termine && (
            <section className={styles.panel}>
              <p className={styles.panelTitle}>Ton bilan</p>
              <p className={styles.panelText}>Ta progression et la carte mentale du cours.</p>
              <Link href={`/app/etude/${pdfId}/bilan`} className={styles.secondary}>Voir le bilan</Link>
            </section>
          )}
          {legacyHref && <Link href={legacyHref} className={styles.link}>Ancienne version de cette étude</Link>}
        </aside>
      </div>
    </div>
  );
}
