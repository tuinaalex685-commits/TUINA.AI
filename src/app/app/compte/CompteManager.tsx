"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { activateAccessCode, changeMyPassword } from '@/app/actions/auth';
import { setMyNiveau } from '@/app/actions/profile';
import { NIVEAUX } from '@/lib/profileShared';

interface Props {
  email: string;
  premium: boolean;
  premiumUntil: string | null;
  askPasswordChange: boolean;
  niveau: string | null;
}

export default function CompteManager({ email, premium, premiumUntil, askPasswordChange, niveau }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [year, setYear] = useState<string | null>(niveau);
  const [yearSaving, setYearSaving] = useState(false);

  // Passage en année supérieure (ou correction) : seul le catalogue gratuit change ;
  // l'historique, la progression et les documents sont conservés.
  const changeYear = async (code: string) => {
    if (code === year) return;
    const previous = year;
    setYear(code);
    setYearSaving(true);
    const res = await setMyNiveau(code);
    setYearSaving(false);
    if ('error' in res && res.error) {
      setYear(previous);
      toast.error(res.error);
      return;
    }
    toast.success(`Année enregistrée : ${NIVEAUX.find((n) => n.code === code)?.court}`);
    router.refresh();
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeLoading(true);
    const res = await activateAccessCode(code);
    setCodeLoading(false);
    if ('error' in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Ton accès Premium est activé.');
    setCode('');
    router.refresh();
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setPwdLoading(true);
    const res = await changeMyPassword(current, password);
    setPwdLoading(false);
    if ('error' in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Mot de passe enregistré. Utilise-le pour tes prochaines connexions.');
    setCurrent('');
    setPassword('');
    setConfirm('');
    if (askPasswordChange) router.push('/app/dashboard');
  };

  const until = premiumUntil
    ? new Date(premiumUntil).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)', maxWidth: 560, padding: 'var(--spacing-large) 0' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Mon compte</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)' }}>{email}</p>
      </header>

      {askPasswordChange && (
        <Card>
          <p style={{ margin: 0, color: 'var(--color-text-main)', lineHeight: 1.6 }}>
            <strong>Choisis ton mot de passe personnel.</strong> Jusqu’ici, tu te connectais avec ton code d’accès.
            Pour protéger ton compte, remplace-le par un mot de passe que toi seul connais.
          </p>
        </Card>
      )}

      <Card>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--color-text-main)' }}>Mon abonnement</h2>
        {premium ? (
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Tu es en <strong style={{ color: 'var(--color-text-main)' }}>Premium</strong>
            {until ? <> jusqu’au <strong style={{ color: 'var(--color-text-main)' }}>{until}</strong>.</> : '.'}
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Tu utilises la version gratuite. Saisis le code d’accès reçu après ton paiement pour passer en Premium pendant un mois.
            </p>
            <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input
                label="Code d'accès"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <Button type="submit" disabled={codeLoading || !code.trim()}>
                {codeLoading ? 'Vérification…' : 'Activer mon code'}
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--color-text-main)' }}>Mon année</h2>
        <p style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Le catalogue gratuit te propose les cours de ton année. Tu passes en année supérieure ? Change-la ici : ton historique et ta progression sont conservés.
        </p>
        <div role="group" aria-label="Mon année" style={{ display: 'inline-flex', padding: 4, borderRadius: 12, background: 'var(--paper-3)' }}>
          {NIVEAUX.map((n) => (
            <button
              key={n.code}
              type="button"
              onClick={() => changeYear(n.code)}
              aria-pressed={year === n.code}
              disabled={yearSaving}
              style={{
                minWidth: 72, minHeight: 42, padding: '0 16px', borderRadius: 9, fontWeight: 700,
                background: year === n.code ? 'var(--paper)' : 'transparent',
                color: year === n.code ? 'var(--action)' : 'var(--ink-2)',
                boxShadow: year === n.code ? '0 1px 3px rgba(20, 33, 61, 0.14)' : 'none',
              }}
            >
              {n.court}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', color: 'var(--color-text-main)' }}>Mot de passe</h2>
        <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label={askPasswordChange ? "Mot de passe actuel (ton code d'accès)" : 'Mot de passe actuel'}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label="Nouveau mot de passe (8 caractères minimum)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Input
            label="Confirme le mot de passe"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Button type="submit" disabled={pwdLoading}>
            {pwdLoading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
