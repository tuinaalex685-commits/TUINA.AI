import React from 'react';
import styles from './admin.module.css';

/**
 * Graphiques du tableau de bord administrateur — SVG et HTML faits main, sans bibliothèque.
 * Une seule série par graphique : une seule teinte (bleu acier), pas de légende, valeurs
 * écrites à côté des barres, infobulle native au survol (<title>) et version texte lisible
 * par les lecteurs d'écran.
 */

export function DailyBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const W = 600;
  const H = 160;
  const gap = 2;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const total = data.reduce((s, d) => s + d.value, 0);
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { label: '', value: 0 });

  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.chartSvg} role="img" aria-label={`Coût par jour sur ${data.length} jours. Total ${format(total)}. Pic le ${peak.label} : ${format(peak.value)}.`}>
        <line x1="0" x2={W} y1={H} y2={H} className={styles.axis} />
        {data.map((d, i) => {
          const h = max > 0 ? Math.max(d.value > 0 ? 3 : 0, (d.value / max) * (H - 6)) : 0;
          const x = i * (bw + gap);
          return (
            <g key={d.label}>
              {/* Zone de survol plus grande que la barre */}
              <rect x={x} y={0} width={bw} height={H} fill="transparent">
                <title>{`${d.label} : ${format(d.value)}`}</title>
              </rect>
              {h > 0 && (
                <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(3, bw / 2)} className={styles.bar}>
                  <title>{`${d.label} : ${format(d.value)}`}</title>
                </rect>
              )}
            </g>
          );
        })}
      </svg>
      {/* Dates hors du dessin : elles gardent leur taille quelle que soit la largeur. */}
      <div className={styles.ticks} aria-hidden>
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}

export function HBars({ rows, format, empty }: {
  rows: { label: string; value: number; hint?: string }[];
  format: (v: number) => string;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0 || max === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.hbars}>
      {rows.map((r) => (
        <li key={r.label} className={styles.hbarRow} title={`${r.label} : ${format(r.value)}${r.hint ? ` (${r.hint})` : ''}`}>
          <span className={styles.hbarLabel}>{r.label}</span>
          <span className={styles.hbarTrack}>
            <span className={styles.hbarFill} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className={`${styles.hbarValue} tabular`}>{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={`${styles.kpiValue} tabular`}>{value}</p>
      {sub && <p className={`${styles.kpiSub} ${tone === 'warn' ? styles.warn : tone === 'ok' ? styles.ok : ''}`}>{sub}</p>}
    </div>
  );
}
