"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import toast from 'react-hot-toast';
import { answerActivity, completeSequence } from '@/app/actions/etude3';
import { MAX_TENTATIVES, type ActivitePublique, type NiveauActivite, type RetourActivite } from '@/lib/etude3/types';
import { Rich } from './Blocks';
import styles from './etude3.module.css';

export interface EtatInitial {
  tentatives: number;
  reussie: boolean;
  aRevoir: boolean;
  termine: boolean;
  dernier: RetourActivite | null;
}

const LETTRES = ['A', 'B', 'C', 'D', 'E'];
const TITRES: Record<RetourActivite['verdict'], string> = { juste: 'C’est juste.', partiel: 'C’est en partie juste.', faux: 'Pas tout à fait.' };
const NIVEAUX: Record<NiveauActivite, string> = { comprendre: 'Comprendre', distinguer: 'Distinguer', appliquer: 'Appliquer', examen: 'Niveau examen' };

function Feedback({ r }: { r: RetourActivite }) {
  const cls = r.verdict === 'juste' ? styles.feedbackJuste : r.verdict === 'partiel' ? styles.feedbackPartiel : styles.feedbackFaux;
  return (
    <motion.div className={`${styles.feedback} ${cls}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} role="status">
      <p className={styles.feedbackTitle}>{TITRES[r.verdict]}</p>
      <p className={styles.feedbackText}><Rich text={r.message} /></p>
      {r.manquants && r.manquants.length > 0 && (
        <div className={styles.feedbackMore}><strong>Ce qui manque</strong><ul className={styles.list}>{r.manquants.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
      )}
      {r.verdict !== 'juste' && r.autre_explication && !r.bonne_reponse && (
        <div className={styles.feedbackMore}><strong>Une autre façon de voir</strong><Rich text={r.autre_explication} /></div>
      )}
      {r.verdict !== 'juste' && r.explication_simple && !r.bonne_reponse && (
        <div className={styles.feedbackMore}><strong>Reprenons plus simplement, pas à pas</strong><Rich text={r.explication_simple} /></div>
      )}
      {r.verdict !== 'juste' && r.prerequis && (
        <div className={styles.feedbackMore}><strong>À revoir d’abord</strong><Rich text={r.prerequis} /></div>
      )}
      {r.bonne_reponse && (
        <div className={styles.feedbackMore}>
          <strong>Le raisonnement attendu</strong><Rich text={r.bonne_reponse} />
          <p style={{ margin: 'var(--s-2) 0 0', fontSize: 'var(--text-sm)' }}>Cette notion est ajoutée à ta liste « À revoir ». Tu peux continuer.</p>
        </div>
      )}
    </motion.div>
  );
}

function ActivityCard({ documentId, ordre, a, initial, onTermine }: {
  documentId: string; ordre: number; a: ActivitePublique; initial: EtatInitial; onTermine: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(initial);

  const submit = async () => {
    if (busy || state.termine) return;
    const reponse = a.type === 'choix' ? (choice === null ? '' : String(choice)) : text.trim();
    if (!reponse) { toast.error(a.type === 'choix' ? 'Choisis une proposition.' : 'Écris ta réponse.'); return; }
    setBusy(true);
    // Identifiant de requête : un renvoi réseau du même clic ne compte pas une 2e tentative.
    const res = await answerActivity({ documentId, ordre, activiteId: a.id, reponse, requestId: crypto.randomUUID() });
    setBusy(false);
    if ('error' in res) { toast.error(res.error); return; }
    const r = res.retour;
    setState({ tentatives: r.numero, reussie: r.verdict === 'juste', aRevoir: r.aRevoir, termine: r.termine, dernier: r });
    if (r.termine) onTermine();
  };

  // La bonne proposition n'est connue du navigateur qu'une fois l'activité terminée (renvoyée par le serveur).
  const bonne = state.termine ? state.dernier?.bonne_index : undefined;
  const showRight = a.type === 'choix' && typeof bonne === 'number';
  return (
    <section className={styles.activity} aria-labelledby={`q-${a.id}`}>
      <div className={styles.activityHead}>
        <span className={styles.activityNotion}>{a.niveau && <span className={styles.activityLevel}>{NIVEAUX[a.niveau]}</span>}{a.notion}</span>
        <span className={styles.attempts} aria-label={`Tentative ${Math.min(state.tentatives, MAX_TENTATIVES)} sur ${MAX_TENTATIVES}`}>
          {Array.from({ length: MAX_TENTATIVES }, (_, i) => (
            <i key={i} className={`${styles.attempt} ${i < state.tentatives ? (state.reussie && i === state.tentatives - 1 ? styles.attemptOk : styles.attemptUsed) : ''}`} />
          ))}
        </span>
      </div>
      <p id={`q-${a.id}`} className={styles.question}><Rich text={a.consigne} /></p>

      {a.type === 'choix' ? (
        <ul className={styles.choices} role="radiogroup" aria-labelledby={`q-${a.id}`}>
          {a.choix.map((c, i) => {
            const right = showRight && i === bonne;
            const on = choice === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={state.termine || busy}
                  className={`${styles.choice} ${on ? styles.choiceOn : ''} ${right ? styles.choiceRight : ''} ${showRight && on && !right ? styles.choiceWrong : ''}`}
                  onClick={() => setChoice(i)}
                >
                  <span className={styles.choiceLetter}>{LETTRES[i]}</span>
                  <span><Rich text={c} /></span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <label htmlFor={`r-${a.id}`} className="sr-only">Ta réponse</label>
          <textarea id={`r-${a.id}`} className={styles.answer} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} disabled={state.termine || busy} placeholder="Réponds avec tes mots, en utilisant les termes du cours." />
        </>
      )}

      {!state.termine && (
        <div className={styles.activityActions}>
          <button type="button" className={styles.primary} onClick={submit} disabled={busy}>
            {busy ? (a.type === 'ouverte' ? 'Correction…' : 'Vérification…') : state.tentatives > 0 ? 'Réessayer' : 'Valider ma réponse'}
          </button>
          {state.tentatives > 0 && <span className={styles.progressLabel}>Tentative {state.tentatives} sur {MAX_TENTATIVES}</span>}
        </div>
      )}
      <AnimatePresence initial={false}>{state.dernier && <Feedback key={state.tentatives} r={state.dernier} />}</AnimatePresence>
    </section>
  );
}

export default function SequenceRunner({ documentId, ordre, activites, initial, isLast, suite }: {
  documentId: string; ordre: number; activites: ActivitePublique[]; initial: Record<string, EtatInitial>; isLast: boolean; suite?: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(() => new Set(activites.filter((a) => initial[a.id]?.termine).map((a) => a.id)));
  const [busy, setBusy] = useState(false);
  const all = done.size >= activites.length;

  const finish = async () => {
    setBusy(true);
    const res = await completeSequence(documentId, ordre);
    if ('error' in res && res.error) { setBusy(false); toast.error(res.error); return; }
    router.push(isLast ? `/app/etude/${documentId}/bilan` : `/app/etude/${documentId}/sequence/${ordre + 1}`);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.check}>
        <h2 className={styles.h2} style={{ marginTop: 0 }}>Vérifie ta compréhension</h2>
        <p className={styles.p} style={{ marginTop: 'calc(-1 * var(--s-2))' }}>Des questions de plus en plus exigeantes. On ne passe pas à la suite parce qu’on a lu, mais parce qu’on a compris : en cas d’erreur, tu reçois une autre explication.</p>
        {activites.map((a) => (
          <ActivityCard
            key={a.id}
            documentId={documentId}
            ordre={ordre}
            a={a}
            initial={initial[a.id] ?? { tentatives: 0, reussie: false, aRevoir: false, termine: false, dernier: null }}
            onTermine={() => setDone((prev) => new Set(prev).add(a.id))}
          />
        ))}
        <div className={`${styles.finish} ${all ? styles.finishReady : ''}`}>
          <p className={styles.p} style={{ fontWeight: 700 }}>
            {all ? (isLast ? 'Tu as terminé le parcours.' : 'Leçon terminée.') : `Encore ${activites.length - done.size} question${activites.length - done.size > 1 ? 's' : ''} pour valider cette leçon.`}
          </p>
          {all && suite && <p className={styles.p}><span className={styles.calloutLabel}>Et maintenant ? </span><Rich text={suite} /></p>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={finish} disabled={!all || busy}>
              {busy ? 'Enregistrement…' : isLast ? 'Voir mon bilan' : 'Leçon suivante'}
            </button>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
