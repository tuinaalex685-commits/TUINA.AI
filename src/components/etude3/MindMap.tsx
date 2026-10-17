import React from 'react';
import type { CarteMentale, NoeudCarte } from '@/lib/etude3/types';
import styles from './etude3.module.css';

/**
 * Carte mentale en SVG (rendu serveur, imprimable, sans bibliothèque).
 * Disposition radiale : le cours au centre, les branches principales autour, leurs nœuds
 * enfants en éventail. La couleur code le RÔLE du nœud (notion, règle, condition, exception,
 * conséquence) ; la légende le dit, et chaque nœud porte aussi son libellé (jamais la couleur seule).
 */
const COLORS: Record<NoeudCarte['type'], { fill: string; stroke: string; label: string }> = {
  notion: { fill: '#E8F0F7', stroke: '#1E5A96', label: 'Notion' },
  regle: { fill: '#0C2C45', stroke: '#0C2C45', label: 'Règle' },
  condition: { fill: '#FFF3C4', stroke: '#8A5A00', label: 'Condition' },
  exception: { fill: '#FCE9E7', stroke: '#B42E2E', label: 'Exception' },
  consequence: { fill: '#E3F3EA', stroke: '#26734D', label: 'Conséquence' },
};

function wrap(label: string, max = 22): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function MindMap({ carte }: { carte: CarteMentale }) {
  const roots = carte.noeuds.filter((n) => !n.parent);
  const children = (id: string) => carte.noeuds.filter((n) => n.parent === id);
  const W = 1100, H = 760, cx = W / 2, cy = H / 2;
  const R1 = 210, R2 = 340;

  type Placed = { n: NoeudCarte; x: number; y: number; px: number; py: number; level: number };
  const placed: Placed[] = [];
  roots.forEach((r, i) => {
    const a = (i / Math.max(roots.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + R1 * Math.cos(a), y = cy + R1 * Math.sin(a) * 0.82;
    placed.push({ n: r, x, y, px: cx, py: cy, level: 1 });
    const kids = children(r.id).slice(0, 5);
    const spread = Math.min(0.9, (Math.PI * 2) / Math.max(roots.length, 1) * 0.8);
    kids.forEach((k, j) => {
      const ka = a + (kids.length === 1 ? 0 : (j / (kids.length - 1) - 0.5) * spread);
      placed.push({ n: k, x: cx + R2 * Math.cos(ka), y: cy + R2 * Math.sin(ka) * 0.82, px: x, py: y, level: 2 });
    });
  });

  return (
    <figure className={styles.figure}>
      <div className={styles.mindmap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Carte mentale : ${carte.centre}, ${roots.length} branches principales`}>
          {placed.map((p, i) => (
            <path key={`l${i}`} d={`M${p.px},${p.py} Q${(p.px + p.x) / 2},${(p.py + p.y) / 2 - 20} ${p.x},${p.y}`} fill="none" stroke="#C9D3DE" strokeWidth={p.level === 1 ? 2.5 : 1.5} />
          ))}
          <g>
            <ellipse cx={cx} cy={cy} rx={120} ry={46} fill="#0C2C45" />
            {wrap(carte.centre, 24).map((l, i, all) => (
              <text key={i} x={cx} y={cy + (i - (all.length - 1) / 2) * 18 + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill="#FFFFFF" fontFamily="var(--font-sans)">{l}</text>
            ))}
          </g>
          {placed.map((p, i) => {
            const c = COLORS[p.n.type];
            const lines = wrap(p.n.label, p.level === 1 ? 20 : 18);
            const w = Math.max(...lines.map((l) => l.length)) * (p.level === 1 ? 8.2 : 7.4) + 26;
            const h = lines.length * 17 + 16;
            const dark = p.n.type === 'regle';
            return (
              <g key={`n${i}`}>
                <title>{`${c.label} : ${p.n.label}`}</title>
                <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={10} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
                {lines.map((l, k) => (
                  <text key={k} x={p.x} y={p.y + (k - (lines.length - 1) / 2) * 17 + 5} textAnchor="middle"
                    fontSize={p.level === 1 ? 14 : 12.5} fontWeight={p.level === 1 ? 700 : 500} fill={dark ? '#FFFFFF' : '#1B2430'} fontFamily="var(--font-sans)">{l}</text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.legend}>
        {Object.values(COLORS).map((c) => (
          <span key={c.label}><i style={{ background: c.fill, border: `1.5px solid ${c.stroke}` }} />{c.label}</span>
        ))}
      </div>
    </figure>
  );
}
