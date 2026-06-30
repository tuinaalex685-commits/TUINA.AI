import { NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { streamStructuredJSON } from '@/lib/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, count, text, pdfBase64 } = body;

    // 1. Authentification
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authData?.user) {
      console.warn(`[SECURITY] Tentative d'accès non autorisé à l'API d'évaluation`);
      return NextResponse.json({ error: "Non autorisé. Veuillez vous connecter." }, { status: 401 });
    }
    const user = authData.user;

    // 2. Validation stricte des entrées
    const validTypes = ['qcm', 'vrai_faux', 'juridique', 'ouvertes', 'quiz'];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json({ error: "Type d'évaluation invalide." }, { status: 400 });
    }

    const safeCount = Number(count);
    if (isNaN(safeCount) || safeCount <= 0 || safeCount > 20) {
      console.warn(`[SECURITY] Paramètre count abusif (${count}) bloqué pour User: ${user.id}`);
      return NextResponse.json({ error: "Le nombre de questions doit être compris entre 1 et 20." }, { status: 400 });
    }
    
    console.log(`[API EVALUATE] Génération de ${safeCount} questions de type ${type} pour User: ${user.id}`);

    let schemaTypeProps: any = {};
    let instruction = "";

    if (type === 'qcm') {
      instruction = `Génère ${safeCount} questions à choix multiples (4 options, 1 seule bonne réponse).`;
      schemaTypeProps = {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswer: { type: Type.INTEGER, description: "Index de la bonne réponse (0 à 3)" },
        explication: { type: Type.STRING }
      };
    } else if (type === 'vrai_faux') {
      instruction = `Génère ${safeCount} affirmations. L'étudiant devra répondre Vrai ou Faux.`;
      schemaTypeProps = {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswer: { type: Type.INTEGER, description: "Index (0 pour Vrai, 1 pour Faux)" },
        explication: { type: Type.STRING }
      };
    } else if (type === 'juridique') {
      instruction = `Génère ${safeCount} petits cas pratiques juridiques.`;
      schemaTypeProps = {
        question: { type: Type.STRING, description: "Le cas pratique court" },
        expectedAnswer: { type: Type.STRING, description: "La solution juridique attendue avec fondement" }
      };
    } else {
      instruction = `Génère ${safeCount} questions ouvertes.`;
      schemaTypeProps = {
        question: { type: Type.STRING },
        expectedAnswer: { type: Type.STRING, description: "Les mots clés ou l'idée principale attendue" }
      };
    }

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { id: { type: Type.INTEGER }, ...schemaTypeProps },
        required: ["id", "question", type === 'qcm' || type === 'vrai_faux' ? "options" : "expectedAnswer"]
      }
    };

    const systemInstruction = `Tu es un examinateur en droit exigeant. ${instruction}`;
    const prompt = text ? `Base-toi strictement sur ce cours :\n\n${text}` : "Base-toi strictement sur ce document.";

    return await streamStructuredJSON(systemInstruction, prompt, schema, pdfBase64, req.signal);

  } catch (err: any) {
    console.error("Evaluate Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
