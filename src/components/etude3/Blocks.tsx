import React from 'react';
import type { Bloc, Origine } from '@/lib/etude3/types';
import { DessinComparaison, DessinScene } from './Dessin';
import styles from './etude3.module.css';

/**
 * Rendu des blocs pédagogiques (synthèse et séquences). Composants sans état : rendus côté
 * serveur, imprimables tels quels. Tout le texte vient de l'IA : rendu en texte React
 * uniquement (jamais de HTML injecté) ; seul le **gras** devient un terme surligné.
 */

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4
          ? <strong key={i} className={styles.term}>{p.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>,
      )}
    </>
  );
}

/** Paragraphes séparés par des lignes vides. */
function Paras({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return <>{paras.map((p, i) => <p key={i} className={styles.p}><Rich text={p} /></p>)}</>;
}

const ORIGINE: Record<Origine, string> = { cours: 'Cours', explication: 'Explication', complement: 'Complément' };

function Note({ origine, pages }: { origine?: Origine; pages?: number[] }) {
  if (!origine && !pages?.length) return null;
  const cls = origine === 'cours' ? styles.noteCours : origine === 'complement' ? styles.noteComplement : '';
  const pagesTxt = pages?.length ? `p. ${pages.slice(0, 4).join(', ')}${pages.length > 4 ? '…' : ''}` : '';
  return (
    <span className={`${styles.note} ${cls}`} title={origine === 'complement' ? 'Complément qui ne figure pas dans ton cours' : undefined}>
      {[origine ? ORIGINE[origine] : '', pagesTxt].filter(Boolean).join(', ')}
    </span>
  );
}

export function BlocView({ bloc }: { bloc: Bloc }) {
  switch (bloc.type) {
    case 'titre':
      return <h3 className={styles.h3}>{bloc.texte}</h3>;
    case 'paragraphe':
      return (
        <div>
          <Paras text={bloc.texte} />
          <Note origine={bloc.origine} pages={bloc.pages} />
        </div>
      );
    case 'definition':
      return (
        <dl className={styles.definition}>
          <dt className={styles.defTerm}>{bloc.terme} <Note origine={bloc.origine} pages={bloc.pages} /></dt>
          <dd className={styles.defText} style={{ marginLeft: 0 }}><Rich text={bloc.definition} /></dd>
          {bloc.reformulation && <dd className={styles.defSimple} style={{ marginLeft: 0 }}><Rich text={bloc.reformulation} /></dd>}
        </dl>
      );
    case 'termes':
      return (
        <dl className={styles.terms}>
          {bloc.items.map((t, i) => (
            <div key={i} className={styles.termRow}>
              <dt><span className={styles.term}>{t.terme}</span></dt>
              <dd><Rich text={t.sens} /></dd>
            </div>
          ))}
        </dl>
      );
    case 'scene':
      return <DessinScene bloc={bloc} />;
    case 'comparaison':
      return <DessinComparaison bloc={bloc} />;
    case 'exemple':
      return (
        <aside className={styles.example}>
          <p className={styles.exampleTitle}>{bloc.titre || 'Exemple'}</p>
          <Paras text={bloc.texte} />
        </aside>
      );
    case 'piege':
      return <p className={styles.trap}><span className={styles.calloutLabel}>Piège à éviter. </span><Rich text={bloc.texte} /></p>;
    case 'attention':
      return <p className={styles.warning}><span className={styles.calloutLabel}>Attention. </span><Rich text={bloc.texte} /></p>;
    case 'incertitude':
      return <p className={styles.unsure}><Rich text={bloc.texte} /></p>;
    case 'liste':
      return (
        <div>
          {bloc.titre && <p className={styles.p} style={{ fontWeight: 700 }}>{bloc.titre}</p>}
          <ul className={styles.list}>{bloc.items.map((it, i) => <li key={i}><Rich text={it} /></li>)}</ul>
        </div>
      );
    case 'memo':
      return <ul className={styles.list}>{bloc.items.map((it, i) => <li key={i}><Rich text={it} /></li>)}</ul>;
    case 'tableau':
      return (
        <figure className={styles.figure}>
          <p className={styles.figTitle}>{bloc.titre}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{bloc.colonnes.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
              <tbody>{bloc.lignes.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}><Rich text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          {bloc.legende && <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>}
        </figure>
      );
    case 'arbre':
      return (
        <figure className={styles.figure}>
          <p className={styles.figTitle}>{bloc.titre}</p>
          <div className={styles.tree}>
            <span className={styles.treeQuestion}>{bloc.question}</span>
            <ul className={styles.treeBranches}>
              {bloc.branches.map((b, i) => (
                <li key={i} className={styles.treeBranch}>
                  <span className={styles.treeIf}>{b.condition}</span>
                  <span className={styles.treeThen}><Rich text={b.resultat} /></span>
                </li>
              ))}
            </ul>
          </div>
          {bloc.legende && <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>}
        </figure>
      );
    case 'processus':
      return (
        <figure className={styles.figure}>
          <p className={styles.figTitle}>{bloc.titre}</p>
          <ol className={styles.process}>
            {bloc.etapes.map((e, i) => (
              <li key={i} className={styles.processStep}>
                <span className={styles.processName}>{e.nom}</span>
                <span className={styles.processDetail}><Rich text={e.detail} /></span>
              </li>
            ))}
          </ol>
          {bloc.legende && <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>}
        </figure>
      );
    case 'frise':
      return (
        <figure className={styles.figure}>
          <p className={styles.figTitle}>{bloc.titre}</p>
          <ol className={styles.timeline}>
            {bloc.jalons.map((j, i) => (
              <li key={i}><span className={styles.timeDate}>{j.date}</span><Rich text={j.evenement} /></li>
            ))}
          </ol>
          {bloc.legende && <figcaption className={styles.figCaption}>{bloc.legende}</figcaption>}
        </figure>
      );
    default:
      return null;
  }
}

export function Blocks({ blocs }: { blocs: Bloc[] }) {
  return <>{blocs.map((b, i) => <BlocView key={i} bloc={b} />)}</>;
}
