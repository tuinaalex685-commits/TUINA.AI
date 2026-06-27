import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body; // The ID of the redaction to analyze

    if (!id) return NextResponse.json({ error: "ID de rédaction manquant." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API Gemini non configurée." }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Fetch the redaction
    const { data: redaction, error: fetchError } = await supabase
      .from('redactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !redaction || !redaction.contenu) {
      return NextResponse.json({ error: "Rédaction introuvable ou vide." }, { status: 404 });
    }

    const ai = new GoogleGenAI({ apiKey });

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

    const stream = await ai.models.generateContentStream({
      model: 'gemini-1.5-flash',
      contents: `TYPE DE DEVOIR : ${redaction.type}\n\nRÉDACTION DE L'ÉTUDIANT :\n${redaction.contenu}`,
      config: {
        systemInstruction: "Tu es un correcteur juridique strict. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.",
        responseMimeType: 'application/json',
        responseSchema: schema,
      }
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(chunk.text);
            }
          }
        } catch (e: any) {
          console.error("Stream error:", e);
          controller.enqueue(JSON.stringify({ error: e.message }));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (err: any) {
    console.error("Redaction Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
