import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import SaasMetricsDashboard from '@/components/admin/SaasMetricsDashboard';
import GeminiCostPanel from '@/components/admin/GeminiCostPanel';
import AdminInsights from '@/components/admin/AdminInsights';
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

  // --- Consommation IA (Gemini) : UNE seule requête sur 30 jours → deux vues (coûts du mois + insights) ---
  const now = new Date();
  const startOfMonthTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfDayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const { data: metrics } = await supabaseAdmin
    .from('saas_metrics')
    .select('feature, cost_usd, created_at, document_id, user_id, duration_ms')
    .gte('created_at', start30.toISOString());

  let costToday = 0, costMonth = 0, countToday = 0, countMonth = 0;
  const agg: Record<string, { cost: number; count: number }> = {};
  const dayMap: Record<string, number> = {};
  const docAgg: Record<string, { count: number; cost: number }> = {};
  const userAgg: Record<string, { count: number; cost: number }> = {};
  const durAgg: Record<string, { sum: number; n: number }> = {};
  const activeSet = new Set<string>();

  for (const m of metrics || []) {
    const cost = Number(m.cost_usd) || 0;
    const t = new Date(m.created_at).getTime();
    const dayKey = new Date(m.created_at).toISOString().slice(0, 10);
    dayMap[dayKey] = (dayMap[dayKey] || 0) + cost;
    if (t >= startOfMonthTime) {
      costMonth += cost; countMonth++;
      const key = m.feature || 'autre';
      (agg[key] ??= { cost: 0, count: 0 });
      agg[key].cost += cost; agg[key].count++;
    }
    if (t >= startOfDayTime) { costToday += cost; countToday++; }
    if (m.document_id) { (docAgg[m.document_id] ??= { count: 0, cost: 0 }); docAgg[m.document_id].count++; docAgg[m.document_id].cost += cost; }
    if (m.user_id) { (userAgg[m.user_id] ??= { count: 0, cost: 0 }); userAgg[m.user_id].count++; userAgg[m.user_id].cost += cost; activeSet.add(m.user_id); }
    const fk = m.feature || 'autre';
    (durAgg[fk] ??= { sum: 0, n: 0 });
    if (m.duration_ms) { durAgg[fk].sum += Number(m.duration_ms); durAgg[fk].n++; }
  }

  const byFeature = Object.entries(agg).map(([key, v]) => ({
    key, label: FEATURES[key]?.label || key, color: FEATURES[key]?.color || '#64748b', cost: v.cost, count: v.count,
  })).sort((a, b) => b.cost - a.cost);
  const costStats = { costToday, costMonth, countToday, countMonth, byFeature };

  // Courbe des 30 derniers jours
  const daily: { label: string; cost: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    daily.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, cost: dayMap[d.toISOString().slice(0, 10)] || 0 });
  }
  // Top cours (par nb de générations) + noms
  const topDocIds = Object.entries(docAgg).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const { data: docsInfo } = topDocIds.length
    ? await supabaseAdmin.from('documents').select('id, nom').in('id', topDocIds.map(([id]) => id))
    : { data: [] as any[] };
  const docName: Record<string, string> = Object.fromEntries((docsInfo || []).map((d: any) => [d.id, d.nom]));
  const topDocs = topDocIds.map(([id, v]) => ({ id, name: docName[id] || '(supprimé)', count: v.count, cost: v.cost }));
  // Top étudiants (par coût) + emails
  const topUserIds = Object.entries(userAgg).sort((a, b) => b[1].cost - a[1].cost).slice(0, 8);
  const { data: usersInfo } = topUserIds.length
    ? await supabaseAdmin.from('user_roles').select('user_id, email').in('user_id', topUserIds.map(([id]) => id))
    : { data: [] as any[] };
  const userEmail: Record<string, string> = Object.fromEntries((usersInfo || []).map((u: any) => [u.user_id, u.email]));
  const topUsers = topUserIds.map(([id, v]) => ({ id, email: userEmail[id] || '(inconnu)', count: v.count, cost: v.cost }));
  // Temps moyen par module
  const avgDuration = Object.entries(durAgg).filter(([, v]) => v.n > 0).map(([key, v]) => ({
    key, label: FEATURES[key]?.label || key, color: FEATURES[key]?.color || '#64748b', avgSec: v.sum / v.n / 1000,
  })).sort((a, b) => b.avgSec - a.avgSec);
  // Utilisateurs
  const { count: totalAccounts } = await supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true });
  const activeCodes = (codes || []).filter((c: any) => c.status === 'active').length;
  const inactiveCodes = (codes || []).filter((c: any) => c.status === 'inactive').length;
  const insights = { daily, topDocs, topUsers, avgDuration, users: { totalAccounts: totalAccounts || 0, activeCodes, inactiveCodes, active30: activeSet.size } };

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

      <AdminInsights data={insights} />

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
