import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60; // Autoriser jusqu'à 60 secondes d'exécution sur Vercel
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from '@google/genai';
// @ts-ignore - Les types pour pdf-parse n'existent pas nativement
import pdfParse from 'pdf-parse';
import crypto from 'crypto';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Types pour l'API Gemini @google/genai
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
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
                explication: { type: Type.STRING, description: "Texte pédagogique du concept, avec exemple concret." },
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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "ID de document manquant" }, { status: 400 });
    }

    // 1. Récupérer le document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, nom, url_fichier')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    // 2. Vérifier si une génération existe déjà (Couche 1)
    let { data: coursEtude } = await supabaseAdmin
      .from('etude_cours')
      .select('*')
      .eq('pdf_id', documentId)
      .single();

    if (coursEtude) {
      if (coursEtude.statut_generation === 'pret') {
        return NextResponse.json({ success: true, message: "Déjà généré", coursId: coursEtude.id });
      }
      if (coursEtude.statut_generation === 'en_cours') {
        return NextResponse.json({ success: false, error: "Génération déjà en cours" }, { status: 409 });
      }
      // Si statut est 'erreur', on continue pour réessayer
    } else {
      // Créer l'entrée
      const { data: newCours, error: insertError } = await supabaseAdmin
        .from('etude_cours')
        .insert({ pdf_id: documentId, statut_generation: 'en_cours' })
        .select()
        .single();
        
      if (insertError) throw new Error(insertError.message);
      coursEtude = newCours;
    }

    // Mettre le statut en cours (pour le retry ou si nouveau)
    await supabaseAdmin.from('etude_cours').update({ statut_generation: 'en_cours' }).eq('id', coursEtude.id);

    try {
      // 3. Télécharger le PDF
      const response = await fetch(document.url_fichier);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Calculer le Hash pour éviter les doublons absolus (sécurité supplémentaire)
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      await supabaseAdmin.from('etude_cours').update({ generation_hash: hash }).eq('id', coursEtude.id);

      // 4. Parser le PDF
      const pdfData = await pdfParse(buffer);
      
      if (pdfData.numpages > 50) {
        throw new Error(`Le PDF dépasse la limite de 50 pages (actuel: ${pdfData.numpages} pages).`);
      }

      const text = pdfData.text;

      // 5. Appel Gemini (One-shot)
      const prompt = `Tu es un professeur de droit expérimenté avec 30 ans d'expérience. 
      Tu dois transformer ce cours au format texte brut en un cours pédagogique structuré pour un étudiant débutant.
      
      Contraintes :
      - français simple et accessible
      - explications claires
      - exemples concrets intégrés dans chaque explication
      - pas de résumé sec
      - découpage intelligent en sections et thèmes
      
      Le retour doit respecter scrupuleusement la structure demandée. 
      Voici le texte brut du cours :\n\n${text.substring(0, 80000)}`; // Limite de sécurité textuelle

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
        throw new Error("Impossible de générer un JSON valide après plusieurs tentatives. Erreur interne Gemini: " + (lastGenError?.message || String(lastGenError)));
      }

      // 6. Sauvegarder en DB (Couche 1)
      for (const section of generatedData.sections) {
        const { data: sectionData, error: secError } = await supabaseAdmin
          .from('etude_sections')
          .insert({
            cours_id: coursEtude.id,
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

      // Tout s'est bien passé, on passe le statut à pret
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'pret' }).eq('id', coursEtude.id);

      return NextResponse.json({ success: true, coursId: coursEtude.id });

    } catch (processError: any) {
      console.error("Erreur de traitement PDF/IA:", processError);
      // Fallback: passer le statut en erreur
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'erreur' }).eq('id', coursEtude.id);
      return NextResponse.json({ error: processError.message || "Erreur de génération du cours" }, { status: 500 });
    }

  } catch (error: any) {
    console.error("API Generer Etude Error:", error);
    return NextResponse.json({ error: "Erreur serveur interne: " + (error.message || String(error)) }, { status: 500 });
  }
}
