import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import SaasMetricsDashboard from '@/components/admin/SaasMetricsDashboard';
import GeminiCostPanel from '@/components/admin/GeminiCostPanel';
import Link from 'next/link';
import { KeyRound, ChevronRight } from 'lucide-react';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// Libellés + couleurs des modules IA (features journalisées dans saas_metrics).
const FEATURES: Record<string, { label: string; color: string }> = {
  worker_master: { label: 'Étude Guidée', color: '#6366f1' },
  evaluate_qcm: { label: 'Évaluation', color: '#0ea5e9' },
  flashcards: { label: 'Flashcards', color: '#a855f7' },
  redaction: { label: 'Rédaction', color: '#ec4899' },
};

export default async function AdminDashboard() {
  // Récupérer les codes pour calculer le MRR, Churn, etc.
  const { data: codes } = await supabaseAdmin.from('access_codes').select('*');

  // --- Consommation IA (Gemini) : agrégation du mois en cours ---
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfDayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const { data: metrics } = await supabaseAdmin
    .from('saas_metrics').select('feature, cost_usd, created_at').gte('created_at', startOfMonth);

  let costToday = 0, costMonth = 0, countToday = 0, countMonth = 0;
  const agg: Record<string, { cost: number; count: number }> = {};
  for (const m of metrics || []) {
    const cost = Number(m.cost_usd) || 0;
    costMonth += cost; countMonth++;
    if (new Date(m.created_at).getTime() >= startOfDayTime) { costToday += cost; countToday++; }
    const key = m.feature || 'autre';
    (agg[key] ??= { cost: 0, count: 0 });
    agg[key].cost += cost; agg[key].count++;
  }
  const byFeature = Object.entries(agg).map(([key, v]) => ({
    key, label: FEATURES[key]?.label || key, color: FEATURES[key]?.color || '#64748b', cost: v.cost, count: v.count,
  })).sort((a, b) => b.cost - a.cost);
  const costStats = { costToday, costMonth, countToday, countMonth, byFeature };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-section)'}}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '32px', letterSpacing: '-1px' }}>
          Tableau de bord Administrateur
        </h1>
        <p style={{ margin: '8px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '16px' }}>
          Vue globale sur les performances et outils de gestion de Tuina.ai.
        </p>
      </header>

      <GeminiCostPanel stats={costStats} />

      <SaasMetricsDashboard codes={codes || []} />

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ margin: '0 0 24px 0', color: 'var(--color-text-main)', fontSize: '24px', letterSpacing: '-0.5px' }}>
          Outils d'administration
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px'}}>
          
          <Link href="/admin/dashboard/users" className={styles.adminCard}>
            <div className={styles.adminCardInner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{ background: 'rgba(27, 58, 107, 0.1)', color: 'var(--color-primary)', padding: '12px', borderRadius: '12px' }}>
                  <KeyRound size={24} />
                </div>
                <h3 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '18px', fontWeight: 600 }}>
                  Gestion des Accès
                </h3>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                Générez des codes pour vos ventes WhatsApp, et activez ou désactivez l'accès des étudiants à la plateforme en un clic.
              </p>
              <div className={styles.adminCardArrow}>
                <ChevronRight size={20} />
              </div>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
}
