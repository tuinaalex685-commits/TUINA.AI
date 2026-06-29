import { NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { streamStructuredJSON } from '@/lib/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "ID de rédaction manquant." }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    const { data: redaction, error: fetchError } = await supabase
      .from('redactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !redaction || !redaction.contenu) {
      return NextResponse.json({ error: "Rédaction introuvable ou vide." }, { status: 404 });
    }

    // Schéma de base commun
    const baseProperties: any = {
      points_forts: { type: Type.ARRAY, items: { type: Type.STRING } },
      points_faibles: { type: Type.ARRAY, items: { type: Type.STRING } },
      axes_amelioration: { type: Type.ARRAY, items: { type: Type.STRING } },
      note_globale: { type: Type.STRING, description: "Note sur 20 avec courte appréciation" }
    };
    
    let propositionSchema: any = {};
    let systemInstruction = `Tu es un correcteur strict en droit. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.`;

    // Personnalisation selon le type
    if (redaction.type === 'Dissertation') {
      systemInstruction += ` En plus de l'analyse, fournis une 'proposition' contenant un exemple d'introduction complète, un plan détaillé (uniquement les titres I, A, B, etc. sans rédiger le développement), et une conclusion synthétique. Ne rédige SURTOUT PAS le développement complet.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          introduction: { type: Type.STRING, description: "Exemple d'introduction modèle" },
          plan_detaille: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Titres du plan (ex: I. Titre, A. Sous-titre)" },
          conclusion: { type: Type.STRING, description: "Exemple de conclusion synthétique" }
        },
        required: ["introduction", "plan_detaille", "conclusion"]
      };
    } else if (redaction.type === 'Commentaire d\'arrêt') {
      systemInstruction += ` En plus de l'analyse, fournis une 'proposition' contenant un exemple d'introduction adaptée, une méthode d'analyse rapide, un plan détaillé du commentaire, et une conclusion. Ne rédige SURTOUT PAS le développement complet.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          introduction: { type: Type.STRING, description: "Exemple d'introduction adaptée" },
          methode_analyse: { type: Type.STRING, description: "Méthode d'analyse recommandée" },
          plan_detaille: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Plan détaillé du commentaire" },
          conclusion_synthetique: { type: Type.STRING, description: "Conclusion synthétique" }
        },
        required: ["introduction", "methode_analyse", "plan_detaille", "conclusion_synthetique"]
      };
    } else if (redaction.type === 'Cas pratique') {
      systemInstruction += ` En plus de l'analyse, fournis une 'proposition' montrant la démarche attendue (syllogisme) : qualification des faits, problèmes juridiques, règles applicables, application, et conclusion. Ne rédige pas entièrement tout le cas, montre la méthode.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          qualification_faits: { type: Type.STRING, description: "Qualification juridique des faits" },
          problemes_juridiques: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Problèmes de droit soulevés" },
          regles_applicables: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Règles de droit pertinentes" },
          application_cas: { type: Type.STRING, description: "Application des règles aux faits" },
          conclusion_juridique: { type: Type.STRING, description: "Conclusion du cas pratique" }
        },
        required: ["qualification_faits", "problemes_juridiques", "regles_applicables", "application_cas", "conclusion_juridique"]
      };
    } else {
      // Cas générique
      systemInstruction += ` Fournis également une brève proposition de correction pédagogique globale.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          correction_globale: { type: Type.STRING, description: "Exemple pédagogique ou piste de correction" }
        },
        required: ["correction_globale"]
      };
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        ...baseProperties,
        proposition: propositionSchema
      },
      required: ["points_forts", "points_faibles", "axes_amelioration", "note_globale", "proposition"]
    };

    const prompt = `TYPE DE DEVOIR : ${redaction.type}\n\nRÉDACTION DE L'ÉTUDIANT :\n${redaction.contenu}`;

    const { generateStructuredJSON } = await import('@/lib/gemini');
    const result = await generateStructuredJSON(systemInstruction, prompt, schema);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error("Redaction Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
