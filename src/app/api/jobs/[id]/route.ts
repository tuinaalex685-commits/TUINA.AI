import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { accesEtude } from '@/lib/etude3/store';

export const dynamic = 'force-dynamic';
// Le worker relancé ci-dessous tourne dans CETTE fonction (via after) : même durée maximale que lui.
export const maxDuration = 300;

const IN_FLIGHT = new Set(['processing', 'generating', 'saving']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Préparations COMMUNES de l'Étude guidée : un seul job par cours ou par leçon, que tous les
// étudiants du cours attendent ensemble (même s'il a été lancé par un autre).
const JOBS_PARTAGES = new Set(['etude3_analyse', 'etude3_sequence']);

// Une relance du worker par job toutes les 15 s au plus (par instance) : quand la file IA est
// pleine, des centaines d'étudiants qui attendent ne déclenchent pas des centaines de workers
// par seconde, qui n'auraient de toute façon aucune place.
const RELANCE_MS = 15_000;
const derniereRelance = new Map<string, number>();
function relanceAutorisee(jobId: string, now: number): boolean {
  const last = derniereRelance.get(jobId);
  if (last && now - last < RELANCE_MS) return false;
  derniereRelance.set(jobId, now);
  if (derniereRelance.size > 5000) {
    for (const [k, t] of derniereRelance) if (now - t > RELANCE_MS) derniereRelance.delete(k);
  }
  return true;
}

// Observation d'un job par l'utilisateur (polling). RLS : ne renvoie que les jobs de l'appelant.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  // Sans `result` : pendant une analyse, il contient l'état intermédiaire du moteur. Le renvoyer
  // toutes les 2,5 s coûtait des données mobiles à l'étudiant et du transfert à la base.
  const { data: own, error } = await supabase
    .from('ai_jobs')
    .select('id, status, error, type, progress, phase, last_error, next_attempt_at, lease_until')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  let job = own;
  let partage = false;
  if (!job) {
    // Job d'un autre étudiant (la RLS le cache) : visible seulement si c'est une préparation commune
    // d'Étude guidée ET que l'appelant a lui-même accès à ce cours. Jamais son résultat ni ses détails.
    const { data: autre } = await supabaseAdmin.from('ai_jobs')
      .select('id, status, error, type, progress, phase, last_error, next_attempt_at, lease_until, payload')
      .eq('id', id).maybeSingle();
    const documentId = String((autre?.payload as any)?.documentId || '');
    if (autre && JOBS_PARTAGES.has(autre.type) && UUID_RE.test(documentId) && (await accesEtude(user.id, user.email, documentId)).ok) {
      const { payload: _p, ...sansPayload } = autre;
      void _p;
      // Message d'échec générique : les détails techniques d'un job commun ne sont pas exposés.
      job = { ...sansPayload, last_error: null, error: autre.status === 'failed' ? 'La préparation n’a pas abouti. Réessaie dans un instant.' : null };
      partage = true;
    }
  }
  if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 });

  // Le résultat n'est lu qu'une fois, quand le job est terminé.
  let result: unknown = null;
  if (!partage && (job.status === 'completed' || job.status === 'done')) {
    const { data: done } = await supabase.from('ai_jobs').select('result').eq('id', id).maybeSingle();
    result = done?.result ?? null;
  }

  // Auto-guérison : tant qu'un étudiant regarde son job, l'avancement ne dépend ni du cron
  // (quotidien sur l'offre Hobby) ni d'un relais perdu. On relance le worker si le job est
  // PRÊT à être pris (en attente et dû) ou ABANDONNÉ (bail expiré : fonction coupée).
  // after() garde la fonction en vie jusqu'à la fin du traitement : sans lui, le worker était
  // figé dès la réponse envoyée et le job restait bloqué « en cours ».
  const now = Date.now();
  const due = (job.status === 'pending' || job.status === 'queued') && (!job.next_attempt_at || Date.parse(job.next_attempt_at) <= now);
  const abandoned = IN_FLIGHT.has(job.status) && !!job.lease_until && Date.parse(job.lease_until) < now;
  if ((due || abandoned) && relanceAutorisee(id, now)) {
    after(async () => {
      const m = await import('@/app/api/worker/ai/route');
      await m.runAiWorker().catch(() => {});
    });
  }

  // Champs internes de planification non renvoyés au navigateur.
  const { next_attempt_at: _n, lease_until: _l, ...publicJob } = job;
  void _n; void _l;
  return NextResponse.json({ ...publicJob, result }, { headers: { 'Cache-Control': 'no-store' } });
}
