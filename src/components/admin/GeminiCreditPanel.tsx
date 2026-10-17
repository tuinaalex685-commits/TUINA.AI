"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { saveGeminiSettings } from '@/app/actions/admin';
import styles from './admin.module.css';

export interface CreditView {
  credit: number | null;
  rechargeAt: string | null;
  dailyUsd: number;
  alertPct: number;
  consomme: number | null;
  restant: number | null;
  pct: number | null;
  parJour7: number;
  joursRestants: number | null;
  aujourdHui: number;
}

const usd = (v: number) => `${v.toFixed(2).replace('.', ',')} $`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Crédit Gemini : l'admin saisit ce qu'il vient de charger sur Google AI Studio ; SJP estime
 * la consommation depuis, le reste et le nombre de jours avant d'avoir à recharger.
 */
export function GeminiCreditPanel({ v }: { v: CreditView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(v.credit === null);
  const [credit, setCredit] = useState(v.credit ? String(v.credit) : '');
  const [date, setDate] = useState(v.rechargeAt ? v.rechargeAt.slice(0, 10) : today());
  const [daily, setDaily] = useState(String(v.dailyUsd));
  const [alert, setAlert] = useState(String(v.alertPct));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Recharge du jour : on prend l'heure actuelle (seule la consommation à partir de maintenant compte).
    const at = date === today() ? new Date().toISOString() : new Date(`${date}T00:00:00Z`).toISOString();
    const res = await saveGeminiSettings({ credit_usd: Number(credit.replace(',', '.')), recharge_at: at, daily_usd: Number(daily.replace(',', '.')), alert_pct: Number(alert) });
    setBusy(false);
    if ('error' in res && res.error) { toast.error(res.error); return; }
    toast.success('Crédit enregistré');
    setEditing(false);
    router.refresh();
  };

  const alerte = v.pct !== null && v.pct >= v.alertPct;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>Crédit Gemini</h2>
        {!editing && <button type="button" className={styles.panelLink} onClick={() => setEditing(true)}>J’ai rechargé</button>}
      </div>

      {v.credit !== null && v.consomme !== null && v.restant !== null && (
        <>
          <p className={styles.creditBig}>
            <span className={`tabular ${alerte ? styles.warn : ''}`}>{usd(v.restant)}</span>
            <span className={styles.muted}> restants sur {usd(v.credit)} (estimation)</span>
          </p>
          <div className={`${styles.budget} ${alerte ? styles.budgetHigh : ''}`} role="progressbar" aria-valuenow={Math.round(v.pct ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label="Crédit Gemini consommé">
            <span style={{ width: `${v.pct ?? 0}%` }} />
          </div>
          <ul className={styles.creditFacts}>
            <li>Consommé depuis la recharge du {new Date(v.rechargeAt!).toLocaleDateString('fr-FR')} : <strong className="tabular">{usd(v.consomme)}</strong></li>
            <li>Aujourd’hui : <strong className="tabular">{usd(v.aujourdHui)}</strong>{v.dailyUsd > 0 ? ` (plafond ${usd(v.dailyUsd)})` : ' (aucun plafond)'}</li>
            <li>Rythme moyen sur 7 jours : <strong className="tabular">{usd(v.parJour7)}</strong> par jour</li>
            <li>
              {v.joursRestants !== null
                ? <>Au rythme actuel, il reste environ <strong className="tabular">{v.joursRestants < 1 ? 'moins d’un jour' : `${Math.floor(v.joursRestants)} jour${v.joursRestants >= 2 ? 's' : ''}`}</strong>.</>
                : 'Pas encore assez d’activité pour estimer une durée.'}
            </li>
          </ul>
          {alerte && <p className={styles.alertText}>Plus de {v.alertPct} % du crédit est consommé : pense à recharger sur Google AI Studio, puis clique sur « J’ai rechargé ».</p>}
          <p className={styles.muted} style={{ marginTop: 'var(--s-3)' }}>Estimation calculée à partir des tokens mesurés par SJP. Le solde affiché par Google AI Studio fait foi.</p>
        </>
      )}

      {editing && (
        <form onSubmit={save} className={styles.creditForm}>
          <label>Crédit chargé (en $)<input inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Ex. : 100" required /></label>
          <label>Date de la recharge<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>Plafond par jour (en $, 0 = aucun)<input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} required /></label>
          <label>Alerte à (% du crédit)<input inputMode="numeric" value={alert} onChange={(e) => setAlert(e.target.value)} required /></label>
          <div className={styles.creditActions}>
            {v.credit !== null && <button type="button" className={styles.panelLink} onClick={() => setEditing(false)}>Annuler</button>}
            <button type="submit" className={styles.creditSave} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
          <p className={styles.muted}>Quand l’estimation atteint le crédit chargé, SJP suspend les générations avec un message clair aux étudiants, au lieu d’erreurs incompréhensibles.</p>
        </form>
      )}
    </section>
  );
}
