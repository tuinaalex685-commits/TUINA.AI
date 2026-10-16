"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion, useScroll, useSpring, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, BookOpenText, Layers, GraduationCap, PenLine, FileText, LineChart,
  Check, Plus, Minus, Timer,
} from 'lucide-react';
import { HeroDemo } from './HeroDemo';
import styles from './landing.module.css';

export interface LandingProps {
  limits: { examen: number; revision: number; cas_pratique: number };
  whatsappUrl: string;
}

const EASE = [0.2, 0.8, 0.2, 1] as const;

/* ======================================================================== */

export default function Landing({ limits, whatsappUrl }: LandingProps) {
  return (
    <div className={styles.page}>
      <Nav />
      <Hero />
      <Subjects />
      <Pains />
      <HowItWorks />
      <Features />
      <Plans limits={limits} whatsappUrl={whatsappUrl} />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* En-tête : transparent sur le hero, blanc dès qu'on défile.                */

function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`${styles.nav} ${solid ? styles.navSolid : ''}`}>
      <div className={styles.navInner}>
        <Link href="/" className={styles.logo} aria-label="SJP, accueil">SJP</Link>
        <nav className={styles.navLinks} aria-label="Sections">
          <a href="#fonctionnement">Fonctionnement</a>
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#offres">Offres</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className={styles.navActions}>
          <Link href="/login" className={styles.navLogin}>Se connecter</Link>
          <Link href="/inscription" className={styles.navCta}>Commencer</Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------ */
/* Hero : la promesse à gauche, le produit qui travaille à droite.          */

function Hero() {
  const reduce = useReducedMotion();
  const item = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: EASE },
  });

  return (
    <section className={styles.hero}>
      <div className={styles.heroGrid} aria-hidden />
      <div className={styles.heroGlow} aria-hidden />
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <motion.h1 className={styles.heroTitle} {...item(0.05)}>
            Ton cours de droit, enfin clair.
          </motion.h1>
          <motion.p className={styles.heroLead} {...item(0.15)}>
            SJP transforme ton cours en étude guidée, en cartes de révision et en examens corrigés.
            En français simple, avec le mot juridique exact.
          </motion.p>
          <motion.div className={styles.heroCtas} {...item(0.25)}>
            <Link href="/inscription" className={styles.ctaLight}>
              Commencer gratuitement <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/login" className={styles.ctaGhostLight}>J’ai déjà un compte</Link>
          </motion.div>
          <motion.div className={styles.levelPick} {...item(0.35)}>
            <span>Je suis en</span>
            <Link href="/inscription?niveau=l1" className={styles.levelChip}>L1</Link>
            <Link href="/inscription?niveau=l2" className={styles.levelChip}>L2</Link>
            <span className={styles.levelHint}>Le catalogue gratuit s’adapte à ton année.</span>
          </motion.div>
        </div>

        <motion.div
          className={styles.heroVisual}
          initial={reduce ? false : { opacity: 0, y: 30, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
        >
          <HeroDemo />
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Bandeau des matières : défilement continu, discret.                      */

const SUBJECTS = [
  'Introduction au droit', 'Droit constitutionnel', 'Droit civil', 'Droit des obligations',
  'Institutions administratives', 'Histoire du droit', 'Relations internationales',
  'Droit pénal', 'Droit administratif', 'Science politique',
];

function Subjects() {
  const reduce = useReducedMotion();
  const row = [...SUBJECTS, ...SUBJECTS];
  return (
    <section className={styles.subjects} aria-label="Matières">
      <p className={styles.subjectsLabel}>Fonctionne avec tes cours de</p>
      <div className={styles.marquee}>
        <div className={`${styles.marqueeTrack} ${reduce ? styles.marqueeStill : ''}`}>
          {row.map((s, i) => (
            <span key={i} className={styles.subject} aria-hidden={i >= SUBJECTS.length}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Les difficultés réelles des étudiants en droit.                           */

const PAINS = [
  { title: 'Des centaines de pages', text: 'Le polycopié arrive d’un bloc. Savoir ce qui compte vraiment prend des semaines.' },
  { title: 'Un vocabulaire qui intimide', text: 'Convention, nullité, cause, consentement… Chaque mot a un sens précis qu’il faut maîtriser.' },
  { title: 'Des examens qui piègent', text: 'Connaître la règle ne suffit pas : il faut la distinguer d’une notion voisine et l’appliquer à un cas.' },
];

function Pains() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <h2 className={styles.h2}>Le droit est exigeant. Le réviser ne devrait pas être un combat.</h2>
        </Reveal>
        <div className={styles.pains}>
          {PAINS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08} className={styles.pain}>
              <span className={styles.painIndex}>{i + 1}</span>
              <h3 className={styles.painTitle}>{p.title}</h3>
              <p className={styles.painText}>{p.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Fonctionnement : 4 étapes, la ligne se remplit au défilement.            */

const STEPS = [
  { icon: FileText, title: 'Choisis ou importe ton cours', text: 'Un cours du catalogue gratuit, ou ton propre PDF avec Premium. Tout part de ton support.' },
  { icon: BookOpenText, title: 'Comprends notion par notion', text: 'Chaque notion est expliquée simplement, puis traduite en vocabulaire juridique. Une question et un cas pratique vérifient que tu as compris.' },
  { icon: Layers, title: 'Retiens avec les révisions', text: 'Des cartes reviennent juste avant que tu oublies. Quelques minutes par jour suffisent.' },
  { icon: GraduationCap, title: 'Vérifie-toi en examen', text: 'Un examen chronométré, une note sur 20, et la liste précise des notions à retravailler.' },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  return (
    <section className={`${styles.section} ${styles.sectionPaper}`} id="fonctionnement">
      <div className={styles.container}>
        <Reveal>
          <h2 className={styles.h2}>Comment SJP te fait progresser</h2>
          <p className={styles.sectionLead}>Le même chemin pour chaque cours, du premier contact à la note.</p>
        </Reveal>
        <div ref={ref} className={styles.steps}>
          <div className={styles.stepsRail} aria-hidden>
            <motion.span className={styles.stepsRailFill} style={{ scaleY: fill }} />
          </div>
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={0.05} className={styles.step}>
              <span className={styles.stepIcon}><s.icon size={20} aria-hidden /></span>
              <div>
                <p className={styles.stepNum}>Étape {i + 1}</p>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepText}>{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Fonctionnalités : grille de cases vivantes sur fond bleu nuit.           */

function Features() {
  return (
    <section className={`${styles.section} ${styles.sectionNight}`} id="fonctionnalites">
      <div className={styles.container}>
        <Reveal>
          <h2 className={`${styles.h2} ${styles.onNight}`}>Tout ce qu’il faut pour réussir ton semestre</h2>
          <p className={`${styles.sectionLead} ${styles.onNightMuted}`}>Chaque outil travaille sur le même cours : ce que tu étudies devient ce que tu révises.</p>
        </Reveal>

        <div className={styles.bento}>
          <Reveal className={`${styles.tile} ${styles.tileWide}`}>
            <TileHead icon={BookOpenText} title="Études guidées" text="Ton cours découpé en notions, expliqué pas à pas, avec question et cas pratique corrigé." />
            <div className={styles.tileVisual}>
              <div className={styles.guideLine}><span className={styles.guideDot} /> Explication simple</div>
              <div className={styles.guideLine}><span className={styles.guideDot} /> Le terme juridique exact</div>
              <div className={`${styles.guideLine} ${styles.guideLineOn}`}><span className={styles.guideDot} /> Cas pratique : à toi</div>
            </div>
          </Reveal>

          <Reveal className={styles.tile} delay={0.06}>
            <TileHead icon={Layers} title="Révisions espacées" text="Touche la carte pour la retourner." />
            <FlipCard />
          </Reveal>

          <Reveal className={styles.tile} delay={0.1}>
            <TileHead icon={GraduationCap} title="Examens chronométrés" text="Une note sur 20, corrigée sur-le-champ." />
            <ExamScore />
          </Reveal>

          <Reveal className={styles.tile} delay={0.06}>
            <TileHead icon={PenLine} title="Rédaction corrigée" text="Cas pratique, dissertation, commentaire d’arrêt." badge="Premium" />
            <div className={styles.copy}>
              <p>La responsabilité du gardien suppose <span className={styles.redMark}>un fait de la chose</span>…</p>
              <p className={styles.redNote}>Précise le rôle actif de la chose.</p>
            </div>
          </Reveal>

          <Reveal className={styles.tile} delay={0.1}>
            <TileHead icon={FileText} title="Tes PDF, lisibles partout" text="Lecteur intégré, même sur un téléphone modeste." badge="Premium" />
            <div className={styles.pagesStack} aria-hidden>
              <span /><span /><span />
            </div>
          </Reveal>

          <Reveal className={`${styles.tile} ${styles.tileFull}`} delay={0.06}>
            <TileHead icon={LineChart} title="Progression par notion" text="Tu vois ce que tu maîtrises et ce qu’il reste à revoir." />
            <ProgressBars />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function TileHead({ icon: Icon, title, text, badge }: { icon: React.ElementType; title: string; text: string; badge?: string }) {
  return (
    <div className={styles.tileHead}>
      <span className={styles.tileIcon}><Icon size={18} aria-hidden /></span>
      <div>
        <h3 className={styles.tileTitle}>{title}{badge && <span className={styles.tileBadge}>{badge}</span>}</h3>
        <p className={styles.tileText}>{text}</p>
      </div>
    </div>
  );
}

function FlipCard() {
  const [flipped, setFlipped] = useState(false);
  return (
    <button type="button" className={styles.flip} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} aria-label="Retourner la carte">
      <span className={`${styles.flipInner} ${flipped ? styles.flipped : ''}`}>
        <span className={styles.flipFace}>Qu’est-ce qu’un vice du consentement ?</span>
        <span className={`${styles.flipFace} ${styles.flipBack}`}>Un défaut qui altère la volonté de contracter : l’erreur, le dol ou la violence.</span>
      </span>
    </button>
  );
}

function ExamScore() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [score, setScore] = useState(reduce ? 14.5 : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setScore(Math.round(14.5 * (1 - Math.pow(1 - p, 3)) * 2) / 2);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce]);

  return (
    <div ref={ref} className={styles.exam}>
      <span className={styles.examTimer}><Timer size={14} aria-hidden /> 18:42</span>
      <p className={`${styles.examScore} tabular`}>{score.toFixed(1).replace('.', ',')}<span>/20</span></p>
      <p className={styles.examHint}>À revoir : les vices du consentement</p>
    </div>
  );
}

function ProgressBars() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const rows = [
    { n: 'Sources du droit', v: 92 },
    { n: 'Formation du contrat', v: 74 },
    { n: 'Responsabilité civile', v: 41 },
  ];
  return (
    <div ref={ref} className={styles.bars}>
      {rows.map((r, i) => (
        <div key={r.n} className={styles.barRow}>
          <span className={styles.barLabel}>{r.n}</span>
          <span className={styles.barTrack}>
            <motion.span
              className={styles.barFill}
              initial={{ width: 0 }}
              animate={{ width: inView ? `${r.v}%` : 0 }}
              transition={{ duration: 1, delay: i * 0.12, ease: EASE }}
            />
          </span>
          <span className={`${styles.barValue} tabular`}>{r.v} %</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Offres : les limites réelles, lues dans le code des quotas.               */

function Plans({ limits, whatsappUrl }: LandingProps) {
  const free = [
    'Les cours du catalogue de ton année, prêts à travailler',
    'Études guidées sur ces cours',
    `${limits.revision} sessions de révision par jour`,
    `${limits.examen} examens par jour`,
    `${limits.cas_pratique} corrections de cas pratique par jour`,
  ];
  const premium = [
    'Tes propres cours en PDF, analysés pour toi',
    'Révisions et examens sans limite quotidienne',
    'Examens adaptatifs, centrés sur tes points faibles',
    'Rédaction corrigée : 3 copies par jour',
    'Matières, objectifs et lecteur PDF intégré',
    'Sans publicité',
  ];
  return (
    <section className={styles.section} id="offres">
      <div className={styles.container}>
        <Reveal>
          <h2 className={styles.h2}>Commence gratuitement. Passe Premium quand tu veux.</h2>
        </Reveal>
        <div className={styles.plans}>
          <Reveal className={styles.plan}>
            <h3 className={styles.planName}>Gratuit</h3>
            <p className={styles.planPrice}>0 <span>FCFA</span></p>
            <p className={styles.planText}>Pour découvrir SJP sur les cours du catalogue.</p>
            <ul className={styles.planList}>
              {free.map((f) => <li key={f}><Check size={16} aria-hidden /> {f}</li>)}
            </ul>
            <Link href="/inscription" className={styles.planCtaSecondary}>Créer mon compte gratuit</Link>
          </Reveal>

          <Reveal className={`${styles.plan} ${styles.planPremium}`} delay={0.08}>
            <h3 className={styles.planName}>Premium</h3>
            <p className={styles.planPrice}>2 500 <span>FCFA / 30 jours</span></p>
            <p className={styles.planText}>Pour travailler sur tes propres cours, sans limite.</p>
            <ul className={styles.planList}>
              {premium.map((f) => <li key={f}><Check size={16} aria-hidden /> {f}</li>)}
            </ul>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.planCta}>
              Passer Premium via WhatsApp
            </a>
            <p className={styles.planHow}>Paiement par Mobile Money. Tu reçois un code d’accès, que tu actives dans « Mon compte ».</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Questions fréquentes.                                                     */

const FAQ = [
  { q: 'SJP remplace-t-il mon cours ?', a: 'Non. SJP part de ton cours et t’aide à le comprendre, à le retenir et à t’entraîner dessus. Ton enseignant et ton polycopié restent la référence.' },
  { q: 'Comment passer Premium ?', a: 'Écris-nous sur WhatsApp et règle par Mobile Money. Tu reçois un code d’accès : saisis-le dans « Mon compte » et ton Premium s’active immédiatement.' },
  { q: 'Que se passe-t-il après 30 jours ?', a: 'Ton compte repasse en version gratuite. Tes documents, ta progression et ton historique sont conservés. Un nouveau code réactive Premium pour 30 jours.' },
  { q: 'Mes documents sont-ils privés ?', a: 'Oui. Tes PDF sont stockés dans un espace privé : seul ton compte peut les ouvrir, par des liens temporaires.' },
  { q: 'L’IA peut-elle se tromper ?', a: 'Oui, comme tout outil. SJP s’appuie sur ton cours et signale ce qui en sort. En cas de doute sur une règle, ton cours et ton enseignant font foi.' },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className={`${styles.section} ${styles.sectionPaper}`} id="questions">
      <div className={`${styles.container} ${styles.faqWrap}`}>
        <Reveal><h2 className={styles.h2}>Questions fréquentes</h2></Reveal>
        <div className={styles.faq}>
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={styles.faqItem}>
                <button type="button" className={styles.faqQ} onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                  {f.q}
                  {isOpen ? <Minus size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE }}
                      className={styles.faqA}
                    >
                      <p>{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className={styles.final}>
      <div className={styles.heroGrid} aria-hidden />
      <Reveal className={styles.finalInner}>
        <h2 className={`${styles.h2} ${styles.onNight}`}>Ton prochain partiel commence ici.</h2>
        <p className={styles.onNightMuted}>Crée ton compte en une minute, sans carte bancaire.</p>
        <Link href="/inscription" className={styles.ctaLight}>Commencer gratuitement <ArrowRight size={18} aria-hidden /></Link>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span className={styles.logoDark}>SJP</span>
        <p>Sciences juridiques et politiques · Burkina Faso</p>
        <a href="tel:+22657138126">+226 57 13 81 26</a>
        <p className={styles.copyright}>© {new Date().getFullYear()} SJP</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------------ */
/* Apparition au défilement. Observateur maison (plus fiable que whileInView sur mobile) :
   révèle le bloc dès qu'il entre à l'écran, ou s'il a déjà été dépassé ; affichage immédiat
   si l'utilisateur a demandé à réduire les animations. */

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // « Réduire les animations » : la feuille de style affiche déjà le bloc, rien à observer.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${shown ? styles.revealIn : ''} ${className || ''}`}
      style={shown && delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
