"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, RotateCcw, Send } from 'lucide-react';
import { reworkRedaction, submitRedaction, updateRedactionContent } from '@/app/actions/redaction';
import { formatDateTime } from '@/lib/format';
import { COMPARTIMENT_BY_TYPE, LIMITS, countWords } from '@/lib/redaction/compartiments';
import { StatusBadge } from '../RedactionHome';
import CorrectionView from './CorrectionView';
import styles from '../redaction.module.css';

export interface VersionItem {
  id: string;
  numero: number;
  date: string;
  note: number | null;
  rapport: unknown;
  contenu: string;
}

interface Copy {
  id: string;
  type: string;
  sujet: string;
  enonce: string | null;
  contenu: string;
  statut: string;
  rapport: unknown;
  courseName: string | null;
  lastError: string | null;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const AUTOSAVE_MS = 1500;
const POLL_MS = 5000;

export default function CopyWorkspace({ copy, versions, remaining }: { copy: Copy; versions: VersionItem[]; remaining: number }) {
  const router = useRouter();
  const comp = COMPARTIMENT_BY_TYPE.get(copy.type);
  const editable = copy.statut === 'brouillon' || copy.statut === 'erreur';

  const [text, setText] = useState(copy.contenu);
  const [save, setSave] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(versions[0]?.id ?? null);
  const lastSaved = useRef(copy.contenu);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (value: string) => {
    if (value === lastSaved.current) return true;
    setSave('saving');
    const res = await updateRedactionContent(copy.id, value);
    if ('error' in res && res.error) { setSave('error'); return false; }
    lastSaved.current = value;
    setSave('saved');
    setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    return true;
  }, [copy.id]);

  // Sauvegarde automatique 1,5 s après la dernière frappe (pas de requête à chaque touche).
  const onChange = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(value); }, AUTOSAVE_MS);
  };

  // Ctrl+S / Cmd+S : sauvegarde immédiate. Fermeture de l'onglet avec du texte non enregistré : avertissement.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void persist(text); }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (text !== lastSaved.current) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); };
  }, [editable, persist, text]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Correction en cours : la page se met à jour d'elle-même (même après rechargement ou changement d'appareil).
  useEffect(() => {
    if (copy.statut !== 'en_cours') return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [copy.statut, router]);

  const submit = async () => {
    if (text.trim().length < LIMITS.copieMinCorrection) {
      toast.error(`Ta copie est trop courte pour être corrigée (au moins ${LIMITS.copieMinCorrection} caractères).`);
      return;
    }
    if (remaining <= 0) { toast.error('Tu as utilisé tes corrections du jour. Reviens demain.'); return; }
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    if (!(await persist(text))) { setSubmitting(false); toast.error('Enregistrement impossible : vérifie ta connexion.'); return; }
    const res = await submitRedaction(copy.id);
    setSubmitting(false);
    if ('error' in res && res.error) { toast.error(res.error); return; }
    toast.success('Copie rendue. La correction arrive.');
    router.refresh();
  };

  const rework = async () => {
    const res = await reworkRedaction(copy.id);
    if ('error' in res && res.error) { toast.error(res.error); return; }
    router.refresh();
  };

  const words = countWords(text);
  const current = versions.find((v) => v.id === selected) ?? null;
  const previousOf = (v: VersionItem | null) => (v ? versions.find((x) => x.numero === v.numero - 1)?.note ?? null : null);

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.crumbs} aria-label="Fil d’Ariane">
          <Link href={`/app/redaction${comp ? `?type=${comp.slug}` : ''}`}>Rédaction</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{comp?.label ?? copy.type}</span>
        </nav>
        <div className={styles.head}>
          <h1 className={styles.title} style={{ fontSize: 'clamp(1.35rem, 2.6vw, 1.9rem)' }}>{copy.sujet}</h1>
          <StatusBadge statut={copy.statut} note={versions[0]?.note ?? null} />
        </div>
      </header>

      {copy.statut === 'en_cours' && (
        <p className={styles.banner} role="status">
          <span className={styles.spinner} aria-hidden />
          Ta copie est en correction. Tu peux fermer cette page : la correction t’attendra ici.
        </p>
      )}
      {copy.statut === 'erreur' && (
        <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {copy.lastError || 'La correction n’a pas pu aboutir.'} Tu peux rendre ta copie à nouveau. Si l’échec vient de nous, la correction ne t’est pas décomptée.
        </p>
      )}

      <div className={styles.workspace}>
        <div className={styles.formStack}>
          {(copy.enonce || copy.courseName) && (
            <section className={styles.subjectCard}>
              {copy.enonce && (
                <>
                  <p className={styles.subjectLabel}>{comp?.enonceLabel.replace(' (facultatif)', '') ?? 'Énoncé'}</p>
                  <div className={styles.enonce} style={{ marginTop: 0 }}>{copy.enonce}</div>
                </>
              )}
              {copy.courseName && <p className={styles.subjectSource}>Cours de référence : {copy.courseName}</p>}
            </section>
          )}

          {copy.statut === 'analyse' && current ? (
            <>
              <CorrectionView rapport={current.rapport ?? copy.rapport} previousNote={previousOf(current)} />
              <details className={`${styles.block} ${styles.details}`}>
                <summary>Ma copie (version {current.numero})</summary>
                <div className={styles.sheet} style={{ marginTop: 'var(--s-3)' }}>
                  <div className={styles.sheetReadonly}>{current.contenu}</div>
                </div>
              </details>
            </>
          ) : copy.statut === 'analyse' ? (
            <CorrectionView rapport={copy.rapport} previousNote={null} />
          ) : (
            <>
              <div className={styles.sheet}>
                <label htmlFor="copie" className="sr-only">Ta copie</label>
                <textarea
                  id="copie"
                  className={styles.sheetArea}
                  value={text}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => { if (editable) void persist(text); }}
                  readOnly={!editable}
                  maxLength={LIMITS.copie}
                  spellCheck
                  lang="fr"
                  placeholder={editable ? 'Commence ta copie ici. Elle est enregistrée automatiquement.' : ''}
                />
              </div>
              {editable && (
                <div className={styles.toolbar}>
                  <div className={styles.counter} aria-live="polite">
                    <span><strong>{words}</strong> mot{words > 1 ? 's' : ''}</span>
                    <span>{text.length.toLocaleString('fr-FR')} / {LIMITS.copie.toLocaleString('fr-FR')} caractères</span>
                    {save === 'saving' && <span className={styles.saving}>Enregistrement…</span>}
                    {save === 'saved' && <span className={styles.saved}>Enregistré à {savedAt}</span>}
                    {save === 'error' && <span className={styles.unsaved}>Non enregistré : vérifie ta connexion</span>}
                  </div>
                  <button type="button" className={styles.primary} onClick={submit} disabled={submitting}>
                    <Send size={17} aria-hidden /> {submitting ? 'Envoi…' : `Rendre ma copie (${remaining} correction${remaining > 1 ? 's' : ''} aujourd’hui)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className={styles.side}>
          {copy.statut === 'analyse' && (
            <button type="button" className={styles.primary} onClick={rework}>
              <RotateCcw size={17} aria-hidden /> Retravailler ma copie
            </button>
          )}

          {comp && (
            <details className={styles.methode} open={copy.statut !== 'analyse'}>
              <summary>{comp.methode.titre} <ChevronDown size={18} aria-hidden /></summary>
              <ol className={styles.methodeSteps}>
                {comp.methode.etapes.map((e) => (
                  <li key={e.nom}><strong>{e.nom}</strong><span>{e.detail}</span></li>
                ))}
              </ol>
            </details>
          )}

          {versions.length > 0 && (
            <section className={styles.methode}>
              <p className={styles.blockTitle} style={{ marginBottom: 'var(--s-3)' }}>Versions corrigées</p>
              <ul className={styles.versions}>
                {versions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={`${styles.versionBtn} ${selected === v.id && copy.statut === 'analyse' ? styles.versionOn : ''}`}
                      onClick={() => setSelected(v.id)}
                      disabled={copy.statut !== 'analyse'}
                      title={copy.statut !== 'analyse' ? 'Visible quand la copie est corrigée' : undefined}
                    >
                      <span>Version {v.numero} · {formatDateTime(v.date)}</span>
                      {v.note !== null && <span className={styles.versionNote}>{String(v.note).replace('.', ',')}/20</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
