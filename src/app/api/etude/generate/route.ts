import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { documentId, force } = body;

    if (!documentId) {
      return NextResponse.json({ error: "ID de document manquant" }, { status: 400 });
    }

    // 1. Vérifier si le document existe
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    // 2. Vérifier si une génération existe déjà
    let { data: coursEtude } = await supabaseAdmin
      .from('etude_cours')
      .select('*')
      .eq('pdf_id', documentId)
      .single();

    if (coursEtude) {
      if (coursEtude.statut_generation === 'pret') {
        return NextResponse.json({ success: true, message: "Déjà généré", coursId: coursEtude.id, status: 'pret' });
      }
      if (coursEtude.statut_generation === 'en_cours' || coursEtude.statut_generation === 'en_attente') {
        if (!force) {
          // On renvoie 'en_attente' ou 'en_cours' au front-end pour qu'il commence le polling
          return NextResponse.json({ success: true, message: "Génération en cours", coursId: coursEtude.id, status: coursEtude.statut_generation });
        }
      }
    } else {
      // Créer l'entrée
      const { data: newCours, error: insertError } = await supabaseAdmin
        .from('etude_cours')
        .insert({ pdf_id: documentId, statut_generation: 'en_attente' })
        .select()
        .single();
        
      if (insertError) throw new Error(insertError.message);
      coursEtude = newCours;
    }

    // Mettre le statut en attente (pour le retry ou si nouveau)
    await supabaseAdmin.from('etude_cours').update({ statut_generation: 'en_attente' }).eq('id', coursEtude.id);

    // Déclencher le Worker en arrière-plan avec next/server after() pour Vercel
    after(() => {
      import('@/app/api/worker/process/route').then((m) => {
        m.runWorker().catch((err: any) => console.error("Erreur de lancement du worker:", err));
      });
    });

    // Réponse instantanée au Front-end
    return NextResponse.json({ success: true, status: 'en_attente', coursId: coursEtude.id });

  } catch (error: any) {
    console.error("API Generer Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}
