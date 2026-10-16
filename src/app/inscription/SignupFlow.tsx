"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { signUpFree } from '@/app/actions/auth';
import { NIVEAUX, SOURCES, isNiveau } from '@/lib/profileShared';
import styles from './signup.module.css';

type Step = 'source' | 'niveau' | 'offres' | 'compte';
const FULL: Step[] = ['source', 'niveau', 'offres', 'compte'];

const NIVEAU_DESC: Record<string, string> = {
  l1: 'Introduction au droit, institutions, premières méthodes.',
  l2: 'Obligations, droit administratif, approfondissement.',
};

/**
 * Inscription en 4 temps. Les réponses (canal de découverte, niveau) sont enregistrées dans le
 * profil au moment de la création du compte, une seule fois : rien n'est stocké pour un visiteur
 * anonyme qui abandonne en route. L'étape « découverte » peut être passée.
 */
export default function SignupFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const preset = params.get('niveau');

  // Année déjà choisie sur la page d'accueil : on ne la redemande pas.
  const [ORDER] = useState<Step[]>(() => (isNiveau(preset) ? FULL.filter((s) => s !== 'niveau') : FULL));
  const [step, setStep] = useState<Step>('source');
  const [dir, setDir] = useState(1);
  const [source, setSource] = useState<string | null>(null);
  const [niveau, setNiveau] = useState<string | null>(isNiveau(preset) ? preset : null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const index = ORDER.indexOf(step);
  const go = (next: Step) => {
    setDir(ORDER.indexOf(next) > index ? 1 : -1);
    setStep(next);
  };
  const back = () => index > 0 && go(ORDER[index - 1]);

  const niveauCourt = NIVEAUX.find((n) => n.code === niveau)?.court;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const res = await signUpFree(email, password, { niveau, source });
    if (res.error) {
      setMessage(res.error);
      setLoading(false);
    } else if (res.needsConfirmation) {
      setDone(true);
      setLoading(false);
    } else {
      router.push('/app/dashboard');
      router.refresh();
    }
  };

  const slide = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 28 * dir },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -28 * dir },
    transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const },
  };

  if (done) {
    return (
      <div className={styles.flow}>
        <h1 className={styles.title}>Vérifie ta boîte mail</h1>
        <p className={styles.lead}>Un lien de confirmation vient d’être envoyé à <strong>{email}</strong>. Ouvre-le pour activer ton compte.</p>
        <Link href="/login"><Button block>Aller à la connexion</Button></Link>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <div className={styles.top}>
        {index > 0 ? (
          <button type="button" className={styles.back} onClick={back} aria-label="Étape précédente">
            <ArrowLeft size={20} />
          </button>
        ) : <span className={styles.backSpacer} />}
        <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={ORDER.length} aria-valuenow={index + 1} aria-label={`Étape ${index + 1} sur ${ORDER.length}`}>
          <motion.span animate={{ width: `${((index + 1) / ORDER.length) * 100}%` }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }} />
        </div>
        <span className={`${styles.count} tabular`}>{index + 1}/{ORDER.length}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === 'source' && (
          <motion.section key="source" {...slide}>
            <h1 className={styles.title}>Comment as-tu découvert SJP ?</h1>
            <p className={styles.lead}>Ça nous aide à faire connaître SJP à d’autres étudiants.</p>
            <div className={styles.options}>
              {SOURCES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  className={`${styles.option} ${source === s.code ? styles.optionOn : ''}`}
                  onClick={() => { setSource(s.code); go(ORDER[1]); }}
                  aria-pressed={source === s.code}
                >
                  {s.libelle}
                  {source === s.code && <Check size={18} aria-hidden />}
                </button>
              ))}
            </div>
            <button type="button" className={styles.skip} onClick={() => { setSource(null); go(ORDER[1]); }}>Passer cette question</button>
          </motion.section>
        )}

        {step === 'niveau' && (
          <motion.section key="niveau" {...slide}>
            <h1 className={styles.title}>Tu es en quelle année ?</h1>
            <p className={styles.lead}>Le catalogue gratuit te proposera les cours de ton année. Tu pourras changer à tout moment.</p>
            <div className={styles.levels}>
              {NIVEAUX.map((n) => (
                <button
                  key={n.code}
                  type="button"
                  className={`${styles.level} ${niveau === n.code ? styles.levelOn : ''}`}
                  onClick={() => { setNiveau(n.code); go('offres'); }}
                  aria-pressed={niveau === n.code}
                >
                  <span className={styles.levelBig}>{n.court}</span>
                  <span className={styles.levelName}>{n.libelle}</span>
                  <span className={styles.levelDesc}>{NIVEAU_DESC[n.code]}</span>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {step === 'offres' && (
          <motion.section key="offres" {...slide}>
            <h1 className={styles.title}>{niveauCourt ? `Bienvenue en ${niveauCourt} sur SJP` : 'Bienvenue sur SJP'}</h1>
            <p className={styles.lead}>Voici ce que tu pourras faire, dès aujourd’hui ou plus tard.</p>
            <div className={styles.offers}>
              <div className={styles.offer}>
                <p className={styles.offerName}>Gratuit</p>
                <ul>
                  <li>Les cours du catalogue{niveauCourt ? ` de ${niveauCourt}` : ''}</li>
                  <li>Études guidées, révisions et examens sur ces cours</li>
                  <li>Des limites quotidiennes, sans carte bancaire</li>
                </ul>
              </div>
              <div className={`${styles.offer} ${styles.offerPremium}`}>
                <p className={styles.offerName}>Premium <span>2 500 FCFA / 30 jours</span></p>
                <ul>
                  <li>Tes propres cours en PDF</li>
                  <li>Révisions et examens sans limite</li>
                  <li>Rédaction corrigée, examens adaptatifs</li>
                </ul>
              </div>
            </div>
            <Button block onClick={() => go('compte')}>Continuer gratuitement</Button>
            <p className={styles.note}>Tu pourras passer Premium à tout moment depuis ton compte.</p>
          </motion.section>
        )}

        {step === 'compte' && (
          <motion.section key="compte" {...slide}>
            <h1 className={styles.title}>Crée ton compte</h1>
            <p className={styles.lead}>Dernière étape. Ton email sert uniquement à te connecter.</p>
            <form className={styles.form} onSubmit={submit}>
              <Input
                label="Adresse email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.com"
                required
              />
              <Input
                label="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="8 caractères minimum"
                required
              />
              {message && <p className={styles.error} role="alert">{message}</p>}
              <Button type="submit" block disabled={loading}>
                {loading ? 'Création du compte…' : 'Créer mon compte'}
              </Button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <p className={styles.switch}>
        Déjà un compte ? <Link href="/login">Se connecter</Link>
      </p>
    </div>
  );
}
