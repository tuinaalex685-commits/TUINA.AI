"use client";

import React from 'react';
import { LineChart, FileText, Users, Timer, UserCheck, UserX } from 'lucide-react';

export interface InsightsData {
  daily: { label: string; cost: number }[];
  topDocs: { id: string; name: string; count: number; cost: number }[];
  topUsers: { id: string; email: string; count: number; cost: number }[];
  avgDuration: { key: string; label: string; color: string; avgSec: number }[];
  users: { totalAccounts: number; activeCodes: number; inactiveCodes: number; active30: number };
}

const fmt = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const cardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' };
const h3Style: React.CSSProperties = { margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: 10 };

export default function AdminInsights({ data }: { data: InsightsData }) {
  const maxDaily = Math.max(0.0001, ...data.daily.map((d) => d.cost));
  const total30 = data.daily.reduce((a, d) => a + d.cost, 0);
  const maxDocCount = Math.max(1, ...data.topDocs.map((d) => d.count));
  const maxUserCost = Math.max(0.0001, ...data.topUsers.map((u) => u.cost));
  const maxDur = Math.max(0.1, ...data.avgDuration.map((d) => d.avgSec));

  const userTile = (label: string, value: string | number, icon: React.ReactNode, color: string) => (
    <div style={{ flex: 1, minWidth: 120, background: `${color}0d`, border: `1px solid ${color}22`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, marginBottom: 8 }}>{icon}<span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span></div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-main)' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 1. Courbe du cout 30 jours */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={h3Style}><LineChart size={20} color="#5E35B1" /> Coût des 30 derniers jours</h3>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total : <strong style={{ color: 'var(--color-text-main)' }}>{fmt(total30)}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, marginTop: 8 }}>
          {data.daily.map((d, i) => (
            <div key={i} title={`${d.label} : ${fmt(d.cost)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${Math.max(2, (d.cost / maxDaily) * 100)}%`, background: d.cost > 0 ? 'linear-gradient(180deg,#7C5CFF,#5E35B1)' : 'rgba(0,0,0,0.06)', borderRadius: 4, minHeight: 2, transition: 'height 0.4s' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          <span>{data.daily[0]?.label}</span><span>{data.daily[data.daily.length - 1]?.label}</span>
        </div>
      </div>

      {/* 2. Top cours + Top etudiants */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
        <div style={cardStyle}>
          <h3 style={h3Style}><FileText size={20} color="#6366f1" /> Cours les plus générés</h3>
          {data.topDocs.length === 0 && <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>Aucune donnée.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.topDocs.map((d) => (
              <div key={d.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{d.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500, flexShrink: 0 }}><strong style={{ color: 'var(--color-text-main)' }}>{d.count}×</strong> · {fmt(d.cost)}</span>
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${(d.count / maxDocCount) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={h3Style}><Users size={20} color="#ec4899" /> Étudiants les plus consommateurs</h3>
          {data.topUsers.length === 0 && <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>Aucune donnée.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.topUsers.map((u) => (
              <div key={u.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{u.email}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500, flexShrink: 0 }}><strong style={{ color: 'var(--color-text-main)' }}>{fmt(u.cost)}</strong> · {u.count} gén.</span>
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${(u.cost / maxUserCost) * 100}%`, height: '100%', background: '#ec4899', borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Temps moyen + Utilisateurs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
        <div style={cardStyle}>
          <h3 style={h3Style}><Timer size={20} color="#F57C00" /> Temps moyen de génération</h3>
          {data.avgDuration.length === 0 && <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>Aucune donnée.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.avgDuration.map((d) => (
              <div key={d.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-text-main)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />{d.label}
                  </span>
                  <span style={{ fontSize: 13.5, color: 'var(--color-text-main)', fontWeight: 700 }}>{d.avgSec.toFixed(1)} s</span>
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${(d.avgSec / maxDur) * 100}%`, height: '100%', background: d.color, borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={h3Style}><Users size={20} color="#00A854" /> Utilisateurs</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {userTile('Comptes total', data.users.totalAccounts, <Users size={16} />, '#5E35B1')}
            {userTile('Actifs (30j)', data.users.active30, <UserCheck size={16} />, '#00A854')}
            {userTile('Accès actifs', data.users.activeCodes, <UserCheck size={16} />, '#0ea5e9')}
            {userTile('Accès inactifs', data.users.inactiveCodes, <UserX size={16} />, '#FF3232')}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            « Actifs (30j) » = étudiants ayant réellement généré du contenu ces 30 derniers jours. « Accès actifs/inactifs » = statut des codes d'abonnement.
          </p>
        </div>
      </div>
    </div>
  );
}
