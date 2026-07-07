import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const coursId = searchParams.get('coursId');

    if (!coursId) {
      return NextResponse.json({ error: "ID de cours manquant" }, { status: 400 });
    }

    const { data: coursEtude, error } = await supabaseAdmin
      .from('etude_cours')
      .select('statut_generation')
      .eq('id', coursId)
      .single();

    if (error || !coursEtude) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    // Sécurité : Si c'est en attente, on s'assure que le worker tourne
    if (coursEtude.statut_generation === 'pending') {
      import('@/app/api/worker/process/route').then((m) => {
        m.runWorker().catch(() => {});
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: coursEtude.statut_generation 
    });

  } catch (error: any) {
    console.error("API Status Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 });
  }
}
