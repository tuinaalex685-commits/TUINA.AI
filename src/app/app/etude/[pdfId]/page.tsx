import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, Lock, Map as MapIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/viewer';
import { lastJob } from '@/lib/jobs/enqueue';
import { accesEtude, getAnalyse, getModules, getParcours, notionsARevoir, parcoursAncien } from '@/lib/etude3/store';
import { ENGINE_VERSION, type PlanSequence } from '@/lib/etude3/types';
import { StartStudy } from '@/components/etude3/StudyClient';
import { cleanError } from '@/lib/etude3/messages';
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

  const parcours = await getParcours(user.id, pdfId);
  const ancien = parcoursAncien(parcours);
  const analyse = parcours?.source_hash && !ancien ? await getAnalyse(parcours.source_hash) : null;
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
        {header(acces.nom, 'SJP lit tout ton cours et en comprend l’organisation, te présente sa carte et ses grandes questions, puis t’enseigne chaque notion, leçon par leçon, en vérifiant que tu as compris.')}
        <div className={styles.intro}>
          <ol className={styles.steps}>
            <li className={`${styles.step} ${jobActif ? styles.stepOn : ''}`}>
              <span className={styles.stepTitle}>Lecture et compréhension du cours</span>
              <span className={styles.stepText}>Page par page, partie par partie, en suivant le plan de ton professeur.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>L’introduction et la carte du cours</span>
              <span className={styles.stepText}>Ce que tu vas apprendre, les grandes questions, et une carte interactive des notions et de leurs liens.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>Les leçons, une notion à la fois</span>
              <span className={styles.stepText}>Une situation, l’idée en mots simples, les mots du droit, des exemples et des dessins, puis des vérifications corrigées. Tu reprends où tu t’es arrêté.</span>
            </li>
          </ol>
          <div className={styles.aside}>
            {ancien && (
              <p className={styles.notice} style={{ margin: 0 }}>
                <strong>Une nouvelle Étude guidée est disponible pour ce cours.</strong> Elle remplace l’ancienne : ta progression repart de la première leçon.
              </p>
            )}
            {jobEchec && (
              <p className={styles.alert} role="alert"><strong>L’analyse n’a pas abouti. </strong>{jobEchec}</p>
            )}
            <StartStudy
              documentId={pdfId}
              initialJobId={jobActif}
              label={ancien ? 'Commencer la nouvelle Étude guidée' : !parcours ? 'Commencer l’étude' : jobEchec ? 'Relancer l’analyse' : 'Lancer l’analyse'}
            />
            {!parcours && <p className={styles.notice}>Si un autre étudiant a déjà étudié ce même cours, ton parcours est prêt tout de suite.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Parcours prêt ----------
  const plan = analyse!.plan!;
  const [modules, revoir] = await Promise.all([getModules(parcours!.source_hash!), notionsARevoir(user.id, pdfId)]);
  const couv = analyse!.couverture;
  const termine = parcours!.statut === 'termine';
  const syntheseVue = !!parcours!.synthese_vue_at;
  const max = parcours!.sequence_max;
  const valides = termine ? plan.length : Math.min(plan.length, max - 1);
  const pct = Math.round((valides / plan.length) * 100);
  const aConsolider = new Set(revoir.map((r) => r.sequence_ordre as number));
  const suite = !syntheseVue ? { href: `/app/etude/${pdfId}/synthese`, label: 'Découvrir le cours' }
    : termine ? { href: `/app/etude/${pdfId}/bilan`, label: 'Voir mon bilan' }
    : { href: `/app/etude/${pdfId}/sequence/${max}`, label: max === 1 ? 'Commencer la leçon 1' : `Reprendre la leçon ${max}` };

  // Leçons regroupées par partie du cours, puis par module.
  const modById = new Map(modules.map((m) => [m.id, m]));
  type Groupe = { partie: string; modules: { id: string; titre: string; lecons: PlanSequence[] }[] };
  const groupes: Groupe[] = [];
  for (const l of plan) {
    const m = l.module ? modById.get(l.module) : undefined;
    const partie = m?.chemin[0] || analyse!.carte?.titre || acces.nom;
    let g = groupes[groupes.length - 1];
    if (!g || g.partie !== partie) { g = { partie, modules: [] }; groupes.push(g); }
    let gm = g.modules[g.modules.length - 1];
    const mid = l.module || 'cours';
    if (!gm || gm.id !== mid) { gm = { id: mid, titre: m?.titre || 'Leçons', lecons: [] }; g.modules.push(gm); }
    gm.lecons.push(l);
  }

  const etat = (o: number) => {
    const fait = termine || o < max;
    if (fait) return aConsolider.has(o) ? 'consolider' : 'valide';
    if (syntheseVue && o === max) return 'actuelle';
    return 'verrou';
  };

  return (
    <div className={styles.page}>
      <div>
        {header(analyse!.carte?.titre || acces.nom, analyse!.carte?.idee_centrale)}
        <ul className={styles.facts}>
          {couv && <li><strong>{couv.pages_lues}</strong> page{couv.pages_lues > 1 ? 's' : ''} lue{couv.pages_lues > 1 ? 's' : ''} sur <strong>{couv.pages_total}</strong></li>}
          <li><strong>{plan.length}</strong> leçon{plan.length > 1 ? 's' : ''}</li>
          {aConsolider.size > 0 && <li><strong>{aConsolider.size}</strong> leçon{aConsolider.size > 1 ? 's' : ''} à consolider</li>}
        </ul>
        <div className={styles.progress}>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
          <p className={styles.progressLabel}>{termine ? 'Parcours terminé' : `${valides} leçon${valides > 1 ? 's' : ''} validée${valides > 1 ? 's' : ''} sur ${plan.length}`}</p>
        </div>
        <div className={styles.actions} style={{ marginTop: 'var(--s-5)' }}>
          <Link href={suite.href} className={styles.primary}>{suite.label}</Link>
          {syntheseVue && <Link href={`/app/etude/${pdfId}/carte`} className={styles.secondary}><MapIcon size={17} aria-hidden /> Carte du cours</Link>}
        </div>
        {couv && couv.pages_vides.length > 0 && (
          <p className={styles.notice} style={{ marginTop: 'var(--s-4)', maxWidth: '68ch' }}>
            Pages sans texte lisible (scannées ou images) : {couv.pages_vides.slice(0, 12).join(', ')}{couv.pages_vides.length > 12 ? '…' : ''}. Leur contenu n’a pas pu être pris en compte.
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
                <p className={styles.railTitle}>Découvrir le cours</p>
                <p className={styles.railText}>Ce que tu vas apprendre, les grandes questions, la carte et ses branches expliquées.</p>
                <Link href={`/app/etude/${pdfId}/synthese`} className={styles.railLink}>{syntheseVue ? 'Relire l’introduction' : 'Commencer par là'}</Link>
              </div>
            </li>
          </ol>
          {groupes.map((g, gi) => (
            <div key={`${g.partie}-${gi}`} className={styles.partie}>
              {groupes.length > 1 && <p className={styles.partieTitre}>{g.partie}</p>}
              {g.modules.map((gm) => {
                const ouvert = gm.lecons.some((l) => etat(l.ordre) === 'actuelle') || (!syntheseVue && gi === 0);
                const faites = gm.lecons.filter((l) => ['valide', 'consolider'].includes(etat(l.ordre))).length;
                return (
                  <details key={gm.id} className={styles.moduleBox} open={ouvert || plan.length <= 8}>
                    <summary className={styles.moduleHead}>
                      <span className={styles.moduleTitre}>{gm.titre}</span>
                      <span className={styles.moduleCompte}>{faites}/{gm.lecons.length}</span>
                    </summary>
                    <ol className={styles.rail}>
                      {gm.lecons.map((s) => {
                        const e = etat(s.ordre);
                        const ouverte = syntheseVue && s.ordre <= max;
                        const cls = e === 'valide' ? styles.railDone : e === 'consolider' ? styles.railRevoir : e === 'actuelle' ? styles.railCurrent : styles.railLocked;
                        return (
                          <li key={s.ordre} className={`${styles.railItem} ${cls}`}>
                            <span className={styles.railDot} aria-hidden>{e === 'valide' ? '✓' : e === 'consolider' ? '!' : ouverte ? s.ordre : <Lock size={14} />}</span>
                            <div className={styles.railBody}>
                              <p className={styles.railTitle}>Leçon {s.ordre} · {s.titre}</p>
                              <p className={styles.railText}>{s.objectif}</p>
                              {e === 'consolider' && <p className={styles.railMeta}>Validée avec des notions à consolider.</p>}
                              {ouverte ? (
                                <Link href={`/app/etude/${pdfId}/sequence/${s.ordre}`} className={styles.railLink}>{e === 'actuelle' ? 'Ouvrir la leçon' : 'Revoir la leçon'}</Link>
                              ) : (
                                <p className={styles.railMeta}>{syntheseVue ? 'Se débloque quand la leçon précédente est validée.' : 'Commence par découvrir le cours.'}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                );
              })}
            </div>
          ))}
        </section>

        <aside className={styles.aside}>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>L’introduction au cours</p>
            <p className={styles.panelText}>Les grandes questions et les branches du cours, à relire pendant le parcours et à télécharger en PDF.</p>
            <Link href={`/app/etude/${pdfId}/synthese`} className={styles.secondary}>Ouvrir l’introduction</Link>
          </section>
          {syntheseVue && (
            <section className={styles.panel}>
              <p className={styles.panelTitle}>La carte du cours</p>
              <p className={styles.panelText}>Les notions et leurs liens, partie par partie. Touche une notion pour retrouver sa leçon.</p>
              <Link href={`/app/etude/${pdfId}/carte`} className={styles.secondary}>Ouvrir la carte</Link>
            </section>
          )}
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
              <p className={styles.panelText}>Ta progression réelle, les notions à consolider et la carte du cours.</p>
              <Link href={`/app/etude/${pdfId}/bilan`} className={styles.secondary}>Voir le bilan</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
