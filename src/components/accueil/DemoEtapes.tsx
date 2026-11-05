"use client";

import { useEffect, useState } from 'react';
import s from './accueil.module.css';

/**
 * « SJP en action » : le parcours réel d'un étudiant, en 4 étapes qui avancent seules (6 s),
 * se mettent en pause au survol ou au focus, et ne bougent pas si l'étudiant a demandé à réduire
 * les animations. Seule animation automatique de la page.
 */
const ETAPES = [
  { titre: 'Tu importes ton cours', texte: 'Le PDF de ton professeur rejoint ta bibliothèque, rangé dans sa matière.' },
  { titre: 'SJP te prépare un examen', texte: 'Des questions tirées de ton document : QCM, vrai ou faux, textes à trous, mises en situation.' },
  { titre: 'Tu rédiges, SJP corrige', texte: 'Cas pratique, dissertation ou commentaire d’arrêt : une correction qui explique ta méthode.' },
  { titre: 'Tu vois où tu en es', texte: 'Tes notes, tes thèmes faibles et tes objectifs, au même endroit.' },
];
const DUREE_MS = 6000;

export default function DemoEtapes() {
  const [actif, setActif] = useState(0);
  const [pause, setPause] = useState(false);
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const maj = () => setReduit(m.matches);
    maj();
    m.addEventListener('change', maj);
    return () => m.removeEventListener('change', maj);
  }, []);

  useEffect(() => {
    if (pause || reduit) return;
    const t = setTimeout(() => setActif((a) => (a + 1) % ETAPES.length), DUREE_MS);
    return () => clearTimeout(t);
  }, [actif, pause, reduit]);

  return (
    <div className={s.demo} onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}
      onFocusCapture={() => setPause(true)} onBlurCapture={() => setPause(false)}>
      <ol className={s.demoEtapes}>
        {ETAPES.map((e, i) => (
          <li key={e.titre}>
            <button type="button" className={s.demoEtape} aria-current={i === actif ? 'step' : undefined} onClick={() => setActif(i)}>
              <span className={s.demoNum} aria-hidden>{i + 1}</span>
              <span>
                <span className={s.demoTitre}>{e.titre}</span>
                <span className={s.demoTexte}>{e.texte}</span>
              </span>
              {i === actif && !reduit && <span key={`${actif}-${pause}`} className={s.demoBarre} data-pause={pause || undefined} aria-hidden />}
            </button>
          </li>
        ))}
      </ol>

      <div className={s.demoEcran} aria-live="polite">
        <div className={s.fenetreBarre} aria-hidden><span /><span /><span /><em>tuina-ai.vercel.app</em></div>
        <div key={actif} className={s.demoPanneau}>
          {actif === 0 && (
            <div className={s.pBiblio}>
              <p className={s.pTitre}>Mes documents</p>
              <div className={s.depot}><span className={s.depotIcone} aria-hidden /> Séquence 3, les effets du mariage.pdf <b>importé</b></div>
              {[['Droit des personnes et de la famille', 'Séquence 4, les régimes matrimoniaux', '320 Ko'], ['Finances publiques', 'Support de cours 2 — FP S3', '438 Ko'], ['Droit international public', 'Séquence 1 — sources du droit', '259 Ko']].map(([m, n, t]) => (
                <div key={n} className={s.docLigne}><span className={s.docPdf} aria-hidden>PDF</span><span><b>{n}</b><small>{m} · {t}</small></span></div>
              ))}
            </div>
          )}
          {actif === 1 && (
            <div className={s.pExamen}>
              <p className={s.pTitre}>Examen · Les effets du mariage <span className={s.chrono}>18:42</span></p>
              <p className={s.question}>Un époux peut-il vendre seul le logement de la famille ?</p>
              {['Oui, s’il en est le seul propriétaire', 'Non, il faut le consentement des deux époux', 'Oui, avec l’accord du juge seulement', 'Non, le logement est inaliénable'].map((o, i) => (
                <div key={o} className={s.choix} data-ok={i === 1 || undefined}>{o}</div>
              ))}
            </div>
          )}
          {actif === 2 && (
            <div className={s.pRedaction}>
              <p className={s.pTitre}>Cas pratique · Copie corrigée <span className={s.note}>13,5<small>/20</small></span></p>
              <p className={s.copie}>Awa a vendu seule la maison où vit la famille. <mark>Le logement familial est protégé : aucun époux ne peut en disposer sans l’autre.</mark> Moussa peut donc agir…</p>
              <div className={s.remarque}><b>Raisonnement</b> Tu poses la règle, mais tu n’en tires pas la sanction : la nullité de la vente.</div>
            </div>
          )}
          {actif === 3 && (
            <div className={s.pProgres}>
              <p className={s.pTitre}>Progression · Droit de la famille</p>
              <div className={s.courbe} aria-hidden>{[9, 11, 10.5, 13, 14.5, 16].map((n, i) => <span key={i} style={{ height: `${n * 4.5}%` }}><em>{String(n).replace('.', ',')}</em></span>)}</div>
              <div className={s.theme}><span>Effets personnels du mariage</span><b>À retravailler</b></div>
              <div className={s.theme}><span>Régimes matrimoniaux</span><b data-ok>Maîtrisé</b></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
