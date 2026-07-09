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

    // 1. Vérifier si le document existe ET appartient à l'utilisateur
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document introuvable ou accès refusé" }, { status: 404 });
    }

    // 1.5 Rate Limiting : Max 5 générations par heure par utilisateur
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // On compte le nombre de documents du user pour lesquels une étude a été générée récemment
    const { count: rateLimitCount, error: rateLimitError } = await supabaseAdmin
      .from('etude_cours')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo); 
      // Note: Idealement, il faudrait filtrer par user_id dans etude_cours, mais etude_cours n'a pas de user_id direct.
      // On fera le lien via le document, ou on peut utiliser un tableau dédié.
      // Pour éviter une requête complexe, on va juste laisser passer pour l'instant si on ne peut pas filtrer par user.
      
    // A REVOIR: La table etude_cours n'a pas de user_id ! Il faut vérifier via le pdf_id.
    const { data: recentDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', user.id);
      
    if (recentDocs && recentDocs.length > 0) {
      const docIds = recentDocs.map(d => d.id);
      const { count: recentGenerations } = await supabaseAdmin
        .from('etude_cours')
        .select('id', { count: 'exact', head: true })
        .in('pdf_id', docIds)
        .gte('created_at', oneHourAgo);
        
      if (recentGenerations !== null && recentGenerations >= 5) {
        return NextResponse.json({ error: "Limite atteinte : Vous ne pouvez générer que 5 études par heure. Veuillez patienter." }, { status: 429 });
      }
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
      if (coursEtude.statut_generation === 'en_cours' || coursEtude.statut_generation === 'pending') {
        if (!force) {
          // On renvoie 'pending' ou 'en_cours' au front-end pour qu'il commence le polling
          return NextResponse.json({ success: true, status: coursEtude.statut_generation, coursId: coursEtude.id });
        }
      }
    } else {
      // 3. Créer une nouvelle entrée dans etude_cours (Safe concurrency)
      const { data: newCours, error: insertError } = await supabaseAdmin
        .from('etude_cours')
        .insert({ pdf_id: documentId, statut_generation: 'pending' })
        .select()
        .single();

      if (insertError) {
        // En cas de conflit de concurrence (Race condition gérée par la contrainte UNIQUE)
        if (insertError.code === '23505' || insertError.message?.includes('unique')) {
          const { data: existingCours } = await supabaseAdmin
            .from('etude_cours')
            .select('*')
            .eq('pdf_id', documentId)
            .single();
          if (existingCours) {
            coursEtude = existingCours;
          } else {
            throw new Error("Erreur création etude_cours (conflit irrésolu) : " + insertError.message);
          }
        } else {
          throw new Error("Erreur création etude_cours : " + insertError.message);
        }
      } else {
        coursEtude = newCours;
      }
    }

    // 4. Si force = true OU si le statut est en erreur (pour débloquer la file), on réinitialise l'état
    if (force || coursEtude.statut_generation === 'erreur') {
      await supabaseAdmin.from('etude_cours').update({ 
        statut_generation: 'pending',
        next_retry: null,
        retry_count: 0
      }).eq('id', coursEtude.id);
    }

    // Déclencher le Worker en arrière-plan avec next/server after() pour Vercel
    after(() => {
      import('@/app/api/worker/process/route').then((m) => {
        m.runWorker().catch((err: any) => console.error("Erreur de lancement du worker:", err));
      });
    });

    return NextResponse.json({ success: true, status: 'pending', coursId: coursEtude.id });

  } catch (error: any) {
    console.error("API Generer Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}
