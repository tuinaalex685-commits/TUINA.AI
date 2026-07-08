import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/Card/Card';
import AccessCodeManager from './AccessCodeManager';

export const dynamic = 'force-dynamic';

export default async function UsersAdminPage() {
  // Récupérer tous les codes d'accès avec le client admin (sans RLS)
  const { data: codes, error } = await supabaseAdmin
    .from('access_codes')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Gestion des Accès</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Créez et gérez les codes d'accès uniques de vos étudiants.
        </p>
      </header>

      <Card>
        <AccessCodeManager initialCodes={codes || []} />
      </Card>
    </div>
  );
}
