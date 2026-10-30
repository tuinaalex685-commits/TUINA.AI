"use client";

import { useState } from 'react';
import type { Acteur, Bloc } from '@/lib/etude3/types';
import { Rich } from './Rich';
import styles from './etude3.module.css';

/**
 * DESSINS PÉDAGOGIQUES — dessinés par l'application à partir d'une description structurée
 * (personnages, rôles, répliques, actions). Aucune image générée : le dessin ne montre QUE ce que
 * la leçon décrit, il est net sur tous les écrans, imprimable, gratuit, et toujours cohérent
 * (mêmes personnages, même trait). Style : fond blanc, trait fin, couleurs douces, étiquette du
 * rôle au-dessus de chaque personnage, bulles avec ✓ / ✗.
 * Interactif : toucher un personnage explique son rôle et met ses actions en évidence ; sous le
 * dessin, l'explication et des questions-réponses préparées (pas de discussion libre avec l'IA).
 */

type Scene = Extract<Bloc, { type: 'scene' }>;
type Comparaison = Extract<Bloc, { type: 'comparaison' }>;

const ENCRE = '#2B3440';
const PEAUX = ['#C68B67', '#8D5A3B', '#E0AC86', '#6B4226'];
const HABITS = ['#CFE0F1', '#F3D9C9', '#D9EAD7', '#E6DCF0', '#F6E8C3'];
const LARGEUR = 230;
const SOL = 300;

/** Un personnage au trait, centré en (x, SOL). */
function Personnage({ a, x, i, actif }: { a: Acteur; x: number; i: number; actif: boolean }) {
  const peau = PEAUX[i % PEAUX.length];
  const habit = HABITS[i % HABITS.length];
  const y = SOL;
  const trait = { stroke: ENCRE, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  if (a.genre === 'institution') {
    return (
      <g aria-hidden>
        <path d={`M${x - 64},${y - 112} L${x},${y - 150} L${x + 64},${y - 112} Z`} fill="#F4F7FA" {...trait} />
        <rect x={x - 60} y={y - 112} width={120} height={10} fill="#E6ECF2" {...trait} />
        {[-42, -14, 14, 42].map((dx) => <rect key={dx} x={x + dx - 6} y={y - 100} width={12} height={86} rx={2} fill="#FFFFFF" {...trait} />)}
        <rect x={x - 70} y={y - 14} width={140} height={14} rx={2} fill="#E6ECF2" {...trait} />
      </g>
    );
  }
  if (a.genre === 'groupe') {
    return (
      <g aria-hidden>
        {[-44, 0, 44].map((dx, k) => {
          const cx = x + dx, s = k === 1 ? 1 : 0.86;
          return (
            <g key={dx} transform={`translate(${cx} ${y}) scale(${s}) translate(${-cx} ${-y})`}>
              <path d={`M${cx - 28},${y} Q${cx - 28},${y - 74} ${cx},${y - 78} Q${cx + 28},${y - 74} ${cx + 28},${y} Z`} fill={HABITS[(i + k) % HABITS.length]} {...trait} />
              <circle cx={cx} cy={y - 100} r={21} fill={PEAUX[(i + k) % PEAUX.length]} {...trait} />
            </g>
          );
        })}
      </g>
    );
  }
  const femme = a.sexe === 'femme';
  const robe = a.genre === 'juge' ? '#2E3D4F' : a.genre === 'avocat' ? '#1F2328' : habit;
  const assis = a.genre === 'juge';
  const bas = assis ? 52 : 0;
  return (
    <g aria-hidden style={{ opacity: actif ? 1 : 0.92 }}>
      {assis && (
        <g>
          <rect x={x - 80} y={y - 60} width={160} height={60} rx={6} fill="#E9DCC8" {...trait} />
          <line x1={x - 80} y1={y - 48} x2={x + 80} y2={y - 48} {...trait} />
        </g>
      )}
      {/* corps : épaules, et une jupe ou une veste selon le personnage */}
      <path d={femme
        ? `M${x - 34},${y - bas} L${x - 24},${y - 70 - bas} Q${x - 26},${y - 112 - bas} ${x},${y - 116 - bas} Q${x + 26},${y - 112 - bas} ${x + 24},${y - 70 - bas} L${x + 34},${y - bas} Z`
        : `M${x - 36},${y - bas} Q${x - 40},${y - 108 - bas} ${x},${y - 116 - bas} Q${x + 40},${y - 108 - bas} ${x + 36},${y - bas} Z`}
        fill={robe} {...trait} />
      {(a.genre === 'juge' || a.genre === 'avocat') && <path d={`M${x - 9},${y - 112 - bas} L${x},${y - 88 - bas} L${x + 9},${y - 112 - bas} Z`} fill="#FFFFFF" {...trait} />}
      {a.genre === 'officier' && (
        // Écharpe tricolore portée en bandoulière par l'officier d'état civil.
        <g>
          <path d={`M${x - 30},${y - 104} L${x + 26},${y - 30} L${x + 34},${y - 40} L${x - 22},${y - 112} Z`} fill="#2F6DB5" stroke="none" />
          <path d={`M${x - 22},${y - 112} L${x + 34},${y - 40} L${x + 40},${y - 48} L${x - 14},${y - 118} Z`} fill="#FFFFFF" stroke="none" />
          <path d={`M${x - 14},${y - 118} L${x + 40},${y - 48} L${x + 44},${y - 58} L${x - 6},${y - 122} Z`} fill="#D9473B" stroke="none" />
        </g>
      )}
      {/* tête */}
      <circle cx={x} cy={y - 142 - bas} r={26} fill={peau} {...trait} />
      {femme
        ? <path d={`M${x - 28},${y - 136 - bas} Q${x - 30},${y - 176 - bas} ${x},${y - 172 - bas} Q${x + 30},${y - 176 - bas} ${x + 28},${y - 136 - bas} Q${x + 34},${y - 110 - bas} ${x + 24},${y - 104 - bas} Q${x + 18},${y - 140 - bas} ${x},${y - 154 - bas} Q${x - 18},${y - 140 - bas} ${x - 24},${y - 104 - bas} Q${x - 34},${y - 110 - bas} ${x - 28},${y - 136 - bas} Z`} fill="#3B2A20" />
        : <path d={`M${x - 26},${y - 146 - bas} Q${x - 24},${y - 172 - bas} ${x},${y - 170 - bas} Q${x + 24},${y - 172 - bas} ${x + 26},${y - 146 - bas} Q${x + 12},${y - 158 - bas} ${x},${y - 156 - bas} Q${x - 14},${y - 158 - bas} ${x - 26},${y - 146 - bas} Z`} fill="#2A1E17" />}
      <circle cx={x - 9} cy={y - 142 - bas} r={2.4} fill={ENCRE} />
      <circle cx={x + 9} cy={y - 142 - bas} r={2.4} fill={ENCRE} />
      <path d={`M${x - 7},${y - 131 - bas} Q${x},${y - 126 - bas} ${x + 7},${y - 131 - bas}`} fill="none" {...trait} strokeWidth={1.8} />
    </g>
  );
}

function lignes(texte: string, max = 20): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of texte.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

export function DessinScene({ bloc }: { bloc: Scene }) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const n = bloc.acteurs.length;
  const W = Math.max(2, n) * LARGEUR + 40;
  const xs = bloc.acteurs.map((_, i) => 20 + LARGEUR / 2 + i * LARGEUR);
  const pos = new Map(bloc.acteurs.map((a, i) => [a.id, xs[i]]));
  const nom = new Map(bloc.acteurs.map((a) => [a.id, a.nom]));
  const haut = bloc.acteurs.some((a) => a.dit) ? 120 : 40;

  const vus = new Map<string, number>();
  const fleches = bloc.relations.map((r, k) => {
    const x1 = pos.get(r.de)!, x2 = pos.get(r.vers)!;
    const paire = [r.de, r.vers].sort().join('|');
    const rang = vus.get(paire) ?? 0;
    vus.set(paire, rang + 1);
    const yBase = SOL + 30 + rang * 30 + (x2 > x1 ? 0 : 15);
    const xa = x1 + (x2 > x1 ? 26 : -26), xb = x2 + (x2 > x1 ? -26 : 26);
    const courbe = 26;
    return { k: k + 1, d: `M${xa},${yBase} Q${(xa + xb) / 2},${yBase + courbe} ${xb},${yBase}`, mx: (xa + xb) / 2, my: yBase + courbe / 2, r };
  });
  const basFleches = fleches.length ? Math.max(...fleches.map((f) => f.my)) + 40 : SOL + 20;
  const acteurChoisi = bloc.acteurs.find((a) => a.id === choisi);

  return (
    <figure className={`${styles.figure} ${styles.dessin}`}>
      <p className={styles.figTitle}>{bloc.titre}</p>
      <div className={styles.dessinScroll}>
        <svg viewBox={`0 ${-haut + 40} ${W} ${basFleches + haut - 40}`} role="img" aria-label={`${bloc.titre}. ${bloc.legende}`} className={styles.dessinSvg}>
          <defs>
            <marker id="dessin-pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={ENCRE} />
            </marker>
          </defs>
          {bloc.acteurs.map((a, i) => {
            const actif = !choisi || choisi === a.id;
            const tete = a.genre === 'juge' ? SOL - 246 : a.genre === 'institution' ? SOL - 186 : SOL - 206;
            const l = a.dit ? lignes(a.dit) : [];
            const bw = l.length ? Math.min(LARGEUR - 14, Math.max(...l.map((s) => s.length)) * 8.4 + 46) : 0;
            const bh = l.length * 19 + 18;
            const by = tete - 34 - bh;
            return (
              <g key={a.id} className={styles.dessinActeur} tabIndex={0} role="button" aria-pressed={choisi === a.id}
                aria-label={`${a.nom}, ${a.role}`} onClick={() => setChoisi(choisi === a.id ? null : a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChoisi(choisi === a.id ? null : a.id); } }}
                style={{ opacity: actif ? 1 : 0.35, transition: 'opacity 180ms' }}>
                <Personnage a={a} x={xs[i]} i={i} actif={actif} />
                {/* étiquette du rôle, au-dessus de la tête */}
                <g>
                  <rect x={xs[i] - (a.role.length * 4.3 + 14)} y={tete - 26} width={a.role.length * 8.6 + 28} height={24} rx={12} fill="#FFFFFF" stroke={ENCRE} strokeWidth={1.4} />
                  <text x={xs[i]} y={tete - 9} textAnchor="middle" fontSize="13.5" fontWeight="700" fill={ENCRE} fontFamily="var(--font-sans)">{a.role}</text>
                </g>
                {l.length > 0 && (
                  <g>
                    <rect x={xs[i] - bw / 2} y={by} width={bw} height={bh} rx={12} fill={a.etat === 'non' ? '#FDF0EE' : a.etat === 'oui' ? '#EEF7F1' : '#FFFFFF'} stroke={ENCRE} strokeWidth={1.6} />
                    <path d={`M${xs[i] - 8},${by + bh - 1} L${xs[i] - 2},${by + bh + 12} L${xs[i] + 8},${by + bh - 1}`} fill={a.etat === 'non' ? '#FDF0EE' : a.etat === 'oui' ? '#EEF7F1' : '#FFFFFF'} stroke={ENCRE} strokeWidth={1.6} strokeLinejoin="round" />
                    <rect x={xs[i] - 7} y={by + bh - 3} width={14} height={4} fill={a.etat === 'non' ? '#FDF0EE' : a.etat === 'oui' ? '#EEF7F1' : '#FFFFFF'} />
                    {a.etat && (
                      <text x={xs[i] - bw / 2 + 16} y={by + bh / 2 + 7} textAnchor="middle" fontSize="20" fontWeight="800" fill={a.etat === 'oui' ? '#2E8B57' : '#C0392B'}>{a.etat === 'oui' ? '✓' : '✗'}</text>
                    )}
                    {l.map((s, k) => <text key={k} x={xs[i] + (a.etat ? 10 : 0)} y={by + 24 + k * 19} textAnchor="middle" fontSize="14.5" fontWeight="600" fill={ENCRE} fontFamily="var(--font-sans)">{s}</text>)}
                  </g>
                )}
                <text x={xs[i]} y={SOL + 22} textAnchor="middle" fontSize="16" fontWeight="700" fill={ENCRE} fontFamily="var(--font-sans)">{a.nom}</text>
              </g>
            );
          })}
          {fleches.map((f) => {
            const actif = !choisi || f.r.de === choisi || f.r.vers === choisi;
            return (
              <g key={f.k} style={{ opacity: actif ? 1 : 0.2, transition: 'opacity 180ms' }}>
                <path d={f.d} fill="none" stroke={ENCRE} strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#dessin-pointe)" />
                <circle cx={f.mx} cy={f.my} r={12} fill="#FFFFFF" stroke={ENCRE} strokeWidth={1.8} />
                <text x={f.mx} y={f.my + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill={ENCRE} fontFamily="var(--font-sans)">{f.k}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {acteurChoisi ? (
        <p className={styles.dessinFocus}><strong>{acteurChoisi.nom} — {acteurChoisi.role}. </strong>{acteurChoisi.explication ? <Rich text={acteurChoisi.explication} /> : 'Touche un autre personnage, ou le même pour tout revoir.'}</p>
      ) : (
        <p className={styles.dessinAide}>Touche un personnage pour voir son rôle et ce qu’il fait.</p>
      )}
      {fleches.length > 0 && (
        <ol className={styles.dessinActions}>
          {fleches.map((f) => (
            <li key={f.k}><span className={styles.dessinNum}>{f.k}</span><span><strong>{nom.get(f.r.de)}</strong> {f.r.action} <span className={styles.dessinVers}>→ {nom.get(f.r.vers)}</span></span></li>
          ))}
        </ol>
      )}
      <figcaption className={styles.dessinExplication}><strong>Ce que montre ce dessin. </strong><Rich text={bloc.legende} /></figcaption>
      {bloc.questions && bloc.questions.length > 0 && (
        <div className={styles.dessinQuestions}>
          <p className={styles.panelTitle}>Tu te demandes peut-être…</p>
          {bloc.questions.map((q, i) => (
            <details key={i} className={styles.dessinQ}>
              <summary>{q.question}</summary>
              <p className={styles.p}><Rich text={q.reponse} /></p>
            </details>
          ))}
        </div>
      )}
    </figure>
  );
}

export function DessinComparaison({ bloc }: { bloc: Comparaison }) {
  return (
    <figure className={`${styles.figure} ${styles.dessin}`}>
      <p className={styles.figTitle}>{bloc.titre}</p>
      <div className={styles.compare} style={{ gridTemplateColumns: `repeat(${bloc.cotes.length}, minmax(0, 1fr))` }}>
        {bloc.cotes.map((c, i) => (
          <div key={i} className={`${styles.compareCard} ${c.valide === true ? styles.compareOui : c.valide === false ? styles.compareNon : ''}`}>
            <span className={styles.compareTag} aria-hidden>{c.valide === true ? '✓' : c.valide === false ? '✗' : String.fromCharCode(65 + i)}</span>
            <p className={styles.compareTitle}>{c.titre}</p>
            <p className={styles.compareText}><Rich text={c.situation} /></p>
            {c.consequence && <p className={styles.compareResult}><Rich text={c.consequence} /></p>}
          </div>
        ))}
      </div>
      <p className={styles.compareCritere}><strong>Ce qui fait la différence : </strong><Rich text={bloc.critere} /></p>
      <figcaption className={styles.dessinExplication}><strong>Ce que montre ce dessin. </strong><Rich text={bloc.legende} /></figcaption>
    </figure>
  );
}
