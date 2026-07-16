import React from 'react';
import { Card } from '@/components/ui/Card/Card';
import { createClient } from '@/lib/supabase/server';
import { getCoursMasteryBreakdown, rollupGlobal } from '@/lib/etude/mastery';
import { SEUIL_MAITRISE } from '@/lib/config/mastery';

export default async function ProgressionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Récupération depuis les VRAIES tables existantes
  const [
    { count: examCount },
    { count: flashCount },
    { count: redactionCount },
    { data: objectifs },
    coursMastery
  ] = await Promise.all([
    supabase.from('examen_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'submitted'),
    supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('redactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('objectifs').select('*').eq('user_id', user.id),
    getCoursMasteryBreakdown(supabase, user.id)
  ]);

  // Agrégat global dérivé du détail par cours (source unique, aucun risque de divergence).
  const mastery = rollupGlobal(coursMastery);

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
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Maîtrise des Thèmes</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{mastery.pourcentageGlobal}%</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>
            {mastery.totalThemes > 0
              ? `${mastery.themesMaitrises} thème(s) maîtrisé(s) · ${mastery.themesARenforcer} à renforcer`
              : 'Commencez une Étude Guidée pour suivre votre maîtrise'}
          </p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Objectifs Atteints</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{objPercent}%</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>{objTermines} sur {objTotal} objectifs</p>
        </Card>

        <Card style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
          <h3 style={{ margin: '0 0 var(--spacing-standard)', color: 'var(--color-text-secondary)' }}>Examens Passés</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--color-success)' }}>{examCount || 0}</div>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)' }}>Examens complétés et notés</p>
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

      {coursMastery.length > 0 && (
        <Card style={{ padding: 'var(--spacing-large)' }}>
          <h2 style={{ margin: '0 0 var(--spacing-large)', fontSize: '20px' }}>Maîtrise par Cours</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {coursMastery.map((cours) => (
              <details key={cours.coursId} style={{ border: '1px solid var(--color-bg-secondary)', borderRadius: '8px', padding: '12px 16px' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, flex: '1 1 200px', color: 'var(--color-text-main)' }}>{cours.nom}</span>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {cours.themesMaitrises}/{cours.totalThemes} maîtrisé(s)
                  </span>
                  <div style={{ width: '120px', height: '8px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cours.pourcentage}%`, backgroundColor: 'var(--color-primary)' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '44px', textAlign: 'right', color: 'var(--color-primary)' }}>{cours.pourcentage}%</span>
                </summary>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {cours.sections.map((section) => (
                    <div key={section.id}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '8px' }}>
                        {section.titre}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {section.themes.map((theme) => {
                          const couleur = theme.maitrise ? 'var(--color-success)' : theme.score > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
                          return (
                            <div key={theme.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '14px', flex: '1 1 200px', color: 'var(--color-text-main)' }}>{theme.titre}</span>
                              <span style={{ fontSize: '12px', color: couleur }}>
                                {theme.maitrise ? 'Maîtrisé' : 'À renforcer'}
                              </span>
                              <div style={{ width: '90px', height: '6px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${theme.score}%`, backgroundColor: couleur }} />
                              </div>
                              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', minWidth: '40px', textAlign: 'right' }}>{theme.score}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {cours.pdfId && cours.themesMaitrises < cours.totalThemes && (
                    <a href={`/app/etude/${cours.pdfId}`} style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 600, alignSelf: 'flex-start' }}>
                      Retravailler ce cours →
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
          <p style={{ margin: '16px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Un thème est considéré maîtrisé à partir de {SEUIL_MAITRISE}% (forme et fond validés).
          </p>
        </Card>
      )}

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

