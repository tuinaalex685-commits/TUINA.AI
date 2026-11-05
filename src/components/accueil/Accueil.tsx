import Link from 'next/link';
import DemoEtapes from './DemoEtapes';
import s from './accueil.module.css';

/**
 * Page d'accueil publique de SJP (landing). Composant serveur : seule la démonstration en étapes
 * est un composant navigateur. Les offres et limites viennent des props (code des quotas),
 * l'Étude guidée et le Catalogue sont annoncés « bientôt disponibles » (lib/features.ts).
 */
type Props = {
  limits: { examen: number; revision: number; redaction: number; pdf: number };
  whatsappUrl: string;
  prixPremium: string;
};

const MATIERES = [
  'Introduction au droit', 'Droit constitutionnel', 'Droit des personnes et de la famille', 'Droit civil des obligations',
  'Finances publiques', 'Droit international public', 'Droit administratif', 'Histoire des institutions', 'Relations internationales',
];

const SITUATIONS = [
  { t: 'Ton cours fait 300 pages', d: 'Tu le relis, tu surlignes tout, et la veille de l’examen rien ne ressort.' },
  { t: 'Tu ne sais pas si tu es prêt', d: 'Personne ne t’interroge avant le jour J. Tu découvres tes lacunes sur la copie.' },
  { t: 'La méthode t’échappe', d: 'Cas pratique, commentaire d’arrêt : tu connais la règle, mais la copie revient à 8.' },
  { t: 'Tes PDF sont partout', d: 'WhatsApp, téléchargements, clé USB : retrouver la bonne séquence prend dix minutes.' },
  { t: 'Tes révisions s’essoufflent', d: 'Tu relis ce que tu sais déjà et tu évites ce que tu ne maîtrises pas.' },
  { t: 'Tu ne vois pas tes progrès', d: 'Sans notes intermédiaires, impossible de savoir si ton travail paie.' },
];

const COMPARAISON: { critere: string; pdf: string; ia: string; sjp: string }[] = [
  { critere: 'S’appuie sur ton cours à toi', pdf: 'Oui, mais tu dois tout faire seul', ia: 'Si tu colles le texte à chaque fois', sjp: 'Tes PDF, importés une fois' },
  { critere: 'Organise tes documents par matière', pdf: 'Dans tes dossiers', ia: 'Non', sjp: 'Bibliothèque et matières' },
  { critere: 'T’entraîne au format de l’examen, avec une note', pdf: 'Non', ia: 'Questions libres, sans barème', sjp: 'Examen chronométré, noté sur 20' },
  { critere: 'Corrige ta méthode juridique', pdf: 'Non', ia: 'Réponse générale', sjp: 'Cas pratique, dissertation, commentaire' },
  { critere: 'Suit ta progression dans le temps', pdf: 'Non', ia: 'Non', sjp: 'Notes, thèmes faibles, objectifs' },
];

function Marque({ clair = false }: { clair?: boolean }) {
  return (
    <span className={`${s.marque} ${clair ? s.marqueClaire : ''}`}>
      <span className={s.onglet} aria-hidden />SJP
    </span>
  );
}

export default function Accueil({ limits, whatsappUrl, prixPremium }: Props) {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <div className={s.navIn}>
          <Link href="/" aria-label="SJP, accueil"><Marque /></Link>
          <nav className={s.navLiens} aria-label="Sections">
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#offres">Offres</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className={s.navActions}>
            <Link href="/login" className={s.lienDiscret}>Se connecter</Link>
            <Link href="/inscription" className={s.btnPrincipal}>Commencer<span className={s.horsMobile}>{' '}gratuitement</span></Link>
          </div>
        </div>
      </header>

      <main>
        {/* HÉROS ------------------------------------------------------------------------------ */}
        <div className={s.herosFond}>
        <section className={s.heros}>
          <div className={s.herosTexte}>
            <p className={s.pour}>Pour les étudiants en droit de L1 et L2, au Burkina Faso et en Afrique francophone</p>
            <h1 className={s.titre}>Le droit ne s’apprend pas seulement. Il se comprend, se pratique et se maîtrise.</h1>
            <p className={s.chapo}>SJP accompagne les étudiants en droit dans leurs études grâce à des outils intelligents pour organiser leurs documents, s’entraîner aux examens, améliorer leurs rédactions et suivre leur progression.</p>
            <div className={s.ctas}>
              <Link href="/inscription" className={s.btnPrincipal}>Commencer gratuitement</Link>
              <a href="#en-action" className={s.btnSecondaire}>Découvrir la plateforme</a>
            </div>
            <p className={s.rassure}>Inscription gratuite en une minute, avec ton email ou ton compte Google.</p>
          </div>

          <div className={s.composition} aria-label="Aperçu de l’application SJP">
            <div className={s.tableau}>
              <div className={s.fenetreBarre} aria-hidden><span /><span /><span /><em>tuina-ai.vercel.app/app/dashboard</em></div>
              <div className={s.tableauCorps}>
                <aside className={s.tbMenu} aria-hidden>
                  <b>SJP</b>
                  {['Accueil', 'Révisions', 'Examens', 'Rédaction', 'Mes matières', 'Mes documents', 'Progression'].map((m, i) => <span key={m} data-actif={i === 0 || undefined}>{m}</span>)}
                </aside>
                <div className={s.tbContenu}>
                  <p className={s.tbBonjour}>Bonjour Aïcha</p>
                  <p className={s.tbSous}>Ton prochain examen : droit de la famille</p>
                  <div className={s.tbChiffres}>
                    <div><b>14,5</b><small>dernière note</small></div>
                    <div><b>6</b><small>documents</small></div>
                    <div><b>3</b><small>copies corrigées</small></div>
                  </div>
                  <p className={s.tbRubrique}>Mes matières</p>
                  {[['Droit des personnes et de la famille', 72], ['Finances publiques', 48], ['Droit international public', 30]].map(([m, p]) => (
                    <div key={m as string} className={s.tbMatiere}><span>{m}</span><i><em style={{ width: `${p}%` }} /></i></div>
                  ))}
                </div>
              </div>
            </div>
            <div className={`${s.piece} ${s.pieceNote}`}>
              <small>Examen · Effets du mariage</small>
              <b>15<span>/20</span></b>
              <small>2 thèmes à retravailler</small>
            </div>
            <div className={`${s.piece} ${s.pieceCopie}`}>
              <small>Commentaire d’arrêt · correction</small>
              <p>« Ta problématique reste descriptive : pose une question. »</p>
            </div>
          </div>
        </section>
        </div>

        {/* MATIÈRES ---------------------------------------------------------------------------- */}
        <section className={s.matieres} aria-label="Matières travaillées sur SJP">
          <p>Les étudiants y travaillent déjà</p>
          <div className={s.defile}><div className={s.defileRail}>{[...MATIERES, ...MATIERES].map((m, i) => <span key={i} aria-hidden={i >= MATIERES.length || undefined}>{m}</span>)}</div></div>
        </section>

        {/* SITUATIONS -------------------------------------------------------------------------- */}
        <section className={s.section}>
          <div className={s.entete}>
            <h2 className={s.h2}>Ces situations te parlent ?</h2>
            <p className={s.intro}>Le droit est exigeant. Le plus dur n’est pas toujours la matière : c’est de savoir comment la travailler.</p>
          </div>
          <ul className={s.situations}>
            {SITUATIONS.map((x) => (
              <li key={x.t}><b>{x.t}</b><span>{x.d}</span></li>
            ))}
          </ul>
        </section>

        {/* EN ACTION ---------------------------------------------------------------------------- */}
        <section id="en-action" className={`${s.section} ${s.sectionCiel}`}>
          <div className={s.entete}>
            <h2 className={s.h2}>SJP en action</h2>
            <p className={s.intro}>De ton PDF à ta note, en quatre étapes.</p>
          </div>
          <DemoEtapes />
        </section>

        {/* FONCTIONNALITÉS --------------------------------------------------------------------- */}
        <section id="fonctionnalites" className={s.section}>
          <div className={s.entete}>
            <h2 className={s.h2}>Tout ce qu’il te faut pour travailler ton droit</h2>
            <p className={s.intro}>Chaque outil part de tes propres cours.</p>
          </div>

          <article className={s.fonction}>
            <div className={s.fonctionTexte}>
              <h3 className={s.h3}>Bibliothèque et matières</h3>
              <p>Importe tes cours en PDF, range-les par matière et retrouve chaque séquence en deux secondes, sur ton téléphone comme sur ordinateur.</p>
              <ul className={s.points}><li>Import de PDF, lecture intégrée</li><li>Matières et cours organisés</li><li>Documents privés : toi seul y as accès</li></ul>
              <p className={s.formule}><b>Gratuit</b> : ta bibliothèque pour importer tes cours, jusqu’à {limits.pdf} PDF. <b>Premium</b> : PDF sans limite et rangement par matière.</p>
            </div>
            <div className={s.maquette}>
              <p className={s.mqTitre}>Mes documents</p>
              {[['Séquence 3, les effets du mariage', 'Droit de la famille', '372 Ko'], ['Séquence 5, la dissolution du mariage', 'Droit de la famille', '674 Ko'], ['Support de cours 1 — FP S3', 'Finances publiques', '276 Ko'], ['Séquence 1 — sources du droit', 'Droit international public', '259 Ko']].map(([n, m, t]) => (
                <div key={n} className={s.docLigne}><span className={s.docPdf} aria-hidden>PDF</span><span><b>{n}</b><small>{m} · {t}</small></span><em className={s.lienMq}>Lire</em></div>
              ))}
            </div>
          </article>

          <article className={`${s.fonction} ${s.fonctionInverse}`}>
            <div className={s.fonctionTexte}>
              <h3 className={s.h3}>Rédaction juridique</h3>
              <p>Entraîne-toi sur les trois exercices de l’examen. SJP te propose des sujets tirés de ton cours, puis corrige ta copie : droit, raisonnement, méthode et formulation.</p>
              <ul className={s.points}><li>Cas pratique</li><li>Dissertation</li><li>Commentaire d’arrêt</li></ul>
              <p className={s.formule}><b>Gratuit</b> : {limits.redaction} corrections par jour. <b>Premium</b> : corrections sans limite.</p>
            </div>
            <div className={s.maquette}>
              <div className={s.onglets} aria-hidden><span data-actif>Cas pratiques</span><span>Dissertations</span><span>Commentaires d’arrêt</span></div>
              <p className={s.sujet}><b>Sujet.</b> Pendant un voyage de Moussa, son épouse Awa vend seule la maison où vit la famille. Moussa conteste la vente. Qu’en pensez-vous ?</p>
              <p className={s.copie}>Le logement de la famille fait l’objet d’une protection particulière. <mark>Aucun des époux ne peut en disposer seul</mark>, même s’il en est propriétaire…</p>
              <div className={s.correction}>
                <span className={s.note}>13,5<small>/20</small></span>
                <ul>
                  <li><b>Droit</b> La règle est exacte et bien citée.</li>
                  <li><b>Raisonnement</b> Il manque la sanction : la nullité de la vente.</li>
                  <li><b>Méthode</b> Annonce ton plan avant de l’appliquer.</li>
                </ul>
              </div>
            </div>
          </article>

          <article className={s.fonction}>
            <div className={s.fonctionTexte}>
              <h3 className={s.h3}>Examens tirés de ton cours</h3>
              <p>Choisis une matière et un document : SJP en tire un examen chronométré. Tu réponds, tu remets, tu obtiens ta note sur 20, la correction de chaque question et tes thèmes à retravailler.</p>
              <ul className={s.points}><li>QCM, vrai ou faux, textes à trous, associations</li><li>Mises en situation avec réponse rédigée</li><li>Correction expliquée, analyse par thème</li></ul>
            </div>
            <div className={s.maquette}>
              <p className={s.mqTitre}>Examen · Finances publiques <span className={s.chrono}>21:05</span></p>
              <p className={s.question}>Complète : le principe d’ <u>annualité</u> impose que le budget soit voté pour ____ an.</p>
              <div className={s.trou}>une</div>
              <p className={s.question}>Mise en situation. Le ministre engage une dépense non prévue par la loi de finances. Que dis-tu ?</p>
              <div className={s.redige}>Le principe de spécialité des crédits interdit…</div>
            </div>
          </article>

          <article className={`${s.fonction} ${s.fonctionInverse}`}>
            <div className={s.fonctionTexte}>
              <h3 className={s.h3}>Révisions</h3>
              <p>Des cartes de révision tirées de ton cours. Tu dis si tu savais : les cartes difficiles reviennent plus souvent, celles que tu maîtrises s’espacent.</p>
              <ul className={s.points}><li>Cartes question / réponse</li><li>Répétition espacée</li><li>Séances courtes, faites pour le téléphone</li></ul>
            </div>
            <div className={`${s.maquette} ${s.maquetteCartes}`}>
              <div className={s.carteDos} aria-hidden />
              <div className={s.carte}>
                <small>Droit des personnes et de la famille</small>
                <p>Quelles sont les conditions de fond du mariage ?</p>
                <div className={s.carteActions} aria-hidden><span>Je ne savais pas</span><span>Difficile</span><span data-ok>Je savais</span></div>
              </div>
            </div>
          </article>

          <article className={s.fonction}>
            <div className={s.fonctionTexte}>
              <h3 className={s.h3}>Progression et objectifs</h3>
              <p>Tes notes d’examen dans le temps, les thèmes que tu maîtrises et ceux à revoir, et des objectifs que tu fixes toi-même.</p>
              <ul className={s.points}><li>Évolution de tes notes</li><li>Maîtrise par thème</li><li>Objectifs personnels</li></ul>
            </div>
            <div className={s.maquette}>
              <p className={s.mqTitre}>Progression</p>
              <div className={s.courbe} aria-hidden>{[8.5, 10, 11.5, 11, 13.5, 15].map((n, i) => <span key={i} style={{ height: `${n * 4.5}%` }}><em>{String(n).replace('.', ',')}</em></span>)}</div>
              <div className={s.objectif}><span>Objectif : 4 examens cette semaine</span><i><em style={{ width: '75%' }} /></i><b>3 / 4</b></div>
            </div>
          </article>

          <aside className={s.bientot}>
            <div><h3 className={s.h3}>Étude guidée</h3><p>Ton cours expliqué leçon par leçon, avec des vérifications corrigées.</p></div>
            <div><h3 className={s.h3}>Catalogue de ton année</h3><p>Les cours de L1 et L2 préparés par SJP, pour les comptes gratuits.</p></div>
            <p className={s.bientotEtat}>Bientôt disponibles</p>
          </aside>
        </section>

        {/* COMPARAISON ------------------------------------------------------------------------- */}
        <section className={`${s.section} ${s.sectionCiel}`}>
          <div className={s.entete}>
            <h2 className={s.h2}>Pourquoi SJP</h2>
            <p className={s.intro}>Tes PDF et les assistants généralistes ont leur utilité. SJP les organise autour de ton examen.</p>
          </div>
          <div className={s.comparaison} role="table" aria-label="Comparaison">
            <div role="row" className={s.cmpEntete}>
              <span role="columnheader" />
              <span role="columnheader">Des PDF dispersés</span>
              <span role="columnheader">Une IA généraliste</span>
              <span role="columnheader" className={s.cmpSjp}>SJP</span>
            </div>
            {COMPARAISON.map((l) => (
              <div role="row" key={l.critere} className={s.cmpLigne}>
                <span role="rowheader">{l.critere}</span>
                <span role="cell" data-col="Des PDF dispersés">{l.pdf}</span>
                <span role="cell" data-col="Une IA généraliste">{l.ia}</span>
                <span role="cell" data-col="SJP" className={s.cmpSjp}>{l.sjp}</span>
              </div>
            ))}
          </div>
        </section>

        {/* OFFRES ------------------------------------------------------------------------------ */}
        <section id="offres" className={s.section}>
          <div className={s.entete}>
            <h2 className={s.h2}>Commence gratuitement, passe au Premium quand tu veux</h2>
          </div>
          <div className={s.offres}>
            <div className={s.offre}>
              <h3 className={s.h3}>Gratuit</h3>
              <p className={s.prix}>0 <span>FCFA</span></p>
              <ul className={s.points}>
                <li>Bibliothèque : importe tes cours, jusqu’à {limits.pdf} PDF</li>
                <li>Rédaction : {limits.redaction} corrections par jour</li>
                <li>Examens : {limits.examen} par jour</li>
                <li>Séances de révision : {limits.revision} par jour</li>
                <li>Suivi de ta progression</li>
                <li className={s.pointBientot}>Catalogue des cours de ton année : bientôt</li>
              </ul>
              <Link href="/inscription" className={s.btnSecondaire}>Créer mon compte</Link>
            </div>
            <div className={`${s.offre} ${s.offrePremium}`}>
              <h3 className={s.h3}>Premium</h3>
              <p className={s.prix}>{prixPremium} <span>FCFA / 30 jours</span></p>
              <ul className={s.points}>
                <li>Import de PDF sans limite, bibliothèque et matières</li>
                <li>Examens illimités tirés de tes documents</li>
                <li>Rédaction sans limite : cas pratique, dissertation, commentaire</li>
                <li>Révisions sans limite</li>
                <li>Objectifs et progression détaillée</li>
              </ul>
              <a href={whatsappUrl} className={s.btnClair} target="_blank" rel="noopener noreferrer">Passer au Premium sur WhatsApp</a>
              <p className={s.paiement}>Paiement par Mobile Money. Tu reçois un code d’accès à saisir dans « Mon compte ».</p>
            </div>
          </div>
        </section>

        {/* QUESTIONS --------------------------------------------------------------------------- */}
        <section id="questions" className={`${s.section} ${s.sectionEtroite}`}>
          <h2 className={s.h2}>Questions fréquentes</h2>
          <div className={s.faq}>
            {[
              ['SJP remplace-t-il mon cours ?', 'Non. SJP travaille à partir des cours que tu importes : il t’aide à les organiser, à t’entraîner et à mesurer tes progrès. Ton professeur reste ta référence.'],
              ['Les questions d’examen sont-elles fiables ?', 'Elles sont construites à partir de ton document, chacune avec sa réponse justifiée par le cours. SJP n’invente ni article ni jurisprudence absents de ton document.'],
              ['Mes documents sont-ils privés ?', 'Oui. Les PDF que tu importes ne sont lisibles que par ton compte.'],
              ['Que comprend la version gratuite ?', `Ta bibliothèque pour importer tes cours (${limits.pdf} PDF au maximum), la Rédaction avec ${limits.redaction} corrections par jour, ${limits.examen} examens et ${limits.revision} séances de révision par jour, et le suivi de ta progression. Le Premium lève toutes ces limites et ajoute le rangement par matière et les objectifs.`],
              ['Comment passer au Premium ?', `Écris-nous sur WhatsApp, règle ${prixPremium} FCFA par Mobile Money, puis saisis le code reçu dans « Mon compte ». Ton Premium dure 30 jours.`],
              ['Pour quels étudiants ?', 'Les étudiants en sciences juridiques et politiques de L1 et L2, au Burkina Faso et dans les universités d’Afrique francophone.'],
              ['Et l’Étude guidée ?', 'Elle revient bientôt. Tout ce que tu y as déjà commencé est conservé.'],
            ].map(([q, r]) => (
              <details key={q} className={s.question2}><summary>{q}</summary><p>{r}</p></details>
            ))}
          </div>
        </section>

        {/* APPEL FINAL ------------------------------------------------------------------------- */}
        <section className={s.final}>
          <h2 className={s.h2Clair}>Ton prochain examen se prépare aujourd’hui</h2>
          <p>Crée ton compte gratuit et importe ton premier cours.</p>
          <Link href="/inscription" className={s.btnClair}>Commencer gratuitement</Link>
        </section>
      </main>

      <footer className={s.pied}>
        <div className={s.piedIn}>
          <div><Marque clair /><p>Sciences juridiques et politiques. La plateforme de travail des étudiants en droit.</p></div>
          <nav aria-label="Liens du pied de page">
            <Link href="/inscription">Créer un compte</Link>
            <Link href="/login">Se connecter</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/conditions">Conditions d’utilisation</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
