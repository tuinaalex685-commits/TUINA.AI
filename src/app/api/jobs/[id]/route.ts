import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Le worker relancé ci-dessous tourne dans CETTE fonction (via after) : même durée maximale que lui.
export const maxDuration = 300;

const IN_FLIGHT = new Set(['processing', 'generating', 'saving']);

// Observation d'un job par l'utilisateur (polling). RLS : ne renvoie que les jobs de l'appelant.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: job, error } = await supabase
    .from('ai_jobs')
    .select('id, status, error, result, type, progress, phase, last_error, next_attempt_at, lease_until')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 });

  // Auto-guérison : tant qu'un étudiant regarde son job, l'avancement ne dépend ni du cron
  // (quotidien sur l'offre Hobby) ni d'un relais perdu. On relance le worker si le job est
  // PRÊT à être pris (en attente et dû) ou ABANDONNÉ (bail expiré : fonction coupée).
  // after() garde la fonction en vie jusqu'à la fin du traitement : sans lui, le worker était
  // figé dès la réponse envoyée et le job restait bloqué « en cours ».
  const now = Date.now();
  const due = (job.status === 'pending' || job.status === 'queued') && (!job.next_attempt_at || Date.parse(job.next_attempt_at) <= now);
  const abandoned = IN_FLIGHT.has(job.status) && !!job.lease_until && Date.parse(job.lease_until) < now;
  if (due || abandoned) {
    after(async () => {
      const m = await import('@/app/api/worker/ai/route');
      await m.runAiWorker().catch(() => {});
    });
  }

  // Champs internes de planification non renvoyés au navigateur.
  const { next_attempt_at: _n, lease_until: _l, ...publicJob } = job;
  void _n; void _l;
  return NextResponse.json(publicJob, { headers: { 'Cache-Control': 'no-store' } });
}
