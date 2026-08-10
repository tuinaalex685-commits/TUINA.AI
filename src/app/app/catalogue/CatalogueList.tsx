"use client";

import React, { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { useRouter } from 'next/navigation';

type CatalogEntry = { id: string; etude_cours_id: string; titre_affiche: string; matiere: string | null; ordre: number };

export default function CatalogueList({ entries, progressByCours }: { entries: CatalogEntry[]; progressByCours: Record<string, string> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleNavigate = (catalogId: string) => {
    setLoadingId(catalogId);
    startTransition(() => {
      router.push(`/app/etude/catalogue/${catalogId}`);
    });
  };

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <header style={{ marginBottom: 'var(--spacing-large)' }}>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '28px' }}>Cours disponibles</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: '8px' }}>
          Ces cours ont déjà été analysés par SJP — découvre l'Étude Guidée, les Révisions et l'Examen dessus, sans rien importer.
        </p>
      </header>

      {entries.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', marginBottom: '16px' }}>🏛️</span>
          <h3 style={{ color: 'var(--color-text-main)', fontSize: '20px', margin: 0 }}>Aucun cours au catalogue pour l'instant</h3>
          <p style={{ marginTop: '8px' }}>Reviens bientôt, ou importe directement ton propre cours dans la Bibliothèque.</p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--spacing-standard)' }}>
          {entries.map(entry => {
            const statut = progressByCours[entry.etude_cours_id] || 'non_commence';
            return (
              <Card key={entry.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ marginBottom: 'var(--spacing-standard)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <span style={{ fontSize: '32px' }}>🏛️</span>
                    {statut === 'non_commence' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Nouveau</span>}
                    {statut === 'en_cours' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 600 }}>En cours</span>}
                    {statut === 'termine' && <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontWeight: 600 }}>Terminé</span>}
                  </div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--color-text-main)' }}>{entry.titre_affiche}</h3>
                  {entry.matiere && (
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{entry.matiere}</div>
                  )}
                </div>

                <Button
                  onClick={() => handleNavigate(entry.id)}
                  style={{ width: '100%', padding: '10px' }}
                  variant={statut === 'non_commence' ? 'primary' : 'secondary'}
                  disabled={isPending && loadingId === entry.id}
                >
                  {(isPending && loadingId === entry.id) ? 'Chargement...' : (statut === 'non_commence' ? 'Découvrir' : 'Continuer')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
