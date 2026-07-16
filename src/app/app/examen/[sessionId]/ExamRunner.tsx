"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { saveExamAnswer, submitExam } from '@/app/actions/examen';

interface VueQuestion {
  position: number;
  type: 'qcm' | 'vrai_faux' | 'trous' | 'association' | 'classement';
  difficulte: string;
  question: string;
  options?: string[];
  gauches?: string[];
  droites?: string[];
  elements?: string[];
  nbTrous?: number;
}
interface View {
  sessionId: string;
  status: string;
  mode?: string;
  remainingSeconds: number;
  questions: VueQuestion[];
  answers: Record<string, any>;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ExamRunner({ sessionId, initialView }: { sessionId: string; initialView: View }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, any>>(initialView.answers || {});
  const [remaining, setRemaining] = useState<number>(initialView.remainingSeconds);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const finish = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const id = toast.loading('Correction de votre examen…');
    const res = await submitExam(sessionId);
    if ((res as any).error) {
      toast.error((res as any).error, { id });
      setSubmitting(false);
      submittedRef.current = false;
      return;
    }
    toast.success(`Examen terminé — note : ${(res as any).note}/20`, { id });
    const docId = (res as any).documentId;
    router.push(docId ? `/app/examen/resultats/${docId}` : '/app/examen');
    router.refresh();
  }, [sessionId, router]);

  // Chrono client (cosmétique) : la deadline fait autorité côté serveur. Décompte pur.
  useEffect(() => {
    if (initialView.status !== 'in_progress') return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [initialView.status]);

  // À 0 → soumission auto (déférée hors du rendu et de l'updater : jamais de setState pendant le rendu).
  useEffect(() => {
    if (initialView.status !== 'in_progress' || remaining > 0) return;
    const id = setTimeout(() => { void finish(); }, 0);
    return () => clearTimeout(id);
  }, [remaining, initialView.status, finish]);

  // Déjà soumis (reload d'une session terminée) → on redirige vers les résultats.
  useEffect(() => {
    if (initialView.status === 'submitted') router.replace('/app/examen');
  }, [initialView.status, router]);

  const save = useCallback((position: number, answer: any) => {
    setAnswers((prev) => ({ ...prev, [String(position)]: answer }));
    // Auto-save serveur (idempotent, fire-and-forget ; rejeté proprement après la deadline).
    saveExamAnswer(sessionId, position, answer).catch(() => {});
  }, [sessionId]);

  const answered = initialView.questions.filter((q) => answers[String(q.position)] !== undefined).length;
  const total = initialView.questions.length;

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%', maxWidth: 800, margin: '0 auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', marginBottom: 'var(--spacing-standard)', borderRadius: '12px',
        background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
      }}>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {initialView.mode === 'adaptatif' && (
            <span style={{ fontSize: '12px', padding: '3px 9px', borderRadius: '20px', background: 'rgba(99,102,241,0.12)', color: 'var(--color-primary)', fontWeight: 600 }}>🎯 Adaptatif</span>
          )}
          Répondu : <strong style={{ color: 'var(--color-text-main)' }}>{answered}/{total}</strong>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: remaining <= 60 ? 'var(--color-error)' : 'var(--color-text-main)' }}>
          ⏱️ {fmt(remaining)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
        {initialView.questions.map((q) => (
          <Card key={q.position}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Question {q.position + 1} · {q.difficulte}
              </span>
            </div>
            <p style={{ margin: '0 0 16px', color: 'var(--color-text-main)', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{q.question}</p>
            <QuestionInput q={q} value={answers[String(q.position)]} disabled={submitting} onChange={(a) => save(q.position, a)} />
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 'var(--spacing-large)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={finish} disabled={submitting} style={{ padding: '12px 28px' }}>
          {submitting ? 'Correction…' : 'Terminer et remettre'}
        </Button>
      </div>
    </div>
  );
}

function QuestionInput({ q, value, disabled, onChange }: { q: VueQuestion; value: any; disabled: boolean; onChange: (a: any) => void }) {
  if (q.type === 'qcm') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(q.options || []).map((opt, i) => (
          <Choice key={i} selected={value === opt} disabled={disabled} onClick={() => onChange(opt)}>{opt}</Choice>
        ))}
      </div>
    );
  }
  if (q.type === 'vrai_faux') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {['Vrai', 'Faux'].map((lbl, i) => (
          <Choice key={i} selected={value === i} disabled={disabled} onClick={() => onChange(i)} style={{ flex: 1, textAlign: 'center' }}>{lbl}</Choice>
        ))}
      </div>
    );
  }
  if (q.type === 'trous') {
    const arr: string[] = Array.isArray(value) ? value : Array((q.nbTrous || 1)).fill('');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: q.nbTrous || 1 }).map((_, i) => (
          <input key={i} type="text" disabled={disabled} value={arr[i] || ''} placeholder={`Réponse ${i + 1}`}
            onChange={(e) => { const next = arr.slice(); next[i] = e.target.value; onChange(next); }}
            style={inputStyle} />
        ))}
      </div>
    );
  }
  if (q.type === 'association') {
    const arr: string[] = Array.isArray(value) ? value : Array((q.gauches || []).length).fill('');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(q.gauches || []).map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ flex: 1, color: 'var(--color-text-main)' }}>{g}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
            <select disabled={disabled} value={arr[i] || ''} onChange={(e) => { const next = arr.slice(); next[i] = e.target.value; onChange(next); }} style={{ ...inputStyle, flex: 1 }}>
              <option value="">— choisir —</option>
              {(q.droites || []).map((d, j) => <option key={j} value={d}>{d}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'classement') {
    const order: string[] = Array.isArray(value) && value.length ? value : (q.elements || []);
    const move = (i: number, dir: -1 | 1) => {
      const next = order.slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {order.map((el, i) => (
          <div key={el} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-main)' }}>
            <span style={{ color: 'var(--color-text-secondary)', width: 20 }}>{i + 1}.</span>
            <span style={{ flex: 1, color: 'var(--color-text-main)' }}>{el}</span>
            <button disabled={disabled || i === 0} onClick={() => move(i, -1)} style={arrowStyle} aria-label="Monter">↑</button>
            <button disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} style={arrowStyle} aria-label="Descendre">↓</button>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function Choice({ selected, disabled, onClick, children, style }: { selected: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div onClick={() => !disabled && onClick()} style={{
      padding: '12px 14px', borderRadius: '8px', cursor: disabled ? 'default' : 'pointer',
      border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
      background: selected ? 'rgba(99,102,241,0.08)' : 'var(--color-bg-main)',
      color: 'var(--color-text-main)', transition: 'all .15s', ...style,
    }}>{children}</div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)',
  background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontSize: '15px',
};
const arrowStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '6px', border: '1px solid var(--color-border)',
  background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', cursor: 'pointer',
};
