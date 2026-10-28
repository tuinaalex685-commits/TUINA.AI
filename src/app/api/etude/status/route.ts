import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveDocumentAccess } from '@/lib/access';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ancienne route de statut (plus appelée par l'interface, gardée pour les onglets restés ouverts).
// Elle lisait n'importe quel cours en service role : l'accès au document est désormais vérifié
// (propriétaire, ou cours du catalogue autorisé), comme partout ailleurs.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const coursId = new URL(req.url).searchParams.get('coursId');
    if (!coursId || !UUID_RE.test(coursId)) return NextResponse.json({ error: 'ID de cours manquant' }, { status: 400 });

    const { data: coursEtude } = await supabaseAdmin
      .from('etude_cours').select('statut_generation, pdf_id').eq('id', coursId).maybeSingle();
    // Même réponse pour « inexistant » et « pas à toi » : on ne révèle pas l'existence d'un cours.
    if (!coursEtude?.pdf_id || (await resolveDocumentAccess(supabaseAdmin, user.id, coursEtude.pdf_id)) === 'denied') {
      return NextResponse.json({ error: 'Cours introuvable' }, { status: 404 });
    }
    return NextResponse.json({ success: true, status: coursEtude.statut_generation });
  } catch (error) {
    console.error('API Status Etude Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 });
  }
}
