"use client";

import React, { useState } from 'react';
import { CATEGORIES, isRapportV2, type ErreurCategorie, type RapportV2 } from '@/lib/redaction/compartiments';
import styles from '../redaction.module.css';

const CAT_COLORS: Record<ErreurCategorie, { ink: string; soft: string }> = {
  droit: { ink: '#B42E2E', soft: '#FCE9E7' },
  raisonnement: { ink: '#1E5A96', soft: '#E8F0F7' },
  methode: { ink: '#A6501A', soft: '#FCEEE2' },
  formulation: { ink: '#26734D', soft: '#E3F3EA' },
};

const fr = (n: number) => String(n).replace('.', ',');

/** Correction d'une version (format v2), ou repli lisible pour les anciennes corrections. */
export default function CorrectionView({ rapport, previousNote }: { rapport: unknown; previousNote: number | null }) {
  const [filter, setFilter] = useState<ErreurCategorie | 'toutes'>('toutes');

  if (!isRapportV2(rapport)) return <LegacyReport rapport={rapport} />;
  const r: RapportV2 = rapport;
  const delta = previousNote !== null ? Math.round((r.note - previousNote) * 2) / 2 : null;
  const shown = filter === 'toutes' ? r.erreurs : r.erreurs.filter((e) => e.categorie === filter);

  return (
    <div className={styles.formStack}>
      <section className={styles.grade} aria-label="Note et appréciation">
        <div>
          <div className={styles.gradeValue}>
            <span className={styles.gradeNumber}>{fr(r.note)}</span>
            <span className={styles.gradeOver}>/20</span>
          </div>
          <p className={styles.gradeNote}>Note indicative</p>
        </div>
        <div>
          <p className={styles.gradeText}>{r.appreciation}</p>
          {r.comparaison && (
            <div className={styles.evolution}>
              {delta !== null && (
                <span className={`${styles.delta} ${delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaFlat}`}>
                  {delta > 0 ? `+${fr(delta)}` : fr(delta)} point{Math.abs(delta) > 1 ? 's' : ''}
                </span>
              )}
              <span>{r.comparaison.evolution}</span>
            </div>
          )}
        </div>
      </section>

      {r.priorites.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Tes priorités pour la prochaine version</h2>
          <ol className={styles.priorities}>{r.priorites.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </section>
      )}

      {r.comparaison && (r.comparaison.progres.length > 0 || r.comparaison.reste_a_travailler.length > 0) && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Depuis ta version précédente</h2>
          {r.comparaison.progres.length > 0 && <ul className={styles.bullets}>{r.comparaison.progres.map((p, i) => <li key={i}>✓ {p}</li>)}</ul>}
          {r.comparaison.reste_a_travailler.length > 0 && (
            <ul className={styles.bullets} style={{ marginTop: 'var(--s-3)' }}>{r.comparaison.reste_a_travailler.map((p, i) => <li key={i}>À reprendre : {p}</li>)}</ul>
          )}
        </section>
      )}

      {r.points_forts.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Ce que tu as bien fait</h2>
          <ul className={styles.bullets}>{r.points_forts.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Les erreurs, une par une</h2>
        {r.erreurs.length === 0 ? (
          <p className={styles.gradeText}>Aucune erreur relevée sur cette version.</p>
        ) : (
          <>
            <div className={styles.filters} role="group" aria-label="Filtrer par type d’erreur">
              <button type="button" className={`${styles.filter} ${filter === 'toutes' ? styles.filterOn : ''}`} onClick={() => setFilter('toutes')} aria-pressed={filter === 'toutes'}>
                Toutes · {r.erreurs.length}
              </button>
              {CATEGORIES.map((c) => {
                const n = r.erreurs.filter((e) => e.categorie === c.key).length;
                if (!n) return null;
                const col = CAT_COLORS[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    title={c.aide}
                    className={`${styles.filter} ${filter === c.key ? styles.filterOn : ''}`}
                    style={{ '--cat': col.ink, '--cat-soft': col.soft } as React.CSSProperties}
                    onClick={() => setFilter(c.key)}
                    aria-pressed={filter === c.key}
                  >
                    {c.label.replace('Erreurs de ', '')} · {n}
                  </button>
                );
              })}
            </div>
            <ul className={styles.mistakes}>
              {shown.map((e, i) => {
                const col = CAT_COLORS[e.categorie];
                const cat = CATEGORIES.find((c) => c.key === e.categorie);
                return (
                  <li key={i} className={styles.mistake} style={{ '--cat': col.ink, '--cat-soft': col.soft } as React.CSSProperties}>
                    <span className={styles.mistakeCat}>{cat?.label.replace('Erreurs de ', '').replace(/^\w/, (m) => m.toUpperCase())}</span>
                    {e.extrait && e.extrait !== '—' && <blockquote className={styles.quote}><mark>{e.extrait}</mark></blockquote>}
                    <p className={styles.mistakeText}>{e.probleme}</p>
                    {e.conseil && <p className={styles.mistakeAdvice}><strong>Comment faire :</strong> {e.conseil}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {r.proposition.contenu.length > 0 && (
        <details className={`${styles.block} ${styles.details}`}>
          <summary>{r.proposition.titre || 'Pistes de correction'}</summary>
          <ul className={styles.bullets} style={{ marginTop: 'var(--s-3)' }}>{r.proposition.contenu.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </details>
      )}

      {r.limites && <p className={styles.limits}><strong>Limites de cette correction :</strong> {r.limites}</p>}
    </div>
  );
}

/** Anciennes corrections (avant la v2) : affichées telles quelles, sans perte. */
function LegacyReport({ rapport }: { rapport: any }) {
  if (!rapport || typeof rapport !== 'object') return <p className={styles.gradeText}>Correction indisponible pour cette version.</p>;
  const list = (title: string, items: unknown) =>
    Array.isArray(items) && items.length > 0 ? (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>{title}</h2>
        <ul className={styles.bullets}>{items.map((p, i) => <li key={i}>{String(p)}</li>)}</ul>
      </section>
    ) : null;
  const prop = rapport.proposition && typeof rapport.proposition === 'object' ? rapport.proposition : null;
  return (
    <div className={styles.formStack}>
      {rapport.note_globale && (
        <section className={styles.grade}><p className={styles.gradeText}><strong>Appréciation : </strong>{String(rapport.note_globale)}</p></section>
      )}
      {list('Points forts', rapport.points_forts)}
      {list('Points faibles', rapport.points_faibles)}
      {list('Axes d’amélioration', rapport.axes_amelioration)}
      {prop && (
        <details className={`${styles.block} ${styles.details}`}>
          <summary>Proposition de correction</summary>
          <ul className={styles.bullets} style={{ marginTop: 'var(--s-3)' }}>
            {Object.entries(prop).map(([k, v]) => (
              <li key={k}><strong>{k.replace(/_/g, ' ')} : </strong>{Array.isArray(v) ? v.join(' · ') : String(v)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
