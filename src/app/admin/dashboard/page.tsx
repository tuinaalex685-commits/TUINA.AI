import React from 'react';
import { Card } from '@/components/ui/Card/Card';
import { supabaseAdmin } from '@/lib/supabase/admin';
import SaasMetricsDashboard from '@/components/admin/SaasMetricsDashboard';
import Link from 'next/link';

export default async function AdminDashboard() {
  // Récupérer les codes pour calculer le MRR, Churn, etc.
  const { data: codes } = await supabaseAdmin.from('access_codes').select('*');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-section)'}}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Tableau de bord Administrateur</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Pilotez la croissance de votre SaaS Tuina.ai.</p>
      </header>
      
      <SaasMetricsDashboard codes={codes || []} />

      <h2 style={{ margin: '16px 0 0 0', color: 'var(--color-text-main)', fontSize: '20px' }}>Outils d'administration</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--spacing-standard)'}}>
        <Link href="/admin/dashboard/users" style={{ textDecoration: 'none' }}>
          <Card style={{ cursor: 'pointer', transition: 'transform 0.2s ease', border: '1px solid var(--color-primary)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-small)', color: 'var(--color-primary)' }}>🔑 Gestion des Accès</h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Générer des codes (ventes WhatsApp), activer/désactiver les étudiants.</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
