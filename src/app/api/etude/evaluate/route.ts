import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient } from '@/lib/supabase/server';
import { Type, Schema } from '@google/genai';
import { generateStructuredJSON } from '@/lib/gemini';

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

    const prompt = `Tu es un Maître de Conférences en Droit exigeant, mais ton but est l'apprentissage adaptatif de l'étudiant.
Concept enseigné : "${themeTitre}"
Explication du concept : "${themeExplication}"

Exercice soumis à l'étudiant : 
Situation : "${situation}"
Question posée : "${question}"
Réponse attendue : "${expectedAnswer}"

Réponse de l'étudiant : "${userAnswer}"

Ta tâche : ÉVALUATION ADAPTATIVE ET PROGRESSIVE
1. ÉVALUER (correct: true/false) AVEC RIGUEUR : 
   - Valide (correct: true) si l'étudiant a compris la logique ET utilisé les mots-clés juridiques essentiels.
   - Invalide (correct: false) s'il manque de précision, s'il fait un hors-sujet, ou s'il n'argumente pas. Le Droit exige de la précision.
2. EXPLIQUER ET ADAPTER LE PARCOURS (explication) :
   - Si la réponse est correcte et précise : Raccourcis ton explication, valide son point rapidement.
   - Si la réponse est fausse ou imprécise : Ralentis. Ne te contente pas de corriger. Décortique son erreur (pourquoi est-ce une confusion classique ?), reformule la règle avec une nouvelle approche, et ré-explique la notion mal comprise.
3. GÉNÉRER UN NOUVEAU CAS (nouveau_cas) OBLIGATOIRE si la réponse est fausse :
   - Si correct = false : Génère un TOUT NOUVEAU cas pratique abordant la notion sous un autre angle pour retenter sa chance.
   - Si correct = true : Mets null.`;

    // Passe par le helper mutualisé : retry + backoff sur 429/500/503, parsing JSON robuste,
    // et tracking SaaS. Température 0.3 préservée pour une correction déterministe.
    const generatedData = await generateStructuredJSON(
      "Tu es un Maître de Conférences en Droit exigeant. Tu corriges de façon adaptative la réponse d'un étudiant à un cas pratique.",
      prompt,
      RESPONSE_SCHEMA,
      undefined,
      { userId: user.id, feature: 'etude_evaluate' },
      0.3
    );

    return NextResponse.json(generatedData);

  } catch (error: any) {
    console.error("Erreur Evaluate API:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}
