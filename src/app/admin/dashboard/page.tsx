import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isCodeCurrentlyActive } from '@/lib/plan';
import { creditStatus } from '@/lib/aiBudget';
import { GeminiCreditPanel } from '@/components/admin/GeminiCreditPanel';
import { NIVEAUX, SOURCES } from '@/lib/profileShared';
import { formatDate } from '@/lib/format';
import { DailyBars, HBars, Kpi } from '@/components/admin/charts';
import styles from '@/components/admin/admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration | SJP' };

const PRICE_FCFA = 2500;

const MODULES: Record<string, string> = {
  worker_master: 'Études guidées',
  evaluate_qcm: 'Évaluations',
  flashcards: 'Cartes de révision',
  redaction: 'Rédaction',
  etude_evaluate: 'Corrections de cas pratique',
  examen_pool: 'Banques d’examen',
  etude3_segment: 'Études guidées : lecture du cours',
  etude3_consolidation: 'Études guidées : vue d’ensemble',
  etude3_synthese: 'Études guidées : synthèse',
  etude3_sequence: 'Études guidées : séquences',
  etude3_correction: 'Études guidées : corrections',
  redaction_sujets: 'Rédaction : sujets proposés',
};

const usd = (v: number) => `${v.toFixed(2).replace('.', ',')} $`;
const int = (v: number) => new Intl.NumberFormat('fr-FR').format(Math.round(v));

/**
 * Vue d'ensemble de l'administration : ce qui se passe sur SJP et ce qui demande une action.
 * Toutes les lectures partent en parallèle ; chaque chiffre est soit mesuré, soit marqué
 * comme estimation.
 */
export default async function AdminDashboard() {
  const now = new Date();
  const nowMs = now.getTime();
  const start30 = new Date(nowMs - 30 * 86400000).toISOString();
  const in7 = new Date(nowMs + 7 * 86400000).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();

  const [
    { data: codes },
    { count: accounts },
    { count: newAccounts },
    { data: metrics },
    { data: profiles },
    { data: catalog },
    credit,
  ] = await Promise.all([
    supabaseAdmin.from('access_codes').select('status, email, expires_at'),
    supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true }),
    supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true }).gte('created_at', start30),
    supabaseAdmin.from('saas_metrics').select('feature, cost_usd, created_at, document_id, user_id').gte('created_at', start30),
    supabaseAdmin.from('profiles').select('niveau, source_decouverte'),
    supabaseAdmin.from('catalog_courses').select('niveau, actif'),
    creditStatus(),
  ]);

  // --- Abonnements ---------------------------------------------------------
  const liveCodes = (codes || []).filter((c) => c.email && isCodeCurrentlyActive(c));
  const expiringSoon = liveCodes
    .filter((c) => c.expires_at && c.expires_at <= in7)
    .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));
  const freeCodes = (codes || []).filter((c) => !c.email && c.status === 'active').length;

  // --- IA : coûts et activité ----------------------------------------------
  const dayCost: Record<string, number> = {};
  const moduleCost: Record<string, number> = {};
  const docCount: Record<string, number> = {};
  const userCost: Record<string, number> = {};
  const active = new Set<string>();
  let monthCost = 0;
  for (const m of metrics || []) {
    const cost = Number(m.cost_usd) || 0;
    const day = String(m.created_at).slice(0, 10);
    dayCost[day] = (dayCost[day] || 0) + cost;
    if (new Date(m.created_at).getTime() >= startOfMonth) {
      monthCost += cost;
      const k = m.feature || 'autre';
      moduleCost[k] = (moduleCost[k] || 0) + cost;
    }
    if (m.document_id) docCount[m.document_id] = (docCount[m.document_id] || 0) + 1;
    if (m.user_id) {
      userCost[m.user_id] = (userCost[m.user_id] || 0) + cost;
      active.add(m.user_id);
    }
  }
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(nowMs - (29 - i) * 86400000);
    return { label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, value: dayCost[d.toISOString().slice(0, 10)] || 0 };
  });

  const topDocIds = Object.entries(docCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topUserIds = Object.entries(userCost).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const [{ data: docs }, { data: users }] = await Promise.all([
    topDocIds.length ? supabaseAdmin.from('documents').select('id, nom').in('id', topDocIds.map(([id]) => id)) : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
    topUserIds.length ? supabaseAdmin.from('user_roles').select('user_id, email').in('user_id', topUserIds.map(([id]) => id)) : Promise.resolve({ data: [] as { user_id: string; email: string }[] }),
  ]);
  const docName = new Map((docs || []).map((d) => [d.id, d.nom]));
  const userEmail = new Map((users || []).map((u) => [u.user_id, u.email]));

  // --- Étudiants : niveaux et canaux de découverte --------------------------
  const levelRows = [
    ...NIVEAUX.map((n) => ({ label: n.libelle, value: (profiles || []).filter((p) => p.niveau === n.code).length })),
    { label: 'Année non indiquée', value: Math.max(0, (accounts || 0) - (profiles || []).filter((p) => p.niveau).length) },
  ];
  const sourceRows = SOURCES.map((s) => ({ label: s.libelle, value: (profiles || []).filter((p) => p.source_decouverte === s.code).length }))
    .sort((a, b) => b.value - a.value);
  const catalogByLevel = [
    ...NIVEAUX.map((n) => ({ label: n.court, value: (catalog || []).filter((c) => c.actif && c.niveau === n.code).length })),
    { label: 'Tous niveaux', value: (catalog || []).filter((c) => c.actif && !c.niveau).length },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Vue d’ensemble</h1>
        <p>{formatDate(now)} · activité des 30 derniers jours</p>
      </header>

      <section className={styles.kpis} aria-label="Indicateurs clés">
        <Kpi label="Comptes inscrits" value={int(accounts || 0)} sub={`+${int(newAccounts || 0)} en 30 jours`} />
        <Kpi
          label="Abonnements Premium en cours"
          value={int(liveCodes.length)}
          sub={`≈ ${int(liveCodes.length * PRICE_FCFA)} FCFA / mois (estimation)`}
        />
        <Kpi label="Étudiants actifs (IA, 30 j)" value={int(active.size)} sub="ayant utilisé au moins une fonction IA" />
        <Kpi
          label="Crédit Gemini restant"
          value={credit.restant !== null ? usd(credit.restant) : '—'}
          sub={credit.restant !== null ? `${Math.round(credit.pct ?? 0)} % consommé · estimation` : 'Saisis ton crédit ci-dessous'}
          tone={credit.pct !== null && credit.pct >= credit.settings.alert_pct ? 'warn' : undefined}
        />
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>À relancer</h2>
            <span>abonnements qui expirent dans 7 jours</span>
          </div>
          {expiringSoon.length === 0 ? (
            <p className={styles.muted}>Aucun abonnement n’expire cette semaine.</p>
          ) : (
            <ul className={styles.list}>
              {expiringSoon.map((c) => (
                <li key={c.email} className={styles.listRow}>
                  <span className={styles.listMain}>{c.email}</span>
                  <span className={styles.pill}>{formatDate(c.expires_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.muted} style={{ marginTop: 'var(--s-4)' }}>
            {freeCodes} code{freeCodes > 1 ? 's' : ''} disponible{freeCodes > 1 ? 's' : ''} pour de nouveaux abonnés · <Link href="/admin/dashboard/users" className={styles.panelLink}>Gérer les codes</Link>
          </p>
        </section>

        <GeminiCreditPanel
          v={{
            credit: credit.settings.credit_usd, rechargeAt: credit.settings.recharge_at, dailyUsd: credit.settings.daily_usd,
            alertPct: credit.settings.alert_pct, consomme: credit.consomme, restant: credit.restant, pct: credit.pct,
            parJour7: credit.parJour7, joursRestants: credit.joursRestants, aujourdHui: credit.aujourdHui,
          }}
        />
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Coût IA du mois par module</h2>
            <span className="tabular">{usd(monthCost)}</span>
          </div>
          <HBars
            rows={Object.entries(moduleCost).map(([k, v]) => ({ label: MODULES[k] || k, value: v })).sort((a, b) => b.value - a.value)}
            format={usd}
            empty="Aucune dépense IA ce mois-ci."
          />
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Coût IA par jour</h2>
          <span>30 derniers jours · survol pour le détail</span>
        </div>
        <DailyBars data={daily} format={usd} />
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Étudiants par année</h2>
            <Link href="/admin/dashboard/catalogue" className={styles.panelLink}>Catalogue</Link>
          </div>
          <HBars rows={levelRows} format={int} empty="Aucun étudiant pour l’instant." />
          <p className={styles.muted} style={{ marginTop: 'var(--s-4)' }}>
            Cours au catalogue : {catalogByLevel.map((c) => `${c.label} ${c.value}`).join(' · ')}
          </p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Comment ils découvrent SJP</h2>
            <span>réponses à l’inscription</span>
          </div>
          <HBars rows={sourceRows} format={int} empty="Pas encore de réponses : elles arrivent avec les nouvelles inscriptions." />
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Cours les plus travaillés</h2>
            <span>générations IA, 30 j</span>
          </div>
          <HBars rows={topDocIds.map(([id, n]) => ({ label: docName.get(id) || 'Document supprimé', value: n }))} format={int} empty="Aucune génération sur la période." />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Étudiants les plus coûteux</h2>
            <span>coût IA, 30 j</span>
          </div>
          <HBars rows={topUserIds.map(([id, v]) => ({ label: userEmail.get(id) || 'Compte supprimé', value: v }))} format={usd} empty="Aucune dépense sur la période." />
        </section>
      </div>
    </div>
  );
}
