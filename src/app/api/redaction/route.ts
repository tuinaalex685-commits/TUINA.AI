import { NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { streamStructuredJSON } from '@/lib/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: "ID de rédaction manquant ou invalide." }, { status: 400 });
    }

    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    // 1. Authentification
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      console.warn(`[SECURITY] Tentative d'accès non autorisé à l'API de rédaction (ID: ${id})`);
      return NextResponse.json({ error: "Non autorisé. Veuillez vous connecter." }, { status: 401 });
    }
    const user = authData.user;

    // 2. Ownership & RLS (Automatique grâce au client serveur)
    const { data: redaction, error: fetchError } = await supabase
      .from('redactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !redaction || !redaction.contenu) {
      return NextResponse.json({ error: "Rédaction introuvable ou vide." }, { status: 404 });
    }

    if (redaction.contenu.length > 10000) {
      return NextResponse.json({ error: "Le texte dépasse la limite autorisée de 10 000 caractères." }, { status: 400 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('redactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', redaction.user_id)
      .eq('statut', 'analyse')
      .gte('created_at', startOfDay.toISOString());

    if ((count || 0) >= 3) {
      console.warn(`[RATE LIMIT] Utilisateur ${user.id} a dépassé sa limite de rédactions.`);
      return NextResponse.json({ error: "Vous avez atteint votre limite de 3 générations pour aujourd'hui." }, { status: 429 });
    }
    
    console.log(`[API REDACTION] Analyse acceptée pour la rédaction ${id} (User: ${user.id})`);

    // Schéma de base commun
    const baseProperties: any = {
      points_forts: { type: Type.ARRAY, items: { type: Type.STRING } },
      points_faibles: { type: Type.ARRAY, items: { type: Type.STRING } },
      axes_amelioration: { type: Type.ARRAY, items: { type: Type.STRING } },
      note_globale: { type: Type.STRING, description: "Note sur 20 avec courte appréciation" }
    };
    
    let propositionSchema: any = {};
    let systemInstruction = `Tu es un correcteur expert et bienveillant en droit. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.
    ⚠️ RÈGLE ABSOLUE : Tu ne dois JAMAIS rédiger le développement complet à la place de l'étudiant. Ton rôle est purement pédagogique. Fournis uniquement des méthodes, des plans détaillés, ou des exemples partiels.`;

    // Personnalisation selon le type
    if (redaction.type === 'Dissertation') {
      systemInstruction += ` Fournis une 'proposition' contenant un exemple d'introduction complète, un plan détaillé (uniquement les titres I, A, B, etc. SANS RÉDIGER LE DÉVELOPPEMENT), et une conclusion synthétique. NE RÉDIGE AUCUN DÉVELOPPEMENT.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          introduction: { type: Type.STRING, description: "Exemple d'introduction modèle" },
          plan_detaille: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Titres du plan uniquement (ex: I. Titre, A. Sous-titre)" },
          conclusion: { type: Type.STRING, description: "Exemple de conclusion synthétique" }
        },
        required: ["introduction", "plan_detaille", "conclusion"]
      };
    } else if (redaction.type === 'Commentaire d\'arrêt') {
      systemInstruction += ` Fournis une 'proposition' contenant un exemple d'introduction, une méthode d'analyse rapide, un plan détaillé du commentaire, et une conclusion. NE RÉDIGE AUCUN DÉVELOPPEMENT INTÉRIEUR.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          introduction: { type: Type.STRING, description: "Exemple d'introduction adaptée" },
          methode_analyse: { type: Type.STRING, description: "Méthode d'analyse recommandée" },
          plan_detaille: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Plan détaillé sans rédaction interne" },
          conclusion_synthetique: { type: Type.STRING, description: "Conclusion synthétique" }
        },
        required: ["introduction", "methode_analyse", "plan_detaille", "conclusion_synthetique"]
      };
    } else if (redaction.type === 'Cas pratique') {
      systemInstruction += ` Fournis une 'proposition' montrant la démarche attendue (syllogisme) : méthode de résolution et raisonnement attendu. Ne résous pas l'intégralité du cas pratique pour lui, montre la méthode.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          qualification_faits: { type: Type.STRING, description: "Méthode de qualification" },
          problemes_juridiques: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Comment identifier les problèmes" },
          regles_applicables: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Règles de droit pertinentes" },
          application_cas: { type: Type.STRING, description: "Méthode d'application au cas" },
          conclusion_juridique: { type: Type.STRING, description: "Raisonnement de conclusion" }
        },
        required: ["qualification_faits", "problemes_juridiques", "regles_applicables", "application_cas", "conclusion_juridique"]
      };
    } else if (redaction.type === 'Anglais juridique') {
      systemInstruction += ` Fournis une correction expliquée et une proposition améliorée sans refaire l'intégralité du texte. Focus sur le vocabulaire et la grammaire juridique anglophone.`;
      propositionSchema = {
        type: Type.OBJECT,
        properties: {
          correction_expliquee: { type: Type.STRING, description: "Explication des fautes majeures" },
          proposition_amelioree: { type: Type.STRING, description: "Proposition partielle améliorée" }
        },
        required: ["correction_expliquee", "proposition_amelioree"]
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
