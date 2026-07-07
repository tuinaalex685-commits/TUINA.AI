import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from '@google/genai';
// @ts-ignore
import pdfParse from 'pdf-parse';
import crypto from 'crypto';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    _reflexion_interne_comite: { type: Type.STRING, description: "Espace de réflexion INVISIBLE. ULTRA CONCIS (style télégraphique, puces courtes). Le comité y liste : Fondamentaux, Pièges, Exceptions. Ne pas faire de phrases longues." },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ordre: { type: Type.INTEGER },
          titre: { type: Type.STRING },
          synthese: { type: Type.STRING, description: "Texte narratif résumant cette section." },
          themes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ordre: { type: Type.INTEGER },
                titre: { type: Type.STRING },
                explication: { type: Type.STRING, description: "Cours complet formaté en Markdown suivant strictement la progression en 11 étapes pédagogiques requise (Synthèse, Explication notion, Ratio legis, Logique législateur, Conditions, Exceptions, Conséquences, Pièges, Confusions, Exemple, Évaluation) et incluant les étoiles d'importance (★)." },
                question_forme: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    choix: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reponse_correcte: { type: Type.STRING }
                  },
                  required: ["question", "choix", "reponse_correcte"]
                },
                cas_pratique_fond: {
                  type: Type.OBJECT,
                  properties: {
                    situation: { type: Type.STRING },
                    question: { type: Type.STRING },
                    reponse_attendue_ou_choix: { type: Type.STRING }
                  },
                  required: ["situation", "question", "reponse_attendue_ou_choix"]
                },
                branches_remediation_forme: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { blocage: { type: Type.STRING }, reexplication: { type: Type.STRING } },
                    required: ["blocage", "reexplication"]
                  }
                },
                branches_remediation_fond: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { blocage: { type: Type.STRING }, reexplication: { type: Type.STRING } },
                    required: ["blocage", "reexplication"]
                  }
                }
              },
              required: ["ordre", "titre", "explication", "question_forme", "cas_pratique_fond", "branches_remediation_forme", "branches_remediation_fond"]
            }
          },
          questions_cloture_section: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                choix: { type: Type.ARRAY, items: { type: Type.STRING } },
                reponse_correcte: { type: Type.STRING }
              },
              required: ["question", "choix", "reponse_correcte"]
            }
          }
        },
        required: ["ordre", "titre", "synthese", "themes", "questions_cloture_section"]
      }
    }
  },
  required: ["sections"]
} as Schema;

export async function runWorker() {
  try {
    // Contrôle de concurrence
    // Pour l'instant, on laisse l'appel libre, mais on contrôle l'exécution
    
    // Contrôle de concurrence
    const { count, error: countError } = await supabaseAdmin
      .from('etude_cours')
      .select('id', { count: 'exact', head: true })
      .eq('statut_generation', 'en_cours');
      
    if (countError) throw new Error("Erreur de comptage");
    
    // Limite stricte pour éviter le Rate Limit Google
    if ((count || 0) >= 5) {
      console.log("[Worker] Trop de jobs en cours. Retourne.");
      return { message: "File pleine" };
    }

    // Récupérer le plus ancien job en attente
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('etude_cours')
      .select('id, pdf_id')
      .eq('statut_generation', 'en_attente')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !job) {
      return { message: "Aucun job en attente" };
    }

    // Lock le job en passant son statut à 'en_cours'
    await supabaseAdmin
      .from('etude_cours')
      .update({ statut_generation: 'en_cours' })
      .eq('id', job.id);

    try {
      // 1. Récupérer le document
      const { data: document, error: docError } = await supabaseAdmin
        .from('documents')
        .select('url_fichier')
        .eq('id', job.pdf_id)
        .single();

      if (docError || !document) throw new Error("Document introuvable");

      // 3. Télécharger le PDF
      const response = await fetch(document.url_fichier);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      await supabaseAdmin.from('etude_cours').update({ generation_hash: hash }).eq('id', job.id);

      // 4. Parser le PDF
      const pdfData = await pdfParse(buffer);
      if (pdfData.numpages > 100) throw new Error("PDF trop long");

      const text = pdfData.text;

      // 5. Phase 1 : Analyse Préalable (Intelligence Pédagogique)
      const { PRE_ANALYSIS_SCHEMA, getPreAnalysisPrompt, getPedagogicalStrategyPrompt } = await import('@/lib/prompts/pedagogicalEngine');
      
      let intelligenceData: any = null;
      let intelligenceRetryCount = 0;
      let lastIntelligenceError: any = null;
      
      while (intelligenceRetryCount < 2 && !intelligenceData) {
        try {
          const aiAnalysisResponse = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: getPreAnalysisPrompt(text.substring(0, 80000)),
            config: {
              responseMimeType: 'application/json',
              responseSchema: PRE_ANALYSIS_SCHEMA,
              temperature: 0.1
            }
          });
          intelligenceData = JSON.parse(aiAnalysisResponse.text || "{}");
        } catch (genError: any) {
          console.error("Gemini Pre-Analysis Error (Retry):", genError);
          lastIntelligenceError = genError;
          intelligenceRetryCount++;
        }
      }

      if (!intelligenceData) {
        throw new Error("Impossible de générer l'intelligence pédagogique. Erreur: " + lastIntelligenceError?.message);
      }

      // Sauvegarde de l'intelligence dans la table documents
      await supabaseAdmin
        .from('documents')
        .update({ intelligence_pedagogique: intelligenceData })
        .eq('id', job.pdf_id);

      // 6. Phase 2 : Génération du Cours avec Stratégie Adaptée
      const prompt = getPedagogicalStrategyPrompt(intelligenceData, text.substring(0, 80000));

      let generatedData: any = null;
      let retryCount = 0;
      let lastGenError: any = null;
      
      while (retryCount < 2 && !generatedData) {
        try {
          const aiResponse = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0.2
            }
          });
          generatedData = JSON.parse(aiResponse.text || "{}");
        } catch (genError: any) {
          console.error("Gemini Generation Error (Retry):", genError);
          lastGenError = genError;
          retryCount++;
        }
      }

      if (!generatedData || !generatedData.sections) {
        throw new Error("Impossible de générer un JSON valide pour le cours. Erreur: " + lastGenError?.message);
      }

      // 6. Sauvegarder en DB
      for (const section of generatedData.sections) {
        const { data: sectionData, error: secError } = await supabaseAdmin
          .from('etude_sections')
          .insert({
            cours_id: job.id,
            ordre: section.ordre,
            titre: section.titre,
            synthese: section.synthese,
            questions_cloture: section.questions_cloture_section
          })
          .select()
          .single();

        if (secError) throw new Error(`Erreur insertion section: ${secError.message}`);

        for (const theme of section.themes) {
          const { error: themeError } = await supabaseAdmin
            .from('etude_themes')
            .insert({
              section_id: sectionData.id,
              ordre: theme.ordre,
              titre: theme.titre,
              explication: theme.explication,
              question_forme: theme.question_forme,
              cas_pratique_fond: theme.cas_pratique_fond,
              remediation_forme: theme.branches_remediation_forme,
              remediation_fond: theme.branches_remediation_fond
            });

          if (themeError) throw new Error(`Erreur insertion thème: ${themeError.message}`);
        }
      }

      // Tout s'est bien passé
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'pret' }).eq('id', job.id);

      // Si le worker a fini, on relance un appel pour dépiler la suite de la file d'attente
      setTimeout(() => runWorker().catch(console.error), 0);

      return { success: true, processedJob: job.id };

    } catch (processError: any) {
      console.error("Worker Error:", processError);
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'erreur' }).eq('id', job.id);
      
      // On lance le worker sur le job suivant quand même
      setTimeout(() => runWorker().catch(console.error), 0);
      return { error: processError.message };
    }

  } catch (error: any) {
    console.error("Worker Global Error:", error);
    return { error: error.message };
  }
}

export async function POST(req: NextRequest) {
  const result = await runWorker();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
