import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import SaasMetricsDashboard from '@/components/admin/SaasMetricsDashboard';
import Link from 'next/link';
import { KeyRound, ChevronRight } from 'lucide-react';
import styles from './page.module.css';

export default async function AdminDashboard() {
  // Récupérer les codes pour calculer le MRR, Churn, etc.
  const { data: codes } = await supabaseAdmin.from('access_codes').select('*');

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
