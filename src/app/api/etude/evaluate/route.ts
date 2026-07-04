import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60; // 60s max for AI
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

    const prompt = `Tu es un professeur d'université très exigeant sur la méthodologie.
Concept enseigné : "${themeTitre}"
Explication du concept : "${themeExplication}"

Cas pratique / Exercice soumis à l'étudiant : 
Situation : "${situation}"
Question posée : "${question}"
Réponse idéale attendue : "${expectedAnswer}"

Réponse de l'étudiant : "${userAnswer}"

Ta tâche :
1. ANALYSER LA NATURE DU CONCEPT : Détermine d'abord si ce concept nécessite une approche strictement juridique (application d'une règle de droit à des faits) OU une approche théorique/historique (analyse de contexte, réflexion).
2. ÉVALUER (correct: true/false) en fonction de l'approche :
   - SI c'est strictement JURIDIQUE : L'étudiant a-t-il utilisé un raisonnement structuré (le syllogisme : Majeure/Règle, Mineure/Faits, Conclusion) ? S'il donne juste la réponse sans le raisonnement, corrige-le (correct: false).
   - SI ce n'est PAS strictement juridique (ex: Histoire du droit, économie) : L'étudiant a-t-il bien analysé le contexte ou argumenté logiquement ? Ne le force pas à faire un syllogisme si ça n'a pas de sens.
3. EXPLIQUER : Fournis une explication pédagogique. Rappelle la méthodologie attendue en fonction de la nature du concept.
4. GÉNÉRER UN NOUVEAU CAS (nouveau_cas) OBLIGATOIREMENT si la réponse est fausse ou manque de méthodologie (correct: false). Invente une nouvelle situation totalement différente testant le même concept. Si correct: true, nouveau_cas doit être null.`;

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
