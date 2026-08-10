import React from 'react';
import { Card } from '@/components/ui/Card/Card';
import { listCatalogAdmin, listPublishableCourses } from '@/app/actions/catalog';
import CatalogueManager from './CatalogueManager';

export const dynamic = 'force-dynamic';

export default async function AdminCataloguePage() {
  const [entriesRes, publishableRes] = await Promise.all([
    listCatalogAdmin(),
    listPublishableCourses(),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Catalogue public</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Publie des cours déjà générés pour que tous les étudiants autorisés puissent les découvrir sans les importer eux-mêmes.
        </p>
      </header>

      {(entriesRes.error || publishableRes.error) && (
        <p style={{ color: 'var(--color-error)' }}>{entriesRes.error || publishableRes.error}</p>
      )}

      <Card>
        <CatalogueManager
          initialEntries={entriesRes.entries || []}
          publishableCourses={publishableRes.courses || []}
        />
      </Card>
    </div>
  );
}
