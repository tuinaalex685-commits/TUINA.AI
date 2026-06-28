import { NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { streamStructuredJSON } from '@/lib/gemini';

export const maxDuration = 60;
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

    const schema = {
      type: Type.OBJECT,
      properties: {
        points_forts: { type: Type.ARRAY, items: { type: Type.STRING } },
        points_faibles: { type: Type.ARRAY, items: { type: Type.STRING } },
        axes_amelioration: { type: Type.ARRAY, items: { type: Type.STRING } },
        note_globale: { type: Type.STRING, description: "Note sur 20 avec courte appréciation" }
      },
      required: ["points_forts", "points_faibles", "axes_amelioration", "note_globale"]
    };

    const systemInstruction = `Tu es un correcteur strict. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.`;
    const prompt = `TYPE DE DEVOIR : ${redaction.type}\n\nRÉDACTION DE L'ÉTUDIANT :\n${redaction.contenu}`;

    const { generateStructuredJSON } = await import('@/lib/gemini');
    const result = await generateStructuredJSON(systemInstruction, prompt, schema);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error("Redaction Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
