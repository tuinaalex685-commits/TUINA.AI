/**
 * Gestes pédagogiques PURS de l'Étude Guidée V2 (EG.2a).
 *
 * Ce sont des TRANSFORMÉS DÉTERMINISTES du contenu déjà généré — jamais de
 * génération IA, jamais d'appel réseau. Ils fabriquent les paliers d'apprentissage
 * (amorce, récupération par cloze, remédiation ciblée) à partir de l'`explication`
 * et du `question_forme` existants. Voir la conception figée « Étude Guidée V2 ».
 *
 * Contrat : chaque helper renvoie `null` (ou un fallback sûr) si la donnée ne s'y
 * prête pas → le lecteur saute simplement le palier (dégradation gracieuse pour
 * les cours déjà générés).
 */

/** Normalisation robuste pour comparer des réponses (casse, espaces, ponctuation, accents). */
export function normalize(s?: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[.,!?;:«»"'()]/g, '').replace(/\s+/g, ' ');
}

/**
 * P0 — Amorce : la « situation d'ouverture » du thème, si l'explication en contient
 * une sous forme de citation Markdown (> …). Sert à faire anticiper l'étudiant AVANT
 * de dévoiler la règle. `null` si aucune citation → le lecteur montre une amorce
 * générique sans extrait (participation active conservée, sans texte inventé).
 */
export function getAmorce(explication?: string): string | null {
  if (!explication) return null;
  const lignes = explication.split('\n');
  const cites: string[] = [];
  for (const l of lignes) {
    const m = l.match(/^\s*>\s?(.*)$/);
    if (m && m[1].trim()) cites.push(m[1].trim());
    else if (cites.length) break; // on s'arrête à la fin du 1er bloc de citation
  }
  if (cites.length === 0) return null;
  const texte = cites.join(' ').replace(/\*\*/g, '').trim();
  return texte.length >= 15 && texte.length <= 400 ? texte : null;
}

/**
 * P1 — Cloze : masque le PREMIER terme-clé en **gras** de l'explication pour un
 * rappel actif (« le mot juste, tu l'as ? »). Renvoie la phrase-contexte avec un
 * blanc + la réponse. `null` si aucun terme en gras exploitable → pas de cloze.
 */
export function buildCloze(explication?: string): { contexte: string; reponse: string } | null {
  if (!explication) return null;
  const texte = explication.replace(/\r/g, '');
  const re = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) {
    const terme = m[1].trim();
    // Un terme-clé, pas une clause entière : 2-40 caractères, ≤ 5 mots, sans ponctuation de phrase.
    if (terme.length < 2 || terme.length > 40) continue;
    if (terme.split(/\s+/).length > 5) continue;
    if (/[.!?;:]/.test(terme)) continue;
    // Phrase-contexte autour du terme (bornée aux délimiteurs de phrase).
    const idx = m.index;
    const plain = texte.replace(/\*\*/g, '');
    const posPlain = plain.indexOf(terme, Math.max(0, idx - 4));
    if (posPlain < 0) continue;
    let debut = posPlain;
    while (debut > 0 && !/[.!?\n]/.test(plain[debut - 1])) debut--;
    let fin = posPlain + terme.length;
    while (fin < plain.length && !/[.!?\n]/.test(plain[fin])) fin++;
    const phrase = plain.slice(debut, fin).trim();
    if (phrase.length < terme.length + 8) continue; // besoin d'un minimum de contexte
    const contexte = phrase.replace(terme, '_____');
    if (!contexte.includes('_____')) continue;
    return { contexte, reponse: terme };
  }
  return null;
}

/** Vrai si la saisie du cloze correspond (tolérante) au terme attendu. */
export function clozeOk(saisie: string, reponse: string): boolean {
  const a = normalize(saisie);
  const b = normalize(reponse);
  return a.length > 0 && (a === b || b.includes(a) || a.includes(b));
}

export interface RemediationBranche { blocage?: string; reexplication?: string }

/**
 * P2 — Remédiation ciblée : choisit la ré-explication déjà générée la plus proche
 * de l'option choisie par l'étudiant (matching flou sur `blocage`). À défaut, la
 * première branche. `null` si aucune remédiation → le lecteur affiche un repli
 * générique (« pourquoi la bonne réponse est la bonne »).
 */
export function matchRemediation(
  branches: RemediationBranche[] | undefined | null, optionChoisie?: string
): string | null {
  const list = (branches || []).filter((b) => b && b.reexplication);
  if (list.length === 0) return null;
  const opt = normalize(optionChoisie);
  if (opt) {
    for (const b of list) {
      const bloc = normalize(b.blocage);
      if (bloc && (bloc.includes(opt) || opt.includes(bloc))) return b.reexplication!;
    }
    // sinon, chevauchement de mots significatifs
    const mots = opt.split(' ').filter((w) => w.length >= 4);
    for (const b of list) {
      const bloc = normalize(b.blocage);
      if (mots.some((w) => bloc.includes(w))) return b.reexplication!;
    }
  }
  return list[0].reexplication!;
}
