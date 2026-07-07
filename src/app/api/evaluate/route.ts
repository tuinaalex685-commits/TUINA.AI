import { NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { streamStructuredJSON } from '@/lib/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, count, coursId } = body;

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

    if (!coursId) {
      return NextResponse.json({ error: "coursId est requis." }, { status: 400 });
    }

    // 3. Récupération du Document et de son Intelligence
    const { data: coursData, error: coursError } = await supabase
      .from('cours')
      .select('document_id')
      .eq('id', coursId)
      .single();

    if (coursError || !coursData?.document_id) {
       return NextResponse.json({ error: "Cours ou document associé introuvable." }, { status: 404 });
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, url_fichier, intelligence_pedagogique')
      .eq('id', coursData.document_id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    }

    let intelligence = document.intelligence_pedagogique;

    // --- FETCH PDF POUR L'ÉVALUATION ---
    let pdfBase64 = "";
    let buffer: Buffer | null = null;
    try {
      const response = await fetch(document.url_fichier);
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      pdfBase64 = buffer.toString('base64');
    } catch (e) {
      console.warn("Impossible de récupérer le PDF source pour l'évaluation", e);
    }

    // --- JUST-IN-TIME INTELLIGENCE ---
    if (!intelligence && buffer) {
      console.log(`[API EVALUATE] Just-In-Time Intelligence pour le document ${document.id}`);
      
      // @ts-ignore
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      
      if (pdfData.numpages <= 100) {
        const text = pdfData.text;

        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const { JIT_INTELLIGENCE_SCHEMA, getJitIntelligencePrompt } = await import('@/lib/prompts/pedagogicalEngine');
        
        const aiResponse = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: getJitIntelligencePrompt(text.substring(0, 80000)),
          config: {
            responseMimeType: 'application/json',
            responseSchema: JIT_INTELLIGENCE_SCHEMA,
            temperature: 0.2
          }
        });
        
        const generatedData = JSON.parse(aiResponse.text || "{}");
        if (generatedData && generatedData.intelligence_pedagogique) {
          intelligence = {
            ...generatedData.intelligence_pedagogique,
            strategie_pedagogique_sur_mesure: generatedData.strategie_pedagogique_sur_mesure
          };
          // Sauvegarder en DB pour les futurs appels
          await supabase.from('documents').update({ intelligence_pedagogique: intelligence }).eq('id', document.id);
        }
      }
    }
    // ---------------------------------

    console.log(`[API EVALUATE] Génération de ${safeCount} questions de type ${type} pour User: ${user.id} (JIT Ok)`);

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

    const systemInstruction = `Tu es un Professeur d'Université en Droit (Maître de Conférences) redoutable. Ton but n'est pas de faire un simple quiz, mais de concevoir un sujet d'examen exigeant.
    RÈGLE 1: Avant de créer une question, identifie les pièges du cours, les exceptions, et les notions qui se ressemblent (distinctions doctrinales). Tes questions doivent cibler ces zones de confusion.
    RÈGLE 2: Interdiction absolue de poser des questions de définition simples. Utilise des qualifications juridiques, des phrases à compléter avec des termes précis, ou des recherches de l'exception manquante.
    RÈGLE 3: Les mauvaises réponses (les distracteurs) ne doivent pas être absurdes. Elles doivent correspondre aux erreurs classiques et logiques des étudiants (ex: confondre deux termes proches).
    RÈGLE 4: Dans le champ 'explication', tu ne dois pas te contenter de dire "La bonne réponse est X". Tu dois expliquer POURQUOI les mauvaises réponses étaient des pièges logiques, quelle est la règle de droit exacte, et comment l'étudiant peut éviter cette confusion à l'examen.
    
    Tâche : ${instruction}`;
    
    const intelligenceContext = intelligence ? `\n\nVoici l'intelligence pédagogique extraite du document (erreurs fréquentes, pièges, notions fondamentales) sur laquelle tu DOIS baser tes questions :\n${JSON.stringify(intelligence, null, 2)}` : "";
    const prompt = `Analyse le document fourni comme un professeur préparant ses partiels, repère les notions fondamentales et les pièges, puis génère l'évaluation strictement basée sur ce document.${intelligenceContext}`;

    return await streamStructuredJSON(systemInstruction, prompt, schema, pdfBase64, req.signal);

  } catch (err: any) {
    console.error("Evaluate Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
