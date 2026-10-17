"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, PenLine, Sparkles } from 'lucide-react';
import { createRedaction, getSujetsProposes } from '@/app/actions/redaction';
import { enqueueAiJob } from '@/app/actions/jobs';
import { useJob } from '@/lib/hooks/useJob';
import { COMPARTIMENT_BY_SLUG, LIMITS, type CompartimentSlug } from '@/lib/redaction/compartiments';
import type { CourseOption } from './RedactionHome';
import styles from './redaction.module.css';

interface Sujet {
  intitule: string;
  enonce: string;
  notions: string[];
  niveau: 'accessible' | 'intermediaire' | 'exigeant';
}

const NIVEAU: Record<Sujet['niveau'], string> = { accessible: 'Accessible', intermediaire: 'Intermédiaire', exigeant: 'Exigeant' };

/**
 * Création d'une copie en trois étapes : source → sujet → c'est parti.
 * Les sujets proposés viennent d'un job IA mis en cache par contenu : si un autre
 * étudiant les a déjà demandés pour le même cours, ils s'affichent sans nouvel appel.
 */
export default function NewCopyFlow({ slug, courses }: { slug: CompartimentSlug; courses: CourseOption[] }) {
  const router = useRouter();
  const comp = COMPARTIMENT_BY_SLUG.get(slug)!;

  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<'cours' | 'libre'>(courses.length ? 'cours' : 'libre');
  const [documentId, setDocumentId] = useState('');
  const [sujet, setSujet] = useState('');
  const [enonce, setEnonce] = useState('');
  const [sujets, setSujets] = useState<Sujet[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadSujets = async () => {
    const res = await getSujetsProposes(documentId, slug);
    if ('error' in res && res.error) { setError(res.error); return false; }
    const list = (res as { sujets?: Sujet[] | null }).sujets;
    if (list?.length) { setSujets(list); return true; }
    return false;
  };

  const { phase } = useJob(jobId, {
    onDone: async () => {
      setJobId(null);
      if (!(await loadSujets())) setError('Les sujets n’ont pas pu être préparés. Réessaie, ou écris ton propre sujet.');
    },
    onError: (msg) => { setJobId(null); setError(msg || 'Les sujets n’ont pas pu être préparés.'); },
  });

  const askSujets = async () => {
    setError('');
    if (await loadSujets()) return;
    const res = await enqueueAiJob('redaction_sujets', { documentId, type: comp.type });
    if ('error' in res && res.error) { setError(res.error); return; }
    setJobId((res as { jobId: string }).jobId);
  };

  const pick = (i: number) => {
    if (!sujets) return;
    setPicked(i);
    setSujet(sujets[i].intitule);
    setEnonce(sujets[i].enonce);
  };

  const goNext = () => {
    setError('');
    if (source === 'cours' && !documentId) { setError('Choisis le cours sur lequel tu veux t’entraîner.'); return; }
    setStep(2);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await createRedaction({ slug, source, documentId: source === 'cours' ? documentId : null, sujet, enonce });
    if ('error' in res && res.error) { setBusy(false); setError(res.error); return; }
    router.push(`/app/redaction/${(res as { id: string }).id}`);
  };

  const own = courses.filter((c) => c.groupe === 'Mes cours');
  const catalog = courses.filter((c) => c.groupe === 'Catalogue SJP');

  return (
    <div className={styles.scope}>
      <ol className={styles.steps} aria-label={`Étape ${step} sur 2`}>
        <li className={`${styles.stepDot} ${styles.stepDotOn}`} />
        <li className={`${styles.stepDot} ${step === 2 ? styles.stepDotOn : ''}`} />
      </ol>

      {step === 1 && (
        <div className={styles.formStack}>
          <div className={styles.choiceGrid} role="radiogroup" aria-label="Source du sujet">
            <button type="button" role="radio" aria-checked={source === 'cours'} className={`${styles.choice} ${source === 'cours' ? styles.choiceOn : ''}`} onClick={() => setSource('cours')} disabled={!courses.length}>
              <span className={styles.choiceTitle}><BookOpen size={18} aria-hidden /> Un de mes cours</span>
              <span className={styles.choiceText}>
                {comp.sujetsDepuisCours ? 'SJP te propose trois sujets tirés du cours, et corrige en s’appuyant dessus.' : 'La correction s’appuiera sur ce cours.'}
                {!courses.length && ' (Importe d’abord un cours.)'}
              </span>
            </button>
            <button type="button" role="radio" aria-checked={source === 'libre'} className={`${styles.choice} ${source === 'libre' ? styles.choiceOn : ''}`} onClick={() => setSource('libre')}>
              <span className={styles.choiceTitle}><PenLine size={18} aria-hidden /> Le sujet de mon enseignant</span>
              <span className={styles.choiceText}>Tu saisis le sujet donné en TD ou en examen blanc.</span>
            </button>
          </div>

          {source === 'cours' && (
            <label className={styles.field}>
              <span className={styles.label}>Cours</span>
              <select className={styles.select} value={documentId} onChange={(e) => { setDocumentId(e.target.value); setSujets(null); setPicked(null); }}>
                <option value="">Choisis un cours…</option>
                {own.length > 0 && <optgroup label="Mes cours">{own.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
                {catalog.length > 0 && <optgroup label="Catalogue SJP">{catalog.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
              </select>
            </label>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.formActions}>
            <span />
            <button type="button" className={styles.primary} onClick={goNext}>Continuer</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form className={styles.formStack} onSubmit={create}>
          {source === 'cours' && comp.sujetsDepuisCours && (
            <div className={styles.formStack}>
              {!sujets && !jobId && (
                <button type="button" className={styles.secondary} onClick={askSujets}>
                  <Sparkles size={17} aria-hidden /> Me proposer 3 sujets sur ce cours
                </button>
              )}
              {jobId && (
                <p className={styles.waiting} role="status">
                  <span className={styles.spinner} aria-hidden /> {phase || 'Lecture du cours…'} Cela prend en général moins d’une minute.
                </p>
              )}
              {sujets && (
                <ul className={styles.sujets}>
                  {sujets.map((s, i) => (
                    <li key={i}>
                      <button type="button" className={`${styles.sujet} ${picked === i ? styles.sujetOn : ''}`} onClick={() => pick(i)} aria-pressed={picked === i}>
                        <span className={styles.sujetTitle}>{s.intitule}</span>
                        {s.enonce && <span className={styles.sujetText}>{s.enonce}</span>}
                        <span className={styles.tags}>
                          <span className={styles.tag}>{NIVEAU[s.niveau] || s.niveau}</span>
                          {s.notions.slice(0, 3).map((n) => <span key={n} className={styles.tag}>{n}</span>)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.hint}>Tu peux aussi écrire ton propre sujet ci-dessous.</p>
            </div>
          )}

          <label className={styles.field}>
            <span className={styles.label}>Sujet</span>
            <input className={styles.input} value={sujet} onChange={(e) => { setSujet(e.target.value); setPicked(null); }} placeholder={comp.sujetPlaceholder} maxLength={LIMITS.sujet} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{comp.enonceLabel}</span>
            <textarea className={styles.textarea} value={enonce} onChange={(e) => setEnonce(e.target.value)} placeholder={comp.enoncePlaceholder} maxLength={LIMITS.enonce} required={comp.enonceRequis} />
            <span className={styles.hint}>{enonce.length.toLocaleString('fr-FR')} / {LIMITS.enonce.toLocaleString('fr-FR')} caractères</span>
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.ghostBtn} onClick={() => { setStep(1); setError(''); }}>Retour</button>
            <button type="submit" className={styles.primary} disabled={busy || !!jobId}>{busy ? 'Préparation…' : 'Commencer à rédiger'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
