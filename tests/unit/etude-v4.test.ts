// Moteur Études guidées v4 : découpage du cours, validation des contenus produits par l'IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireModules, detecterTitres, repartirLecons } from '../../src/lib/etude3/structure.ts';
import { normalizeBloc, normalizeCarteMentale, normalizeModule, normalizeSequence, normalizeSynthese, planDepuisModules } from '../../src/lib/etude3/validate.ts';

const texte = (n: number) => 'Le juge examine la prétention des parties et rend une décision motivée. '.repeat(Math.ceil(n / 72)).slice(0, n);

/** Un faux cours : introduction, deux parties, des chapitres de tailles variées. */
function cours(): string[] {
  const pages: string[] = [];
  pages.push('LISTE DES ABREVIATIONS\nArt. Article\nC.P.C. Code de procédure civile');
  pages.push(`INTRODUCTION GENERALE\n${texte(3000)}`);
  pages.push(texte(3000));
  pages.push(`PREMIERE PARTIE : L'ACTION EN JUSTICE\nTITRE 1 : GÉNÉRALITÉS\nCHAPITRE 1 : LA NOTION D'ACTION\n${texte(2500)}`);
  for (let i = 0; i < 4; i++) pages.push(texte(3200));
  pages.push(`CHAPITRE 2 – LES CONDITIONS D'EXISTENCE\n${texte(2500)}`);
  // « partie » en début de ligne dans le texte courant : ce n'est PAS un titre.
  pages.push(`partie l'ait sollicitée. Mais, précise l'article 192, il doit s'agir de faits.\n${texte(2800)}`);
  for (let i = 0; i < 3; i++) pages.push(texte(3200));
  pages.push(`DEUXIEME PARTIE - L'INSTANCE\nCHAPITRE 1 - LE LIEN D'INSTANCE\n${texte(2500)}`);
  for (let i = 0; i < 4; i++) pages.push(texte(3200));
  pages.push('TABLE DES MATIÈRES\nINTRODUCTION ......... 2\nPREMIERE PARTIE ......... 4\nCHAPITRE 1 ......... 4\nCHAPITRE 2 ......... 9\nDEUXIEME PARTIE ......... 15');
  return pages;
}

test('titres : le plan de l’auteur est reconnu, le texte courant et le sommaire sont ignorés', () => {
  const titres = detecterTitres(cours());
  const textes = titres.map((t) => t.texte);
  assert.ok(textes.some((t) => t.startsWith('INTRODUCTION GENERALE')));
  assert.ok(textes.some((t) => t.startsWith('PREMIERE PARTIE')));
  assert.ok(textes.some((t) => t.startsWith('CHAPITRE 2')));
  assert.ok(!textes.some((t) => /^partie l'ait/i.test(t)), 'faux titre détecté dans le texte courant');
  assert.ok(!titres.some((t) => t.page === cours().length), 'titres du sommaire pris pour des frontières');
});

test('modules : tout le contenu est couvert, dans l’ordre, sans page en double', () => {
  const pages = cours();
  const modules = construireModules(pages, { min: 4000, max: 20000 });
  assert.ok(modules.length >= 3);
  const couvertes = modules.flatMap((m) => m.pages);
  assert.deepEqual(couvertes, [...couvertes].sort((a, b) => a - b), 'ordre du cours non respecté');
  assert.equal(new Set(couvertes).size, couvertes.length, 'page couverte deux fois');
  for (let p = 1; p < pages.length; p++) assert.ok(couvertes.includes(p), `page ${p} oubliée`);
  assert.ok(!couvertes.includes(pages.length), 'le sommaire ne doit pas être étudié');
  const ch2 = modules.find((m) => m.titre.includes('CONDITIONS'));
  assert.ok(ch2 && ch2.chemin[0]?.startsWith('PREMIERE PARTIE'), 'le chapitre doit connaître sa partie');
  for (const m of modules) assert.ok(m.caracteres <= 20000 * 1.2, `module ${m.id} trop gros`);
});

test('modules : un document sans titres est découpé par blocs de pages', () => {
  const pages = Array.from({ length: 30 }, () => texte(3000));
  const modules = construireModules(pages, { max: 20000 });
  assert.ok(modules.length >= 4);
  assert.equal(modules.flatMap((m) => m.pages).length, 30);
});

test('modules : le plafond est respecté', () => {
  const pages = Array.from({ length: 120 }, (_, i) => `CHAPITRE ${i + 1} : SUJET\n${texte(9000)}`);
  assert.ok(construireModules(pages, { maxModules: 40 }).length <= 40);
});

test('leçons : proportionnelles à la matière, au moins une par module, 60 au plus', () => {
  assert.deepEqual(repartirLecons([{ caracteres: 6000 }, { caracteres: 18000 }]), [1, 3]);
  const gros = repartirLecons(Array.from({ length: 40 }, () => ({ caracteres: 60000 })));
  assert.ok(gros.reduce((a, b) => a + b, 0) <= 60);
  assert.ok(gros.every((n) => n >= 1));
});

test('dessin : rejeté s’il est incohérent (acteur inconnu, sans légende)', () => {
  const base = {
    type: 'scene', titre: 'Un prêt', legende: 'Awa est créancière de Paul.',
    acteurs: [{ id: 'a', nom: 'Awa', role: 'créancière', genre: 'personne' }, { id: 'p', nom: 'Paul', role: 'débiteur', genre: 'personne' }],
    relations: [{ de: 'a', vers: 'p', action: 'prête 100 000 FCFA' }],
  };
  assert.ok(normalizeBloc(base, 10));
  assert.equal(normalizeBloc({ ...base, legende: '' }, 10), null);
  assert.equal(normalizeBloc({ ...base, relations: [{ de: 'a', vers: 'x', action: 'saisit' }] }, 10), null);
  assert.equal(normalizeBloc({ ...base, acteurs: base.acteurs.slice(0, 1) }, 10), null);
});

test('carte mentale : parents inconnus et cycles ramenés au centre', () => {
  const c = normalizeCarteMentale({ centre: 'DJP', noeuds: [
    { id: 'a', label: 'A', type: 'notion', parent: 'b' },
    { id: 'b', label: 'B', type: 'notion', parent: 'a' },
    { id: 'c', label: 'C', type: 'regle', parent: 'z' },
  ] });
  const parents = new Map(c.noeuds.map((n) => [n.id, n.parent]));
  assert.equal(parents.get('c'), null);
  assert.ok(parents.get('a') === null || parents.get('b') === null, 'le cycle doit être rompu');
});

test('module : pages ramenées au module, nombre de leçons borné', () => {
  const raw = {
    titre: 'L’action en justice', idee_centrale: 'x',
    notions: [{ nom: 'Intérêt pour agir', niveau: 'indispensable', sens: 's', pages: [5, 99] }],
    lecons: [
      { titre: 'L1', objectif: 'o', accroche: 'a', notions: [], pages: [5, 200] },
      { titre: 'L2', objectif: 'o', accroche: 'a', notions: [], pages: [] },
      { titre: 'L3', objectif: 'o', accroche: 'a', notions: [], pages: [6] },
    ],
    carte: { centre: 'x', noeuds: [] },
  };
  const m = normalizeModule(raw, { id: 'm2', titre: 'T', pages: [4, 5, 6] }, 2);
  assert.equal(m.lecons.length, 2);
  assert.deepEqual(m.lecons[0].pages, [5]);
  assert.deepEqual(m.lecons[1].pages, [4, 5, 6], 'une leçon sans page reçoit tout le module');
  assert.deepEqual(m.notions[0].pages, [5]);
  const plan = planDepuisModules([m, m]);
  assert.deepEqual(plan.map((p) => p.ordre), [1, 2, 3, 4]);
  assert.equal(plan[0].module, 'm2');
});

test('synthèse : chaque module appartient à une branche, une seule fois', () => {
  const s = normalizeSynthese({
    titre: 'DJP', presentation: 'p', pourquoi: 'q', questions: [],
    branches: [
      { titre: 'Action', idee: 'i', simple: 's', liens: 'l', avant_de_commencer: 'a', modules: ['m1', 'm2', 'm2', 'm9'] },
      { titre: 'Instance', idee: 'i', simple: 's', liens: 'l', avant_de_commencer: 'a', modules: ['m4'] },
    ],
    carte: { centre: 'DJP', noeuds: [{ id: 'g1', label: 'Action', type: 'notion', module: 'm1' }, { id: 'g2', label: 'X', type: 'notion', module: 'm77' }] },
    pieges: [], a_retenir: [], a_approfondir: [],
  }, ['m1', 'm2', 'm3', 'm4']);
  const tous = s.branches.flatMap((b) => b.modules);
  assert.deepEqual([...tous].sort(), ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(s.branches[0].modules, ['m1', 'm2', 'm3'], 'module oublié rattaché à la branche précédente');
  assert.equal(s.carte?.noeuds.find((n) => n.id === 'g2')?.module, undefined, 'module inexistant retiré');
});

test('leçon : étapes dans l’ordre pédagogique, vérifications de difficulté croissante, un seul dessin', () => {
  const scene = (t: string) => ({ type: 'scene', titre: t, legende: 'l', acteurs: [{ id: 'a', nom: 'A', role: 'r', genre: 'personne' }, { id: 'b', nom: 'B', role: 'r', genre: 'juge' }], relations: [{ de: 'a', vers: 'b', action: 'saisit' }] });
  const seq = normalizeSequence({
    titre: 'L’action en justice', objectif: 'o', accroche: { situation: 'Tu prêtes 100 000 FCFA…', question: 'Que peux-tu faire ?' },
    etapes: [
      { cle: 'retenir', blocs: [{ type: 'liste', items: ['x'] }] },
      { cle: 'formuler', blocs: [{ type: 'definition', terme: 'Action', definition: 'd', origine: 'cours', pages: [8] }] },
      { cle: 'comprendre', blocs: [{ type: 'paragraphe', texte: 't' }, scene('1')] },
      { cle: 'illustrer', blocs: [scene('2')] },
      { cle: 'inconnue', blocs: [{ type: 'paragraphe', texte: 't' }] },
    ],
    activites: [
      { id: 'q4', type: 'ouverte', niveau: 'examen', notion: 'n', consigne: 'c', attendus: ['a'], autre_explication: 'x', explication_simple: 'y' },
      { id: 'q1', type: 'choix', niveau: 'comprendre', notion: 'n', consigne: 'c', choix: ['a', 'b', 'c'], bonne: 1, pourquoi_faux: ['1', '2', '3'], autre_explication: 'x', explication_simple: 'y' },
      { id: 'q9', type: 'choix', niveau: 'distinguer', notion: 'n', consigne: 'c', choix: ['a', 'b'], bonne: 5, autre_explication: 'x' },
    ],
    savoir_expliquer: 's', suite: 'Prochaine leçon…', liens: [],
  }, 1, 50);
  assert.deepEqual(seq.etapes!.map((e) => e.cle), ['comprendre', 'formuler', 'illustrer', 'retenir']);
  assert.deepEqual(seq.activites.map((a) => a.niveau), ['comprendre', 'examen'], 'QCM sans bonne réponse rejeté, ordre de difficulté');
  assert.ok(seq.activites.every((a) => a.id.startsWith('l41')), 'identifiants préfixés par la version');
  const dessins = seq.etapes!.flatMap((e) => e.blocs).filter((b) => b.type === 'scene');
  assert.equal(dessins.length, 1, 'un dessin par leçon au plus');
});

test('leçon : refusée sans explication de fond ou sans formulation juridique', () => {
  const act = [{ id: 'a', type: 'choix', notion: 'n', consigne: 'c', choix: ['a', 'b'], bonne: 0, autre_explication: 'x' }];
  assert.throws(() => normalizeSequence({ etapes: [{ cle: 'formuler', blocs: [{ type: 'paragraphe', texte: 't' }] }], activites: act }, 1, 10));
  assert.throws(() => normalizeSequence({ etapes: [{ cle: 'comprendre', blocs: [{ type: 'paragraphe', texte: 't' }] }], activites: act }, 1, 10));
});

test('QCM v4.1 : la bonne réponse vient de la proposition marquée juste (une seule)', () => {
  const base = { etapes: [{ cle: 'comprendre', blocs: [{ type: 'paragraphe', texte: 't' }] }, { cle: 'formuler', blocs: [{ type: 'paragraphe', texte: 't' }] }] };
  const p = (j: boolean[]) => j.map((juste, i) => ({ texte: `P${i}`, juste, pourquoi: `car ${i}` }));
  const seq = normalizeSequence({ ...base, activites: [
    { id: 'a', type: 'choix', niveau: 'comprendre', notion: 'n', consigne: 'c', propositions: p([false, false, true]), autre_explication: 'x' },
    { id: 'b', type: 'choix', niveau: 'distinguer', notion: 'n', consigne: 'c', propositions: p([true, true, false]), autre_explication: 'x' },
    { id: 'c', type: 'choix', niveau: 'appliquer', notion: 'n', consigne: 'c', propositions: p([false, false, false]), autre_explication: 'x' },
  ] }, 1, 10);
  assert.equal(seq.activites.length, 1, 'zéro ou deux bonnes réponses : rejeté');
  const a = seq.activites[0];
  assert.ok(a.type === 'choix' && a.bonne === 2 && a.pourquoi_faux[2] === 'car 2');
});
