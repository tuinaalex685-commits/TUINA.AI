"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card/Card';

export default function SaasMetricsDashboard({ codes }: { codes: any[] }) {
  const [marketingSpend, setMarketingSpend] = useState<string>('0');

  useEffect(() => {
    // Restaurer la valeur sauvegardée depuis le local storage
    const savedSpend = localStorage.getItem('tuina_marketing_spend');
    if (savedSpend) {
      setMarketingSpend(savedSpend);
    }
  }, []);

  const handleSpendChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMarketingSpend(val);
    localStorage.setItem('tuina_marketing_spend', val);
  };

  // --- CALCUL DES MÉTRIQUES (Masterclass iZi SaaS) ---
  const PRICE_PER_USER = 2500; // FCFA

  const totalCodes = codes.length;
  const activeCodes = codes.filter(c => c.status === 'active').length;
  const inactiveCodes = codes.filter(c => c.status === 'inactive').length;

  // 1. MRR (Revenu Mensuel Récurrent)
  const mrr = activeCodes * PRICE_PER_USER;

  // 2. Churn (Taux d'annulation) = Inactifs / Total
  const churnRate = totalCodes > 0 ? (inactiveCodes / totalCodes) : 0;
  const churnPercent = (churnRate * 100).toFixed(1);

  // 3. CAC (Coût d'Acquisition Client) = Dépenses / Total Nouveaux Clients
  const numericSpend = parseInt(marketingSpend, 10) || 0;
  const cac = totalCodes > 0 ? Math.round(numericSpend / totalCodes) : 0;

  // 4. LTV (Valeur Vie Client) = MRR par utilisateur / Churn Rate
  // Si churn est 0, on estime arbitrairement à 20 mois pour le MVP
  const ltv = churnRate > 0 ? Math.round(PRICE_PER_USER / churnRate) : PRICE_PER_USER * 20;

  // Règle d'or : LTV > 3x CAC
  const isGoldenRuleMet = cac > 0 ? (ltv > 3 * cac) : true;

  const formatCFA = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--color-text-main)' }}>Tableau de bord Investisseur (SaaS)</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-bg-secondary)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <label htmlFor="spend" style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Dépenses Publicitaires :</label>
          <input 
            id="spend"
            type="number" 
            value={marketingSpend} 
            onChange={handleSpendChange}
            style={{ width: '120px', padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-main)', color: 'var(--color-text-main)' }}
            placeholder="Ex: 50000"
          />
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>FCFA</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        {/* MRR Card */}
        <Card style={{ borderTop: '4px solid #00C864' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 8px 0' }}>MRR (Revenu Mensuel)</p>
          <h3 style={{ fontSize: '32px', margin: 0, color: 'var(--color-text-main)' }}>{formatCFA(mrr)}</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '8px 0 0 0' }}>{activeCodes} abonnés actifs x {PRICE_PER_USER}F</p>
        </Card>

        {/* Churn Card */}
        <Card style={{ borderTop: '4px solid #FF3232' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 8px 0' }}>Churn (Annulations)</p>
          <h3 style={{ fontSize: '32px', margin: 0, color: 'var(--color-text-main)' }}>{churnPercent}%</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '8px 0 0 0' }}>{inactiveCodes} perdus / {totalCodes} total</p>
        </Card>

        {/* CAC Card */}
        <Card style={{ borderTop: '4px solid #FFB400' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 8px 0' }}>CAC (Coût d'Acquisition)</p>
          <h3 style={{ fontSize: '32px', margin: 0, color: 'var(--color-text-main)' }}>{formatCFA(cac)}</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '8px 0 0 0' }}>{formatCFA(numericSpend)} pub / {totalCodes} clients</p>
        </Card>

        {/* LTV Card */}
        <Card style={{ borderTop: '4px solid #7C5CFF' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 8px 0' }}>LTV (Valeur Vie Client)</p>
          <h3 style={{ fontSize: '32px', margin: 0, color: 'var(--color-text-main)' }}>{formatCFA(ltv)}</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '8px 0 0 0' }}>Revenu estimé sur le long terme</p>
        </Card>
      </div>

      <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', background: isGoldenRuleMet ? 'rgba(0, 200, 100, 0.1)' : 'rgba(255, 50, 50, 0.1)', border: `1px solid ${isGoldenRuleMet ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255, 50, 50, 0.3)'}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '24px' }}>{isGoldenRuleMet ? '🔥' : '⚠️'}</div>
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-text-main)' }}>Règle d'or (LTV {'>'} 3x CAC) : {isGoldenRuleMet ? 'Validée !' : 'En danger'}</h4>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            {isGoldenRuleMet 
              ? "Votre SaaS est rentable. La valeur d'un client dépasse largement ce qu'il vous coûte à acquérir. Vous pouvez augmenter votre budget pub sereinement." 
              : "Attention, l'acquisition de vos clients coûte trop cher par rapport à ce qu'ils rapportent. Réduisez le budget pub ou diminuez votre taux d'annulation (Churn)."}
          </p>
        </div>
      </div>
    </div>
  );
}
