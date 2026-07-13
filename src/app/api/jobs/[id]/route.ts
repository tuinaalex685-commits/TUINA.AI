import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Observation d'un job par l'utilisateur (polling). RLS : ne renvoie que les jobs de l'appelant.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: job, error } = await supabase
    .from('ai_jobs')
    .select('id, status, error, result, type, progress, phase, last_error')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 });

  // Auto-guérison : si le job attend (pending), tout observateur actif relance le worker (best-effort).
  // Garantit l'avancement même si le déclenchement initial a été tué (navigateur fermé) — le cron reste
  // le filet de sécurité. Jamais bloquant pour la réponse.
  if (job.status === 'pending' || job.status === 'queued') {
    import('@/app/api/worker/ai/route').then((m) => m.runAiWorker().catch(() => {})).catch(() => {});
  }

  return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } });
}
