/**
 * TEST PÉDAGOGIQUE COMPARATIF — ancien moteur (v3) contre nouveau moteur (v4), sur le MÊME passage
 * d'un vrai cours. Produit les deux leçons et un rapport à lire et à évaluer (grille ci-dessous).
 *
 * Coût : 3 appels Gemini 2.5 Flash par passage (v3 : 1 leçon ; v4 : compréhension du module + leçon),
 * soit quelques centimes de dollar. Rien n'est écrit en base. À lancer volontairement :
 *
 *   GEMINI_API_KEY=… node --import ./tests/ts-resolve.mjs tests/pedagogie/comparer.mts <cours.pdf> <pageDébut> <pageFin> "<objectif>" [sortie]
 *
 * Exemple (précis de DJP, conditions d'existence de l'action, p. 28 à 35) :
 *   node --import ./tests/ts-resolve.mjs tests/pedagogie/comparer.mts precis.pdf 28 35 "Comprendre les conditions d'existence de l'action en justice"
 */
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { extractPages, extraitPages } from '../../src/lib/etude3/extract.ts';
import { MODULE_SYSTEM, MODULE_SCHEMA, LECON_SYSTEM, LECON_SCHEMA, neutralize } from '../../src/lib/prompts/etude/prompts.ts';
import { normalizeModule, normalizeSequence } from '../../src/lib/etude3/validate.ts';
import { SEQUENCE_SYSTEM as V3_SYSTEM, SEQUENCE_SCHEMA as V3_SCHEMA } from './v3/prompts.ts';

const [pdf, deb, fin, objectif, sortie = 'tests/pedagogie/resultats'] = process.argv.slice(2);
if (!pdf || !deb || !fin || !objectif) { console.error('Usage : comparer.mts <cours.pdf> <pageDébut> <pageFin> "<objectif>" [dossier]'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY manquante.'); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function generer(system: string, prompt: string, schema: any, temperature: number, thinkingBudget: number) {
  const t0 = Date.now();
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash', contents: [{ text: prompt }],
    config: { systemInstruction: system, responseMimeType: 'application/json', responseSchema: schema, temperature, thinkingConfig: { thinkingBudget } },
  });
  const u = r.usageMetadata || {};
  console.log(`  ${Math.round((Date.now() - t0) / 1000)} s, ${u.promptTokenCount} jetons lus, ${(u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)} écrits`);
  return JSON.parse(r.text || '{}');
}

const { pages } = await extractPages(fs.readFileSync(pdf));
const numeros = Array.from({ length: Number(fin) - Number(deb) + 1 }, (_, i) => Number(deb) + i);
const cours = neutralize(extraitPages(pages, numeros, 90000));
fs.mkdirSync(sortie, { recursive: true });
const base = path.join(sortie, `p${deb}-${fin}`);

// --- Ancien moteur (v3) : une séquence à partir des pages et de l'objectif ---------------------
console.log('Ancien moteur (v3) : séquence…');
const v3 = await generer(V3_SYSTEM, [
  `SÉQUENCE 1 : ${objectif}\nObjectif : ${objectif}`,
  `<COURS>\n${extraitPages(pages, numeros, 30000)}\n</COURS>`,
].join('\n\n'), V3_SCHEMA, 0.4, 1024);
fs.writeFileSync(`${base}-v3.json`, JSON.stringify(v3, null, 2));

// --- Nouveau moteur (v4) : comprendre le module, puis enseigner UNE leçon ----------------------
console.log('Nouveau moteur (v4) : compréhension du passage…');
const mod = { id: 'm1', titre: objectif, pages: numeros };
const rawModule = await generer(MODULE_SYSTEM, [
  `PLAN DU COURS (modules) :\nm1. ${objectif} (p. ${deb}-${fin})`,
  `MODULE À ANALYSER : m1. ${objectif}`,
  'NOMBRE DE LEÇONS À PRÉVOIR POUR CE MODULE : 1',
  `<MODULE pages="${deb}-${fin}">\n${cours}\n</MODULE>`,
].join('\n\n'), MODULE_SCHEMA, 0.2, 1024);
const analyse = normalizeModule(rawModule, mod, 1);
const lecon = analyse.lecons[0];
console.log('Nouveau moteur (v4) : leçon…');
const rawLecon = await generer(LECON_SYSTEM, [
  `MODULE : ${analyse.titre} — ${analyse.idee_centrale}`,
  'C’est la PREMIÈRE leçon du parcours.',
  `LEÇON 1 sur 1 : ${lecon.titre}\nObjectif : ${lecon.objectif}\nNotions : ${lecon.notions.join(', ')}\nAccroche prévue : ${lecon.accroche || ''}`,
  'C’est la DERNIÈRE leçon : « suite » vide.',
  `<CARTE>\n${neutralize(JSON.stringify({ notions: analyse.notions, distinctions: analyse.distinctions, pieges: analyse.pieges, ambiguites: analyse.ambiguites })).slice(0, 14000)}\n</CARTE>`,
  `<COURS>\n${extraitPages(pages, lecon.pages, 32000)}\n</COURS>`,
].join('\n\n'), LECON_SCHEMA, 0.4, 2048);
const v4 = normalizeSequence(rawLecon, 1, pages.length);
fs.writeFileSync(`${base}-v4-module.json`, JSON.stringify(analyse, null, 2));
fs.writeFileSync(`${base}-v4-lecon.json`, JSON.stringify(v4, null, 2));

// --- Rapport lisible -----------------------------------------------------------------------------
const blocTxt = (b: any): string => {
  switch (b.type) {
    case 'paragraphe': case 'piege': case 'attention': case 'incertitude': return `[${b.type}${b.pages?.length ? ` p.${b.pages.join(',')}` : ''}] ${b.texte}`;
    case 'definition': return `[définition ${b.origine || ''} p.${(b.pages || []).join(',')}] ${b.terme} : ${b.definition}${b.reformulation ? `\n   ↳ ${b.reformulation}` : ''}`;
    case 'termes': return b.items.map((t: any) => `[terme] ${t.terme} : ${t.sens}`).join('\n');
    case 'exemple': return `[exemple] ${b.titre || ''}\n${b.texte}`;
    case 'scene': return `[DESSIN] ${b.titre} — ${b.acteurs.map((a: any) => `${a.nom} (${a.role})`).join(', ')} — ${b.relations.map((r: any) => `${r.de}→${r.vers} : ${r.action}`).join(' ; ')}\n   légende : ${b.legende}`;
    case 'comparaison': return `[COMPARAISON] ${b.titre} — ${b.cotes.map((c: any) => c.titre).join(' / ')} — critère : ${b.critere}`;
    case 'tableau': return `[tableau] ${b.titre}\n${[b.colonnes, ...b.lignes].map((l: string[]) => '| ' + l.join(' | ') + ' |').join('\n')}`;
    case 'liste': return `[liste] ${b.titre || ''}\n${b.items.map((i: string) => '- ' + i).join('\n')}`;
    default: return `[${b.type}] ${JSON.stringify(b).slice(0, 400)}`;
  }
};
const activitesTxt = (acts: any[]) => acts.map((a, i) => `${i + 1}. (${a.type}${a.niveau ? `, ${a.niveau}` : ''}) ${a.consigne}\n${a.choix ? a.choix.map((c: string, k: number) => `   ${k === a.bonne ? '✔' : ' '} ${c}${a.pourquoi_faux?.[k] ? `\n      ↳ ${a.pourquoi_faux[k]}` : ''}`).join('\n') : `   attendus : ${(a.attendus || []).join(' ; ')}`}\n   autre explication : ${a.autre_explication || '—'}${a.explication_simple ? `\n   plus simple : ${a.explication_simple}` : ''}`).join('\n\n');

const rapport = `# Test comparatif — ${objectif} (p. ${deb} à ${fin})

## Ancien moteur (v3)
### ${v3.titre || ''}
${(v3.blocs || []).map(blocTxt).join('\n\n')}

### Vérifications
${activitesTxt(v3.activites || [])}

## Nouveau moteur (v4)
### ${v4.titre}
**Situation :** ${v4.accroche?.situation || '—'}
**Question :** ${v4.accroche?.question || '—'}

${(v4.etapes || []).map((e) => `### Étape « ${e.cle} »\n${e.blocs.map(blocTxt).join('\n\n')}`).join('\n\n')}

**Pour l'expliquer :** ${v4.savoir_expliquer || '—'}

### Vérifications
${activitesTxt(v4.activites)}

## Grille d'évaluation (à remplir par un lecteur, /5 chacun)
| Critère | v3 | v4 |
|---|---|---|
| Clarté pour un débutant | | |
| Raisonnement (problème → mécanisme → règle) | | |
| Fidélité au PDF (définitions, pages, aucune invention) | | |
| Pertinence des exemples et du dessin | | |
| Qualité des distinctions | | |
| Progressivité | | |
| Exercices et corrections | | |
| Vérification réelle de la compréhension | | |
`;
fs.writeFileSync(`${base}-rapport.md`, rapport);
console.log(`\nRapport : ${base}-rapport.md`);
