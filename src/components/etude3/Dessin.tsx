import React from 'react';
import type { Acteur, Bloc } from '@/lib/etude3/types';
import styles from './etude3.module.css';

/**
 * DESSINS PÉDAGOGIQUES — dessinés par l'application à partir d'une description structurée
 * (acteurs, rôles, actions). Aucune image générée : le dessin ne peut montrer QUE ce que la
 * leçon décrit, il est net sur tous les écrans, imprimable, gratuit, et toujours cohérent
 * d'une leçon à l'autre (mêmes personnages, mêmes couleurs, même trait).
 * Composant sans état : rendu côté serveur.
 */

type Scene = Extract<Bloc, { type: 'scene' }>;
type Comparaison = Extract<Bloc, { type: 'comparaison' }>;

const TEINTES = [
  { peau: '#8D5A3B', habit: '#1E5A96', cheveux: '#2A1A12' },
  { peau: '#6B4226', habit: '#B8541E', cheveux: '#1B120C' },
  { peau: '#A0694A', habit: '#26734D', cheveux: '#2A1A12' },
  { peau: '#7A4B2E', habit: '#7A3E8E', cheveux: '#1B120C' },
];

const ENCRE = '#1B2430';
const LARGEUR_ACTEUR = 210;
const HAUT = 330;
const SOL = 250;

/** Un personnage dessiné, centré en (x, SOL). */
function Personnage({ a, x, i }: { a: Acteur; x: number; i: number }) {
  const t = TEINTES[i % TEINTES.length];
  const y = SOL;
  if (a.genre === 'institution') {
    return (
      <g aria-hidden>
        <path d={`M${x - 62},${y - 104} L${x},${y - 140} L${x + 62},${y - 104} Z`} fill="#E8F0F7" stroke={ENCRE} strokeWidth={2.5} strokeLinejoin="round" />
        <rect x={x - 58} y={y - 104} width={116} height={10} fill="#C9D3DE" stroke={ENCRE} strokeWidth={2.5} />
        {[-40, -14, 12, 38].map((dx) => <rect key={dx} x={x + dx - 6} y={y - 92} width={12} height={78} rx={2} fill="#FFFFFF" stroke={ENCRE} strokeWidth={2} />)}
        <rect x={x - 66} y={y - 14} width={132} height={14} rx={2} fill="#C9D3DE" stroke={ENCRE} strokeWidth={2.5} />
      </g>
    );
  }
  if (a.genre === 'groupe') {
    return (
      <g aria-hidden>
        {[-38, 0, 38].map((dx, k) => {
          const tk = TEINTES[(i + k) % TEINTES.length];
          const s = k === 1 ? 1 : 0.86;
          const cx = x + dx;
          return (
            <g key={dx} transform={`translate(${cx} ${y}) scale(${s}) translate(${-cx} ${-y})`}>
              <path d={`M${cx - 26},${y} Q${cx - 26},${y - 70} ${cx},${y - 74} Q${cx + 26},${y - 70} ${cx + 26},${y} Z`} fill={tk.habit} stroke={ENCRE} strokeWidth={2.5} />
              <circle cx={cx} cy={y - 96} r={20} fill={tk.peau} stroke={ENCRE} strokeWidth={2.5} />
            </g>
          );
        })}
      </g>
    );
  }
  const robe = a.genre === 'juge' ? '#0C2C45' : a.genre === 'avocat' ? '#15161A' : t.habit;
  return (
    <g aria-hidden>
      {a.genre === 'juge' && (
        <g>
          <rect x={x - 74} y={y - 58} width={148} height={58} rx={6} fill="#C08A4E" stroke={ENCRE} strokeWidth={2.5} />
          <rect x={x - 74} y={y - 58} width={148} height={10} rx={4} fill="#A87240" stroke={ENCRE} strokeWidth={2} />
        </g>
      )}
      {/* corps */}
      <path d={`M${x - 36},${y - (a.genre === 'juge' ? 40 : 0)} Q${x - 38},${y - 104} ${x},${y - 110} Q${x + 38},${y - 104} ${x + 36},${y - (a.genre === 'juge' ? 40 : 0)} Z`}
        fill={robe} stroke={ENCRE} strokeWidth={2.5} strokeLinejoin="round" />
      {(a.genre === 'juge' || a.genre === 'avocat') && (
        <path d={`M${x - 8},${y - 106} L${x},${y - 84} L${x + 8},${y - 106} Z`} fill="#FFFFFF" stroke={ENCRE} strokeWidth={1.8} />
      )}
      {/* tête */}
      <circle cx={x} cy={y - 136} r={27} fill={t.peau} stroke={ENCRE} strokeWidth={2.5} />
      <path d={`M${x - 27},${y - 140} Q${x - 24},${y - 168} ${x},${y - 165} Q${x + 24},${y - 168} ${x + 27},${y - 140} Q${x + 12},${y - 152} ${x},${y - 150} Q${x - 14},${y - 152} ${x - 27},${y - 140} Z`} fill={t.cheveux} />
      <circle cx={x - 9} cy={y - 136} r={2.6} fill={ENCRE} />
      <circle cx={x + 9} cy={y - 136} r={2.6} fill={ENCRE} />
      <path d={`M${x - 8},${y - 124} Q${x},${y - 119} ${x + 8},${y - 124}`} fill="none" stroke={ENCRE} strokeWidth={2} strokeLinecap="round" />
      {a.genre === 'juge' && (
        <g>
          <rect x={x + 34} y={y - 76} width={26} height={12} rx={3} fill="#8A5A2B" stroke={ENCRE} strokeWidth={2} transform={`rotate(-28 ${x + 47} ${y - 70})`} />
          <line x1={x + 44} y1={y - 66} x2={x + 58} y2={y - 46} stroke={ENCRE} strokeWidth={3} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

/** Découpe une réplique en lignes courtes pour la bulle. */
function lignes(texte: string, max = 22): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of texte.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

export function DessinScene({ bloc }: { bloc: Scene }) {
  const n = bloc.acteurs.length;
  const W = Math.max(2, n) * LARGEUR_ACTEUR + 40;
  const xs = bloc.acteurs.map((_, i) => 20 + LARGEUR_ACTEUR / 2 + i * LARGEUR_ACTEUR);
  const pos = new Map(bloc.acteurs.map((a, i) => [a.id, xs[i]]));
  const nom = new Map(bloc.acteurs.map((a) => [a.id, a.nom]));
  const avecBulle = bloc.acteurs.some((a) => a.dit);
  const haut = avecBulle ? 92 : 0;

  // Actions : flèches courbes numérotées ; aller au-dessus, retour en dessous, décalées si plusieurs.
  const vus = new Map<string, number>();
  const fleches = bloc.relations.map((r, k) => {
    const x1 = pos.get(r.de)!, x2 = pos.get(r.vers)!;
    const paire = [r.de, r.vers].sort().join('|');
    const rang = vus.get(paire) ?? 0;
    vus.set(paire, rang + 1);
    const versDroite = x2 > x1;
    const yBase = versDroite ? SOL - 196 - rang * 26 : SOL + 26 + rang * 22;
    const courbe = Math.min(70, Math.abs(x2 - x1) / 4) * (versDroite ? -1 : 1);
    const xa = x1 + (versDroite ? 30 : -30), xb = x2 + (versDroite ? -30 : 30);
    const mx = (xa + xb) / 2, my = yBase + courbe;
    return { k: k + 1, d: `M${xa},${yBase} Q${mx},${my} ${xb},${yBase}`, mx, my: yBase + courbe / 2, r };
  });

  return (
    <figure className={`${styles.figure} ${styles.dessin}`}>
      <p className={styles.figTitle}>{bloc.titre}</p>
      <div className={styles.dessinScroll}>
        <svg viewBox={`0 ${-haut} ${W} ${HAUT + haut}`} role="img" aria-label={`${bloc.titre}. ${bloc.legende}`} className={styles.dessinSvg}>
          <defs>
            <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#B8541E" />
            </marker>
          </defs>
          <line x1={10} y1={SOL} x2={W - 10} y2={SOL} stroke="#D7DEE6" strokeWidth={3} strokeLinecap="round" />
          {bloc.acteurs.map((a, i) => <Personnage key={a.id} a={a} x={xs[i]} i={i} />)}
          {fleches.map((f) => (
            <g key={f.k}>
              <path d={f.d} fill="none" stroke="#B8541E" strokeWidth={3} strokeLinecap="round" markerEnd="url(#pointe)" />
              <circle cx={f.mx} cy={f.my} r={14} fill="#FFFFFF" stroke="#B8541E" strokeWidth={2.5} />
              <text x={f.mx} y={f.my + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#B8541E" fontFamily="var(--font-sans)">{f.k}</text>
            </g>
          ))}
          {bloc.acteurs.map((a, i) => (
            <g key={`t${a.id}`}>
              <text x={xs[i]} y={SOL + (bloc.relations.some((r) => (pos.get(r.vers)! < pos.get(r.de)!)) ? 66 : 30)} textAnchor="middle" fontSize="19" fontWeight="700" fill={ENCRE} fontFamily="var(--font-sans)">{a.nom}</text>
              <text x={xs[i]} y={SOL + (bloc.relations.some((r) => (pos.get(r.vers)! < pos.get(r.de)!)) ? 88 : 52)} textAnchor="middle" fontSize="15" fill="#4A5868" fontFamily="var(--font-sans)">{a.role}</text>
              {a.dit && (() => {
                const l = lignes(a.dit);
                const bw = Math.min(LARGEUR_ACTEUR - 16, Math.max(...l.map((s) => s.length)) * 8.6 + 24);
                const bh = l.length * 19 + 16;
                const by = SOL - 178 - bh - (a.genre === 'institution' ? 0 : 6);
                return (
                  <g>
                    <rect x={xs[i] - bw / 2} y={by} width={bw} height={bh} rx={12} fill="#FFFFFF" stroke={ENCRE} strokeWidth={2} />
                    <path d={`M${xs[i] - 8},${by + bh - 1} L${xs[i]},${by + bh + 12} L${xs[i] + 8},${by + bh - 1}`} fill="#FFFFFF" stroke={ENCRE} strokeWidth={2} strokeLinejoin="round" />
                    <rect x={xs[i] - 7} y={by + bh - 3} width={14} height={4} fill="#FFFFFF" />
                    {l.map((s, k) => <text key={k} x={xs[i]} y={by + 22 + k * 19} textAnchor="middle" fontSize="15" fontStyle="italic" fill={ENCRE} fontFamily="var(--font-sans)">{s}</text>)}
                  </g>
                );
              })()}
            </g>
          ))}
        </svg>
      </div>
      <ol className={styles.dessinActions}>
        {fleches.map((f) => (
          <li key={f.k}><span className={styles.dessinNum}>{f.k}</span><span><strong>{nom.get(f.r.de)}</strong> {f.r.action} <span className={styles.dessinVers}>→ {nom.get(f.r.vers)}</span></span></li>
        ))}
      </ol>
      <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>
    </figure>
  );
}

export function DessinComparaison({ bloc }: { bloc: Comparaison }) {
  return (
    <figure className={`${styles.figure} ${styles.dessin}`}>
      <p className={styles.figTitle}>{bloc.titre}</p>
      <div className={styles.compare} style={{ gridTemplateColumns: `repeat(${bloc.cotes.length}, minmax(0, 1fr))` }}>
        {bloc.cotes.map((c, i) => (
          <div key={i} className={styles.compareCard}>
            <span className={styles.compareTag}>{String.fromCharCode(65 + i)}</span>
            <p className={styles.compareTitle}>{c.titre}</p>
            <p className={styles.compareText}>{c.situation}</p>
            {c.consequence && <p className={styles.compareResult}>{c.consequence}</p>}
          </div>
        ))}
      </div>
      <p className={styles.compareCritere}><strong>Ce qui fait la différence : </strong>{bloc.critere}</p>
      <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>
    </figure>
  );
}
