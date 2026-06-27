import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60; // Just in case, though Vercel might cut it, streaming helps bypass the strict timeout
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { documentId, coursName, coursId, type, count } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API Gemini non configurée." }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    let text = "";
    let instruction = "";

    if (documentId !== 'dummy') {
      const { data: docData } = await supabase.from('documents').select('texte').eq('id', documentId).single();
      if (docData && docData.texte) {
        text = docData.texte;
      }
    }

    if (type === 'qcm') {
      instruction = `Génère ${count} questions à choix multiples (QCM). Fournis 4 options par question et indique l'index de la bonne réponse.`;
    } else if (type === 'vrai_faux') {
      instruction = `Génère ${count} affirmations. L'étudiant devra répondre Vrai ou Faux.`;
    } else if (type === 'juridique') {
      instruction = `Génère ${count} petits cas pratiques juridiques.`;
    } else {
      instruction = `Génère ${count} questions ouvertes.`;
    }


    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Tu es un examinateur en droit exigeant. ${instruction}\n\nIMPORTANT: Tu DOIS générer un JSON valide (un tableau d'objets). Ne rajoute aucun texte avant ou après.
Format attendu :
[
  {
    "id": 1,
    "question": "...",
    ${type === 'qcm' || type === 'vrai_faux' ? '"options": ["...", "..."],\n    "correctAnswer": 0,\n    "explication": "..."' : '"expectedAnswer": "..."'}
  }
]`;
    const prompt = text ? `Base-toi strictement sur ce cours :\n\n${text}` : "Base-toi strictement sur ce document.";

    const stream = await ai.models.generateContentStream({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
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
    console.error("Evaluate Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
