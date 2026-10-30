"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { CarteMentale, NoeudCarte } from '@/lib/etude3/types';
import styles from './etude3.module.css';

/**
 * Carte mentale INTERACTIVE : une vue d'ensemble du cours + une carte par module (partie,
 * chapitre). Lisible sur téléphone (arbre dépliable, pas une image figée), on navigue entre
 * les cartes, on déplie et replie les branches, et un clic sur une notion affiche son
 * explication, sa relation avec la notion parente et les leçons où elle est enseignée.
 */

export interface VueCarte {
  id: string;              // 'ensemble' ou identifiant de module (m1…)
  titre: string;
  groupe?: string;         // partie du cours, pour regrouper les cartes dans le sélecteur
  carte: CarteMentale;
}

export interface LeconCarte { ordre: number; titre: string; module?: string; notions: string[] }

const TYPES: Record<NoeudCarte['type'], { label: string; cls: string }> = {
  notion: { label: 'Notion', cls: styles.nodeNotion },
  regle: { label: 'Règle', cls: styles.nodeRegle },
  condition: { label: 'Condition', cls: styles.nodeCondition },
  exception: { label: 'Exception', cls: styles.nodeException },
  consequence: { label: 'Conséquence', cls: styles.nodeConsequence },
};

const cle = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export default function CarteInteractive({ vues, lecons, pdfId, debloquee, initiale }: {
  vues: VueCarte[];
  lecons: LeconCarte[];
  pdfId: string;
  debloquee: number;       // plus haute leçon ouverte pour cet étudiant (0 : synthèse pas encore lue)
  initiale?: string;
}) {
  const [vueId, setVueId] = useState(() => (vues.some((v) => v.id === initiale) ? initiale! : vues[0]?.id));
  const idx = Math.max(0, vues.findIndex((v) => v.id === vueId));
  const vue = vues[idx];
  const [ouverts, setOuverts] = useState<Set<string> | null>(null); // null : branches de 1er niveau dépliées
  const [choisi, setChoisi] = useState<string | null>(null);

  const enfants = useMemo(() => {
    const m = new Map<string | null, NoeudCarte[]>();
    for (const n of vue?.carte.noeuds || []) {
      const p = n.parent ?? null;
      m.set(p, [...(m.get(p) || []), n]);
    }
    return m;
  }, [vue]);

  if (!vue) return null;
  const parId = new Map(vue.carte.noeuds.map((n) => [n.id, n]));
  const estOuvert = (id: string, profondeur: number) => (ouverts ? ouverts.has(id) : profondeur < 1);
  const basculer = (id: string, profondeur: number) => {
    const base = ouverts ?? new Set(vue.carte.noeuds.filter((n) => !n.parent).map((n) => n.id));
    const next = new Set(base);
    if (estOuvert(id, profondeur)) next.delete(id); else next.add(id);
    setOuverts(next);
  };
  const changerVue = (id: string) => { setVueId(id); setOuverts(null); setChoisi(null); };

  // Leçons liées à un nœud : même module, et notion correspondante si on la reconnaît.
  const leconsDe = (n: NoeudCarte) => {
    const mid = n.module ?? (vue.id !== 'ensemble' ? vue.id : undefined);
    if (!mid) return [];
    const duModule = lecons.filter((l) => l.module === mid);
    const k = cle(n.label);
    const precises = duModule.filter((l) => [l.titre, ...l.notions].some((t) => { const c = cle(t); return c.includes(k) || k.includes(c); }));
    return precises.length ? precises : duModule;
  };

  const groupes = Array.from(new Set(vues.slice(1).map((v) => v.groupe || 'Le cours')));
  const detail = choisi ? parId.get(choisi) : null;

  const rendre = (parent: string | null, profondeur: number): React.ReactNode => {
    const liste = enfants.get(parent) || [];
    if (!liste.length) return null;
    return (
      <ul className={profondeur === 0 ? styles.mapRoots : styles.mapChildren}>
        {liste.map((n) => {
          const kids = (enfants.get(n.id) || []).length;
          const ouvert = estOuvert(n.id, profondeur);
          return (
            <li key={n.id} className={styles.mapItem}>
              {n.lien && parent && <span className={styles.mapLink}>{n.lien}</span>}
              <div className={styles.mapRow}>
                {kids > 0 ? (
                  <button type="button" className={styles.mapToggle} aria-expanded={ouvert} aria-label={`${ouvert ? 'Replier' : 'Déplier'} ${n.label}`} onClick={() => basculer(n.id, profondeur)}>
                    <ChevronDown size={16} style={{ transform: ouvert ? 'none' : 'rotate(-90deg)', transition: 'transform 160ms' }} aria-hidden />
                  </button>
                ) : <span className={styles.mapToggleVide} aria-hidden />}
                <button type="button" className={`${styles.mapNode} ${TYPES[n.type].cls} ${choisi === n.id ? styles.mapNodeOn : ''}`} onClick={() => setChoisi(choisi === n.id ? null : n.id)} aria-pressed={choisi === n.id}>
                  <span className={styles.mapNodeType}>{TYPES[n.type].label}</span>
                  {n.label}
                  {kids > 0 && !ouvert && <span className={styles.mapCount}>+{kids}</span>}
                </button>
              </div>
              {kids > 0 && ouvert && rendre(n.id, profondeur + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={styles.map}>
      <div className={styles.mapBar}>
        <button type="button" className={styles.mapNav} onClick={() => changerVue(vues[idx - 1].id)} disabled={idx === 0} aria-label="Carte précédente"><ChevronLeft size={18} aria-hidden /></button>
        <label className={styles.mapSelect}>
          <span className="sr-only">Choisir une carte</span>
          <select value={vue.id} onChange={(e) => changerVue(e.target.value)}>
            <option value={vues[0].id}>{vues[0].titre}</option>
            {groupes.map((g) => (
              <optgroup key={g} label={g}>
                {vues.slice(1).filter((v) => (v.groupe || 'Le cours') === g).map((v) => <option key={v.id} value={v.id}>{v.titre}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className={styles.mapNav} onClick={() => changerVue(vues[idx + 1].id)} disabled={idx >= vues.length - 1} aria-label="Carte suivante"><ChevronRight size={18} aria-hidden /></button>
      </div>

      <div className={styles.mapBody}>
        <div className={styles.mapTree}>
          <div className={styles.mapCentre}>{vue.carte.centre}</div>
          {rendre(null, 0)}
          <div className={styles.mapTools}>
            <button type="button" className={styles.link} onClick={() => setOuverts(new Set(vue.carte.noeuds.map((n) => n.id)))}>Tout déplier</button>
            <button type="button" className={styles.link} onClick={() => setOuverts(new Set())}>Tout replier</button>
          </div>
        </div>

        <aside className={styles.mapDetail} aria-live="polite">
          {detail ? (
            <>
              <span className={`${styles.mapNodeType} ${styles.mapDetailType}`}>{TYPES[detail.type].label}</span>
              <p className={styles.mapDetailTitle}>{detail.label}</p>
              {detail.parent && parId.get(detail.parent) && (
                <p className={styles.mapDetailRel}>
                  {detail.lien ? <><em>{detail.lien}</em> </> : 'rattaché à '}<strong>{parId.get(detail.parent)!.label}</strong>
                </p>
              )}
              {detail.explication ? <p className={styles.panelText}>{detail.explication}</p> : <p className={styles.panelText}>Cette notion est expliquée dans les leçons ci-dessous.</p>}
              {detail.module && detail.module !== vue.id && vues.some((v) => v.id === detail.module) && (
                <button type="button" className={styles.secondary} onClick={() => changerVue(detail.module!)}>Ouvrir la carte de cette partie</button>
              )}
              {leconsDe(detail).length > 0 && (
                <div className={styles.mapLessons}>
                  <p className={styles.panelTitle}>Où l’apprendre</p>
                  <ul>
                    {leconsDe(detail).slice(0, 6).map((l) => (
                      <li key={l.ordre}>
                        {l.ordre <= debloquee
                          ? <Link href={`/app/etude/${pdfId}/sequence/${l.ordre}`}>Leçon {l.ordre} · {l.titre}</Link>
                          : <span className={styles.railMeta}><Lock size={12} aria-hidden /> Leçon {l.ordre} · {l.titre}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <p className={styles.panelTitle}>Explore la carte</p>
              <p className={styles.panelText}>Touche une notion pour voir ce qu’elle recouvre, son lien avec le reste et les leçons où tu l’apprends. Les flèches déplient les branches.</p>
              <ul className={styles.legend}>
                {Object.values(TYPES).map((t) => <li key={t.label}><i className={t.cls} />{t.label}</li>)}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
