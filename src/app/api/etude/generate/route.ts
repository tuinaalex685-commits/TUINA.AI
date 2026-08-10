import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isPremium } from '@/lib/plan';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ACTIVE = ['pending', 'processing', 'generating', 'saving', 'queued'];

// Génération d'une Étude Guidée = job IA unifié (type 'etude'). Le résultat durable reste dans
// etude_cours/sections/themes ; ce endpoint ne fait qu'ENQUEUE puis renvoyer un jobId à observer.
// Ne bloque jamais sur Gemini. Idempotent : réutilise un job actif ou un cours déjà prêt.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { documentId, force } = await req.json();
    if (!documentId) return NextResponse.json({ error: "ID de document manquant" }, { status: 400 });

    // 1. Appartenance stricte du document (filtre user_id explicite, indépendant de la RLS).
    const { data: document } = await supabaseAdmin
      .from('documents').select('id').eq('id', documentId).eq('user_id', user.id).maybeSingle();
    if (!document) return NextResponse.json({ error: "Document introuvable ou accès refusé" }, { status: 404 });

    // 2. Déjà généré et prêt → ouverture instantanée (aucun job).
    const { data: cours } = await supabaseAdmin
      .from('etude_cours').select('id, statut_generation').eq('pdf_id', documentId).maybeSingle();
    if (cours && cours.statut_generation === 'pret' && !force) {
      const { count } = await supabaseAdmin.from('etude_sections').select('id', { count: 'exact', head: true }).eq('cours_id', cours.id);
      if ((count || 0) > 0) {
        return NextResponse.json({ success: true, status: 'completed', coursId: cours.id, jobId: null });
      }
    }

    // 3. Rate limiting : max 5 générations Étude par heure par utilisateur (via ai_jobs).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from('ai_jobs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('type', 'etude').gte('created_at', oneHourAgo);
    if ((recent || 0) >= 5 && !force) {
      return NextResponse.json({ error: "Limite atteinte : 5 études par heure maximum. Réessayez plus tard." }, { status: 429 });
    }

    // 4. Idempotence : un job Étude déjà actif pour CE document → on le réutilise (pas de doublon).
    const { data: existing } = await supabaseAdmin
      .from('ai_jobs').select('id, status')
      .eq('user_id', user.id).eq('type', 'etude')
      .filter('payload->>documentId', 'eq', documentId)
      .in('status', ACTIVE)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing && !force) {
      triggerWorker(req);
      return NextResponse.json({ success: true, status: existing.status, jobId: existing.id, coursId: cours?.id ?? null });
    }

    // 5. FREE : 1 import personnel gratuit à vie. On n'atteint ce point que pour un document
    // qui n'a JAMAIS eu de cours généré (cours introuvable à l'étape 2) — un "force" sur un cours
    // déjà existant (V1→V2) ne consomme pas une seconde fois l'allocation.
    const isNewDocument = !cours;
    let premium: boolean | null = null;
    if (isNewDocument) {
      premium = await isPremium(supabase, user.email);
      if (!premium) {
        const { data: role } = await supabaseAdmin
          .from('user_roles').select('free_import_used').eq('user_id', user.id).maybeSingle();
        if (role?.free_import_used) {
          return NextResponse.json({ error: "Vous avez déjà utilisé votre import personnel gratuit. Passez Premium pour importer d'autres cours." }, { status: 403 });
        }
      }
    }

    // 6. Enqueue d'un nouveau job.
    const { data: job, error } = await supabaseAdmin
      .from('ai_jobs')
      .insert({ user_id: user.id, type: 'etude', status: 'pending', payload: { documentId } })
      .select('id').single();
    if (error || !job) return NextResponse.json({ error: error?.message || "Création du job impossible" }, { status: 500 });

    if (isNewDocument && premium === false) {
      await supabaseAdmin.from('user_roles').update({ free_import_used: true }).eq('user_id', user.id);
    }

    triggerWorker(req);
    return NextResponse.json({ success: true, status: 'pending', jobId: job.id, coursId: cours?.id ?? null });

  } catch (error: any) {
    console.error("API Generer Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}

// Réveil immédiat du worker unifié (best-effort). Le cron /api/worker/ai garantit le traitement sinon.
function triggerWorker(req: NextRequest) {
  try {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host');
    if (host) fetch(`${proto}://${host}/api/worker/ai`, { method: 'POST', headers: { 'x-worker-secret': process.env.CRON_SECRET || '' } }).catch(() => {});
  } catch { /* non bloquant */ }
}
