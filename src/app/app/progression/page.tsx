import React from 'react';
import { Card } from '@/components/ui/Card/Card';
import { createClient } from '@/lib/supabase/server';

export default async function ProgressionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Récupération depuis les VRAIES tables existantes
  const [
    { count: evalCount },
    { count: flashCount },
    { count: redactionCount },
    { data: objectifs }
  ] = await Promise.all([
    supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('score', 'is', null),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('redactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('objectifs').select('*').eq('user_id', user.id)
  ]);

  const objTermines = (objectifs || []).filter((o: any) => (o.progression || 0) >= (o.cible || 1)).length;
  const objTotal = (objectifs || []).length;
  const objPercent = objTotal > 0 ? Math.round((objTermines / objTotal) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-section)' }}>
      <header>
        <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Votre Progression</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>
          Suivi en temps réel de votre activité et de vos performances.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-large)' }}>
        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Objectifs Atteints</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{objPercent}%</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>{objTermines} sur {objTotal} objectifs</p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Évaluations Réalisées</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-success)' }}>{evalCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Évaluations complétées avec note</p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Flashcards Créées</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-warning)' }}>{flashCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Cartes de révision générées</p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Rédactions</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#8b5cf6' }}>{redactionCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Devoirs rédigés et analysés</p>
        </Card>
      </div>

      {objectifs && objectifs.length > 0 && (
        <Card style={{ padding: 'var(--spacing-large)' }}>
          <h2 style={{ margin: '0 0 var(--spacing-large)', fontSize: '20px' }}>Détail des Objectifs</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {objectifs.map((obj: any) => {
              const progress = Math.min(100, Math.round(((obj.progression || 0) / (obj.cible || 1)) * 100));
              const done = (obj.progression || 0) >= (obj.cible || 1);
              return (
                <div key={obj.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', flex: '1 1 200px', textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--color-success)' : 'var(--color-text-main)' }}>
                    {obj.titre || obj.type || 'Objectif'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', minWidth: '60px', textAlign: 'right' }}>
                      {obj.progression || 0}/{obj.cible || 1}
                    </span>
                    <div style={{ width: '120px', height: '8px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, backgroundColor: done ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

