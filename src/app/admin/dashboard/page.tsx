import React from 'react';
import { Card } from '@/components/ui/Card/Card';

export default function AdminDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-section)'}}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Tableau de bord Administrateur</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Gérez les accès à la plateforme (Génération de codes, activations/désactivations).</p>
      </header>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--spacing-standard)'}}>
        <a href="/admin/dashboard/users" style={{ textDecoration: 'none' }}>
          <Card style={{ cursor: 'pointer', transition: 'transform 0.2s ease', border: '1px solid var(--color-primary)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-small)', color: 'var(--color-primary)' }}>🔑 Gestion des Accès</h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Générer des codes, activer/désactiver les étudiants.</p>
          </Card>
        </a>
      </div>
    </div>
  );
}
