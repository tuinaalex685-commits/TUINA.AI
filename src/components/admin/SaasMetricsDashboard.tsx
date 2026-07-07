"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { TrendingUp, UserMinus, Target, Gem, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

  // --- CALCUL DES MÉTRIQUES ---
  const PRICE_PER_USER = 2500; // FCFA

  const totalCodes = codes.length;
  const activeCodes = codes.filter(c => c.status === 'active').length;
  const inactiveCodes = codes.filter(c => c.status === 'inactive').length;

  // 1. MRR
  const mrr = activeCodes * PRICE_PER_USER;

  // 2. Churn
  const churnRate = totalCodes > 0 ? (inactiveCodes / totalCodes) : 0;
  const churnPercent = (churnRate * 100).toFixed(1);

  // 3. CAC
  const numericSpend = parseInt(marketingSpend, 10) || 0;
  const cac = totalCodes > 0 ? Math.round(numericSpend / totalCodes) : 0;

  // 4. LTV
  const ltv = churnRate > 0 ? Math.round(PRICE_PER_USER / churnRate) : PRICE_PER_USER * 20;

  // Règle d'or
  const isGoldenRuleMet = cac > 0 ? (ltv > 3 * cac) : true;

  const formatCFA = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            Cockpit Investisseur
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '15px' }}>
            Pilotez la rentabilité et la croissance de votre SaaS.
          </p>
        </div>
        
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '12px', 
          background: 'var(--color-bg-main)', padding: '10px 16px', 
          borderRadius: '12px', border: '1px solid var(--color-border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          <label htmlFor="spend" style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Budget Pub :</label>
          <input 
            id="spend"
            type="number" 
            value={marketingSpend} 
            onChange={handleSpendChange}
            style={{ 
              width: '120px', padding: '8px 12px', borderRadius: '8px', 
              border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', 
              color: 'var(--color-text-main)', fontWeight: 500, outline: 'none'
            }}
            placeholder="Ex: 50000"
          />
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>FCFA</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
        
        {/* MRR Card */}
        <div style={{ 
          background: 'linear-gradient(145deg, #ffffff 0%, #f9fcfb 100%)', 
          border: '1px solid rgba(0, 200, 100, 0.2)', 
          borderRadius: '16px', padding: '24px', 
          boxShadow: '0 4px 20px rgba(0, 200, 100, 0.05)',
          position: 'relative', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 200, 100, 0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 200, 100, 0.05)'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#00A854', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
              MRR (Revenu Mensuel)
            </p>
            <div style={{ background: 'rgba(0, 200, 100, 0.1)', padding: '8px', borderRadius: '12px', color: '#00C864' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text-main)', letterSpacing: '-1px' }}>
            {formatCFA(mrr)}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, fontWeight: 500 }}>
            {activeCodes} abonnés actifs x {PRICE_PER_USER}F
          </p>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(0,200,100,0.1) 0%, rgba(0,200,100,0) 70%)', borderRadius: '50%' }} />
        </div>

        {/* Churn Card */}
        <div style={{ 
          background: 'linear-gradient(145deg, #ffffff 0%, #fcf9f9 100%)', 
          border: '1px solid rgba(255, 50, 50, 0.2)', 
          borderRadius: '16px', padding: '24px', 
          boxShadow: '0 4px 20px rgba(255, 50, 50, 0.05)',
          position: 'relative', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(255, 50, 50, 0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 50, 50, 0.05)'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#D32F2F', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
              Churn (Annulations)
            </p>
            <div style={{ background: 'rgba(255, 50, 50, 0.1)', padding: '8px', borderRadius: '12px', color: '#FF3232' }}>
              <UserMinus size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text-main)', letterSpacing: '-1px' }}>
            {churnPercent}%
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, fontWeight: 500 }}>
            {inactiveCodes} perdus / {totalCodes} total
          </p>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(255,50,50,0.1) 0%, rgba(255,50,50,0) 70%)', borderRadius: '50%' }} />
        </div>

        {/* CAC Card */}
        <div style={{ 
          background: 'linear-gradient(145deg, #ffffff 0%, #fcfbf9 100%)', 
          border: '1px solid rgba(255, 180, 0, 0.2)', 
          borderRadius: '16px', padding: '24px', 
          boxShadow: '0 4px 20px rgba(255, 180, 0, 0.05)',
          position: 'relative', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(255, 180, 0, 0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 180, 0, 0.05)'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#F57C00', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
              CAC (Coût d'Acquisition)
            </p>
            <div style={{ background: 'rgba(255, 180, 0, 0.1)', padding: '8px', borderRadius: '12px', color: '#FFB400' }}>
              <Target size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text-main)', letterSpacing: '-1px' }}>
            {formatCFA(cac)}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, fontWeight: 500 }}>
            {formatCFA(numericSpend)} pub / {totalCodes} clients
          </p>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(255,180,0,0.1) 0%, rgba(255,180,0,0) 70%)', borderRadius: '50%' }} />
        </div>

        {/* LTV Card */}
        <div style={{ 
          background: 'linear-gradient(145deg, #ffffff 0%, #faf9fc 100%)', 
          border: '1px solid rgba(124, 92, 255, 0.2)', 
          borderRadius: '16px', padding: '24px', 
          boxShadow: '0 4px 20px rgba(124, 92, 255, 0.05)',
          position: 'relative', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 92, 255, 0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 92, 255, 0.05)'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#5E35B1', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
              LTV (Valeur Vie Client)
            </p>
            <div style={{ background: 'rgba(124, 92, 255, 0.1)', padding: '8px', borderRadius: '12px', color: '#7C5CFF' }}>
              <Gem size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text-main)', letterSpacing: '-1px' }}>
            {formatCFA(ltv)}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, fontWeight: 500 }}>
            Revenu estimé sur le long terme
          </p>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(124,92,255,0.1) 0%, rgba(124,92,255,0) 70%)', borderRadius: '50%' }} />
        </div>
      </div>

      {/* Règle d'or Banner */}
      <div style={{ 
        marginTop: '32px', 
        padding: '24px', 
        borderRadius: '16px', 
        background: isGoldenRuleMet 
          ? 'linear-gradient(135deg, rgba(0, 200, 100, 0.1), rgba(0, 200, 100, 0.02))' 
          : 'linear-gradient(135deg, rgba(255, 50, 50, 0.1), rgba(255, 50, 50, 0.02))', 
        border: `1px solid ${isGoldenRuleMet ? 'rgba(0, 200, 100, 0.2)' : 'rgba(255, 50, 50, 0.2)'}`, 
        display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap',
        boxShadow: isGoldenRuleMet ? '0 8px 32px rgba(0, 200, 100, 0.05)' : '0 8px 32px rgba(255, 50, 50, 0.05)'
      }}>
        <div style={{ 
          background: isGoldenRuleMet ? '#00C864' : '#FF3232', 
          color: 'white', padding: '12px', borderRadius: '12px', 
          boxShadow: isGoldenRuleMet ? '0 4px 12px rgba(0, 200, 100, 0.3)' : '0 4px 12px rgba(255, 50, 50, 0.3)',
          flexShrink: 0
        }}>
          {isGoldenRuleMet ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
        </div>
        <div>
          <h4 style={{ 
            margin: '0 0 8px 0', 
            color: isGoldenRuleMet ? '#00A854' : '#D32F2F', 
            fontSize: '18px', fontWeight: 700 
          }}>
            Règle d'or (LTV {'>'} 3x CAC) : {isGoldenRuleMet ? 'Parfaitement Validée' : 'En zone de danger'}
          </h4>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--color-text-main)', lineHeight: '1.6' }}>
            {isGoldenRuleMet 
              ? "Excellente nouvelle ! Votre SaaS est très rentable. La valeur générée par chaque client dépasse largement le coût pour l'acquérir. C'est le moment idéal pour accélérer vos investissements publicitaires (Ads, influenceurs) en toute sécurité." 
              : "Attention : l'acquisition de vos clients coûte trop cher par rapport à l'argent qu'ils vous rapportent sur le long terme. Vous devez soit réduire votre coût par lead (optimiser vos pubs), soit fidéliser davantage pour faire baisser votre taux de désabonnement."}
          </p>
        </div>
      </div>
    </div>
  );
}
