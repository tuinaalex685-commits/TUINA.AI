import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExamCorrectionAction } from '@/app/actions/examen';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Correction | Tuina.ai' };

const TYPE_LABEL: Record<string, string> = {
  qcm: 'QCM', vrai_faux: 'Vrai / Faux', trous: 'Texte à trous', association: 'Association', classement: 'Classement',
};

export default async function CorrectionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const res = await getExamCorrectionAction(sessionId);
  if ('error' in res || !res.correction) redirect('/app/examen');
  const { note, documentId, questions } = res.correction;

  const justes = questions.filter((q) => q.correcte).length;

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%', maxWidth: 860, margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--spacing-large)' }}>
        <Link href="/app/examen" style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textDecoration: 'none' }}>← Retour aux examens</Link>
        <h1 style={{ margin: '8px 0 4px', color: 'var(--color-text-main)', fontSize: '28px' }}>Correction de l’examen</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Note : <strong style={{ color: 'var(--color-text-main)' }}>{note ?? '—'}/20</strong> · {justes}/{questions.length} question(s) entièrement juste(s).
        </p>
        {documentId && (
          <div style={{ marginTop: 12 }}>
            <Link href={`/app/examen/resultats/${documentId}`}>
              <Button variant="secondary" style={{ padding: '9px 16px' }}>Voir l’analyse par thème →</Button>
            </Link>
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
        {questions.map((q) => {
          const etat = q.correcte ? 'juste' : q.ratio > 0 ? 'partiel' : 'faux';
          const color = etat === 'juste' ? '#22c55e' : etat === 'partiel' ? '#f59e0b' : '#ef4444';
          const label = etat === 'juste' ? '✓ Juste' : etat === 'partiel' ? '≈ Partiel' : '✗ Faux';
          return (
            <Card key={q.position} style={{ borderLeft: `4px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Question {q.position + 1} · {TYPE_LABEL[q.type] || q.type} · {q.difficulte}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                  {label} · {q.points}/{q.pointsMax} pt
                </span>
              </div>
              <p style={{ margin: '0 0 14px', color: 'var(--color-text-main)', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{q.question}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '10px 12px', borderRadius: 8, background: q.correcte ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.07)', border: `1px solid ${q.correcte ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.18)'}` }}>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 3, fontWeight: 600 }}>Votre réponse</div>
                  <div style={{ color: 'var(--color-text-main)', fontSize: 14.5 }}>{q.votre}</div>
                </div>
                {!q.correcte && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 3, fontWeight: 600 }}>Bonne réponse</div>
                    <div style={{ color: 'var(--color-text-main)', fontSize: 14.5 }}>{q.bonne}</div>
                  </div>
                )}
              </div>

              {q.explication && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 13.5, lineHeight: 1.55 }}>
                  💡 {q.explication}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
