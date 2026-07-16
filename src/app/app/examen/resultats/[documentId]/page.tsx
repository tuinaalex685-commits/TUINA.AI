import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExamResults } from '@/app/actions/examen';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { SEUIL_MAITRISE } from '@/lib/config/mastery';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats d’examen | Tuina.ai' };

function Barre({ score }: { score: number | null }) {
  const val = score ?? 0;
  const color = score === null ? 'var(--color-border)' : val >= SEUIL_MAITRISE ? '#22c55e' : val >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ height: 8, borderRadius: 6, background: 'var(--color-bg-secondary)', overflow: 'hidden', minWidth: 90 }}>
      <div style={{ width: `${val}%`, height: '100%', background: color }} />
    </div>
  );
}

export default async function ResultatsPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const res = await getExamResults(documentId);
  if ('error' in res || !res.analyse) redirect('/app/examen');
  const a = res.analyse;
  const r = a.resume;

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%', maxWidth: 860, margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--spacing-large)' }}>
        <Link href="/app/examen" style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textDecoration: 'none' }}>← Retour aux examens</Link>
        <h1 style={{ margin: '8px 0 0', color: 'var(--color-text-main)', fontSize: '28px' }}>Analyse par thème</h1>
        {r.derniereSessionId && (
          <div style={{ marginTop: 12 }}>
            <Link href={`/app/examen/correction/${r.derniereSessionId}`}>
              <Button style={{ padding: '9px 16px' }}>📝 Voir la correction détaillée (dernier examen)</Button>
            </Link>
          </div>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--spacing-standard)', marginBottom: 'var(--spacing-large)' }}>
        <Stat label="Dernière note" value={r.derniereNote !== null ? `${r.derniereNote}/20` : '—'} />
        <Stat label="Meilleure note" value={r.meilleureNote !== null ? `${r.meilleureNote}/20` : '—'} />
        <Stat label="Examens passés" value={String(r.nbExamens)} />
        <Stat label="Thèmes maîtrisés" value={`${r.nbMaitrises}/${r.nbThemes}`} />
      </div>

      {r.coursMaitrise && (
        <Card style={{ marginBottom: 'var(--spacing-standard)', borderLeft: '4px solid #22c55e' }}>
          <strong style={{ color: 'var(--color-text-main)' }}>🎉 Vous maîtrisez ce cours.</strong>
          <p style={{ margin: '6px 0 12px', color: 'var(--color-text-secondary)' }}>Tous les thèmes sont au niveau requis. C’est le bon moment pour vous entraîner à la Rédaction.</p>
          <Link href="/app/redaction"><Button style={{ padding: '10px 18px' }}>Aller à la Rédaction</Button></Link>
        </Card>
      )}

      {a.faiblesTestes.length > 0 && (
        <Card style={{ marginBottom: 'var(--spacing-standard)', borderLeft: '4px solid #f59e0b' }}>
          <strong style={{ color: 'var(--color-text-main)' }}>À retravailler en priorité</strong>
          <p style={{ margin: '6px 0 12px', color: 'var(--color-text-secondary)' }}>
            Ces thèmes sont en dessous du seuil de maîtrise ({SEUIL_MAITRISE}%). Revoyez-les dans l’Étude Guidée avant de repasser un examen.
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--color-text-main)' }}>
            {a.faiblesTestes.map((t) => <li key={`${t.section_ordre}:${t.theme_ordre}`}>{t.theme_titre} <span style={{ color: 'var(--color-text-secondary)' }}>({t.score}%)</span></li>)}
          </ul>
          <Link href={`/app/etude/${a.pdfId}`}><Button variant="secondary" style={{ padding: '10px 18px' }}>Retravailler dans l’Étude</Button></Link>
        </Card>
      )}

      <Card>
        <h3 style={{ margin: '0 0 16px', color: 'var(--color-text-main)', fontSize: '18px' }}>Maîtrise de chaque thème</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {a.themes.map((t) => (
            <div key={`${t.section_ordre}:${t.theme_ordre}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 240px', color: 'var(--color-text-main)' }}>
                {t.theme_titre}
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}> · {t.section_titre}</span>
              </span>
              <Barre score={t.score} />
              <span style={{ width: 90, textAlign: 'right', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {t.score === null ? 'Non testé' : `${t.score}%`}{t.maitrise ? ' ✅' : ''}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-main)' }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{label}</div>
    </Card>
  );
}
