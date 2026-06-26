import React from 'react';
import { Card } from '@/components/ui/Card/Card';
import { createClient } from '@/lib/supabase/server';

export default async function ProgressionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Récupération globale
  const [{ count: quizCount }, { count: flashCount }, { data: objectifs }] = await Promise.all([
    supabase.from('quiz').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('score', 'is', null),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('statut', 'validated'),
    supabase.from('objectifs').select('*').eq('user_id', user.id)
  ]);

  const objTermines = (objectifs || []).filter((o: any) => o.progression >= o.cible).length;
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
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Quiz Réalisés</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-success)' }}>{quizCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Évaluations complétées</p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Flashcards Maîtrisées</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-warning)' }}>{flashCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Cartes en mémoire</p>
        </Card>
      </div>

      <Card style={{ padding: 'var(--spacing-large)' }}>
        <h2 style={{ margin: '0 0 var(--spacing-large)', fontSize: '20px' }}>Évolution dans le temps</h2>
        <div style={{ height: '300px', width: '100%', border: '1px dashed var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <p>Le graphique d'évolution s'affichera ici après vos premières sessions de révision.</p>
        </div>
      </Card>
    </div>
  );
}
