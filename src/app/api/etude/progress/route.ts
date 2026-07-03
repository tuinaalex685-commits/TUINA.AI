import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { action, coursId, sectionId, themeId, data } = body;

    switch (action) {
      case 'start_cours':
        if (!coursId) return NextResponse.json({ error: "coursId manquant" }, { status: 400 });
        const { error: errCours } = await supabase
          .from('etude_progression_cours')
          .upsert(
            { user_id: user.id, cours_id: coursId, statut: 'en_cours', updated_at: new Date().toISOString() },
            { onConflict: 'user_id,cours_id' }
          );
        if (errCours) throw new Error(errCours.message);
        break;

      case 'update_section':
        if (!sectionId) return NextResponse.json({ error: "sectionId manquant" }, { status: 400 });
        const { etat: etatSection } = data; // 'synthese_vue', 'themes_en_cours', 'cloture_reussie'
        const { error: errSection } = await supabase
          .from('etude_progression_sections')
          .upsert(
            { user_id: user.id, section_id: sectionId, etat: etatSection, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,section_id' }
          );
        if (errSection) throw new Error(errSection.message);
        break;

      case 'update_theme':
        if (!themeId) return NextResponse.json({ error: "themeId manquant" }, { status: 400 });
        const { forme_validee, fond_valide, increments } = data;
        
        // On récupère d'abord l'état actuel pour incrémenter si besoin
        let { data: currentTheme } = await supabase
          .from('etude_progression_themes')
          .select('*')
          .eq('user_id', user.id)
          .eq('theme_id', themeId)
          .single();

        let tentatives_forme = currentTheme?.tentatives_forme || 0;
        let tentatives_fond = currentTheme?.tentatives_fond || 0;

        if (increments?.tentative_forme) tentatives_forme += 1;
        if (increments?.tentative_fond) tentatives_fond += 1;

        const { error: errTheme } = await supabase
          .from('etude_progression_themes')
          .upsert(
            { 
              user_id: user.id, 
              theme_id: themeId, 
              forme_validee: forme_validee ?? currentTheme?.forme_validee ?? false,
              fond_valide: fond_valide ?? currentTheme?.fond_valide ?? false,
              tentatives_forme,
              tentatives_fond,
              updated_at: new Date().toISOString() 
            },
            { onConflict: 'user_id,theme_id' }
          );
        if (errTheme) throw new Error(errTheme.message);
        break;

      default:
        return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("API Progress Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 });
  }
}
