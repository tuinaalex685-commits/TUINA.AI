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

    const prompt = `Tu es un professeur tuteur expérimenté. 
Concept enseigné : "${themeTitre}"
Explication du concept : "${themeExplication}"

Cas pratique soumis à l'étudiant : 
Situation : "${situation}"
Question posée : "${question}"
Réponse idéale attendue : "${expectedAnswer}"

Réponse de l'étudiant : "${userAnswer}"

Ta tâche :
1. Évaluer la réponse de l'étudiant. A-t-il compris l'essentiel du concept ? (Il n'a pas besoin d'avoir les mots exacts, cherche la compréhension du fond).
2. Fournir une courte explication pour valider ou corriger (utilise le tutoiement ou vouvoiement de manière bienveillante).
3. SI sa réponse est fausse (correct: false), tu dois OBLIGATOIREMENT inventer un nouveau cas pratique (nouveau_cas) totalement différent (autre situation, autre contexte) mais qui teste EXACTEMENT le même concept ("${themeTitre}").
Si sa réponse est juste (correct: true), nouveau_cas doit être null.`;

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
