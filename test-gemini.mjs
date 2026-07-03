import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import pdfParse from 'pdf-parse';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
          synthese: { type: Type.STRING },
          themes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ordre: { type: Type.INTEGER },
                titre: { type: Type.STRING },
                explication: { type: Type.STRING },
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
                    properties: {
                      choix_incorrect: { type: Type.STRING },
                      reexplication: { type: Type.STRING }
                    },
                    required: ["choix_incorrect", "reexplication"]
                  }
                },
                branches_remediation_fond: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      concept_incompris: { type: Type.STRING },
                      reexplication: { type: Type.STRING }
                    },
                    required: ["concept_incompris", "reexplication"]
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
};

async function test() {
  try {
    const documentId = '2bffa4dc-1f99-4249-be9d-b442475296cf'; // Hardcoded valid document ID
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, nom, url_fichier')
      .eq('id', documentId)
      .single();

    if (docError || !document) throw new Error("Document introuvable");
    console.log("Document fetch success");

    let { data: coursEtude } = await supabase
      .from('etude_cours')
      .select('*')
      .eq('pdf_id', documentId)
      .single();

    if (!coursEtude) {
      const { data: newCours, error: insertError } = await supabase
        .from('etude_cours')
        .insert({ pdf_id: documentId, statut_generation: 'en_cours' })
        .select()
        .single();
      if (insertError) throw new Error(insertError.message);
      coursEtude = newCours;
    }
    console.log("Cours etude check success");

    try {
      console.log("Fetching PDF from URL...", document.url_fichier);
      const response = await fetch(document.url_fichier);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log("PDF fetched, size:", buffer.length);

      const pdfData = await pdfParse(buffer);
      console.log("PDF parsed, numpages:", pdfData.numpages);
      const text = pdfData.text;

      const prompt = `Tu es un professeur de droit expérimenté avec 30 ans d'expérience. 
      Tu dois transformer ce cours au format texte brut en un cours pédagogique structuré pour un étudiant débutant.
      
      Contraintes :
      - français simple et accessible
      - explications claires
      - exemples concrets intégrés dans chaque explication
      - pas de résumé sec
      - découpage intelligent en sections et thèmes
      
      Le retour doit respecter scrupuleusement la structure demandée. 
      Voici le texte brut du cours :\n\n${text.substring(0, 80000)}`;

      console.log("Calling Gemini...");
      const aiResponse = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2
        }
      });
      console.log("Gemini raw response:", aiResponse.text.substring(0, 100));
      const generatedData = JSON.parse(aiResponse.text || "{}");
      console.log("Gemini parsing success, sections:", generatedData.sections?.length);

    } catch (processError) {
      console.error("INNER CATCH ERROR:", processError);
      throw processError; // Re-throw to simulate what happens
    }
  } catch (err) {
    console.error("OUTER CATCH ERROR:", err);
  }
}
test();
