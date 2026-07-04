import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient } from '@/lib/supabase/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    correct: { type: Type.BOOLEAN, description: "True si l'utilisateur a compris l'essentiel, False s'il a faux ou s'il est hors sujet." },
    explication: { type: Type.STRING, description: "Explication pédagogique de la correction, bienveillante et encourageante." },
    nouveau_cas: {
      type: Type.OBJECT,
      nullable: true,
      description: "Si correct est false, générer un TOUT NOUVEAU cas pratique (situation différente) sur le même concept pour retenter sa chance. Si correct est true, renvoyer null.",
      properties: {
        situation: { type: Type.STRING, description: "Une nouvelle situation concrète." },
        question: { type: Type.STRING, description: "La question posée à l'étudiant." },
        reponse_attendue_ou_choix: { type: Type.STRING, description: "La réponse idéale attendue par le correcteur." }
      },
      required: ["situation", "question", "reponse_attendue_ou_choix"]
    }
  },
  required: ["correct", "explication"]
} as Schema;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { themeTitre, themeExplication, situation, question, expectedAnswer, userAnswer } = await req.json();

    if (!userAnswer || !situation) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const prompt = `Tu es un professeur d'université bienveillant et pédagogue.
Concept enseigné : "${themeTitre}"
Explication du concept : "${themeExplication}"

Cas pratique / Exercice soumis à l'étudiant : 
Situation : "${situation}"
Question posée : "${question}"
Réponse idéale attendue : "${expectedAnswer}"

Réponse de l'étudiant : "${userAnswer}"

Ta tâche :
1. ANALYSER LA NATURE DU CONCEPT : Détermine si ce concept nécessite une approche juridique stricte (règle, faits, conclusion) ou une approche théorique/historique.
2. ÉVALUER (correct: true/false) AVEC INDULGENCE : 
   - L'étudiant est en apprentissage. S'il a compris l'idée générale ou mentionné des éléments corrects, valide sa réponse (correct: true). 
   - Ne le sanctionne pas (correct: false) juste parce que sa réponse est incomplète ou succincte.
   - S'il s'agit d'un cas pratique juridique, vérifie qu'il a fait un effort d'argumentation (pas juste donner la solution), mais sois tolérant sur la perfection du syllogisme.
   - Mets correct: false UNIQUEMENT s'il est totalement hors sujet, s'il dit le contraire de la vérité, ou s'il n'argumente pas du tout (ex: "oui c'est ça" sans aucune justification).
3. EXPLIQUER : Fournis une explication pédagogique et encourageante. Si sa réponse était juste mais incomplète, félicite-le d'abord, puis ajoute les nuances ou détails qu'il a oubliés.
4. GÉNÉRER UN NOUVEAU CAS (nouveau_cas) OBLIGATOIREMENT si la réponse est fausse (correct: false). Invente une nouvelle situation totalement différente testant le même concept. Si correct: true, nouveau_cas doit être null.`;

    const aiResponse = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.3
      }
    });

    const generatedData = JSON.parse(aiResponse.text || "{}");

    return NextResponse.json(generatedData);

  } catch (error: any) {
    console.error("Erreur Evaluate API:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}
