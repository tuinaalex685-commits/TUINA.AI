"use client";

import React, { useEffect, useState } from 'react';
import { DollarSign, CalendarDays, Zap, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface GeminiCostStats {
  costToday: number;
  costMonth: number;
  countToday: number;
  countMonth: number;
  byFeature: { key: string; label: string; color: string; cost: number; count: number }[];
}

const fmt = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export default function GeminiCostPanel({ stats }: { stats: GeminiCostStats }) {
  // Budget mensuel (US$) saisi par l'admin, persistant localement.
  const [budget, setBudget] = useState<string>('10');
  useEffect(() => {
    const saved = localStorage.getItem('tuina_gemini_budget');
    if (saved) setBudget(saved);
  }, []);
  const onBudget = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBudget(e.target.value);
    localStorage.setItem('tuina_gemini_budget', e.target.value);
  };

  const budgetNum = parseFloat(budget) || 0;
  const pct = budgetNum > 0 ? Math.min(100, (stats.costMonth / budgetNum) * 100) : 0;
  const danger = budgetNum > 0 && stats.costMonth >= budgetNum;
  const warning = budgetNum > 0 && !danger && stats.costMonth >= 0.8 * budgetNum;
  const barColor = danger ? '#FF3232' : warning ? '#FFB400' : '#00C864';

  const maxFeatureCost = Math.max(0.0001, ...stats.byFeature.map((f) => f.cost));

  const statCard = (label: string, value: string, sub: string, icon: React.ReactNode, color: string) => (
    <div style={{
      background: '#ffffff', border: `1px solid ${color}22`, borderRadius: 16, padding: 22,
      boxShadow: `0 4px 20px ${color}0d`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <p style={{ fontSize: 12.5, color, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, margin: 0 }}>{label}</p>
        <div style={{ background: `${color}18`, padding: 8, borderRadius: 12, color }}>{icon}</div>
      </div>
      <h3 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 4px', color: 'var(--color-text-main)', letterSpacing: -1 }}>{value}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, fontWeight: 500 }}>{sub}</p>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: `radial-gradient(circle, ${color}1a 0%, ${color}00 70%)`, borderRadius: '50%' }} />
    </div>
  );

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Consommation IA (Gemini)</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 15 }}>Coût réel des générations, en temps réel. La dédup fait qu'un même PDF n'est facturé qu'une fois.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
        {statCard("Coût aujourd'hui", fmt(stats.costToday), `${stats.countToday} génération${stats.countToday > 1 ? 's' : ''}`, <DollarSign size={20} />, '#00A854')}
        {statCard('Coût ce mois', fmt(stats.costMonth), `${stats.countMonth} génération${stats.countMonth > 1 ? 's' : ''}`, <CalendarDays size={20} />, '#5E35B1')}
        {statCard('Générations ce mois', String(stats.countMonth), 'Appels Gemini réussis', <Zap size={20} />, '#F57C00')}
      </div>

      {/* Budget mensuel + alerte de seuil */}
      <div style={{ marginTop: 24, background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(94,53,177,0.1)', padding: 8, borderRadius: 12, color: '#5E35B1' }}><Wallet size={20} /></div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)' }}>Budget mensuel</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Plafond :</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>$</span>
            <input type="number" value={budget} onChange={onBudget} min="0" step="1"
              style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', fontWeight: 600, outline: 'none' }} />
          </div>
        </div>

        <div style={{ height: 12, borderRadius: 8, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 8, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          <span>{fmt(stats.costMonth)} consommés</span>
          <span>{budgetNum > 0 ? `${pct.toFixed(0)} % du budget` : 'Définis un budget'}</span>
        </div>

        {(danger || warning) && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12,
            background: danger ? 'rgba(255,50,50,0.08)' : 'rgba(255,180,0,0.08)', border: `1px solid ${danger ? 'rgba(255,50,50,0.2)' : 'rgba(255,180,0,0.25)'}` }}>
            <AlertTriangle size={18} color={danger ? '#FF3232' : '#F57C00'} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--color-text-main)', lineHeight: 1.5 }}>
              {danger ? 'Budget mensuel atteint ou dépassé. Pense à recharger tes crédits Gemini ou à surveiller les nouvelles générations.'
                : 'Tu as consommé plus de 80 % de ton budget mensuel. Anticipe la recharge.'}
            </p>
          </div>
        )}
        {!danger && !warning && budgetNum > 0 && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#00A854', fontWeight: 600 }}>
            <CheckCircle2 size={18} /> Consommation sous contrôle.
          </div>
        )}
      </div>

      {/* Répartition par module */}
      <div style={{ marginTop: 24, background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)' }}>Répartition par module (ce mois)</h3>
        {stats.byFeature.length === 0 && (
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>Aucune génération ce mois pour l'instant.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stats.byFeature.map((f) => (
            <div key={f.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-main)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: f.color, display: 'inline-block' }} />
                  {f.label}
                </span>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  <strong style={{ color: 'var(--color-text-main)' }}>{fmt(f.cost)}</strong> · {f.count} gén.
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <div style={{ width: `${(f.cost / maxFeatureCost) * 100}%`, height: '100%', background: f.color, borderRadius: 6, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
