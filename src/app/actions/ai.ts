"use server";

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateJSON } from '@/lib/gemini';
import { SchemaType, Schema } from '@google/generative-ai';
const pdfParse = require('pdf-parse');

// --- UTILITAIRE : Extraction du contenu source ---
async function fetchSourceContent(documentId: string, coursId: string | null): Promise<{ text?: string; pdfBase64?: string; error?: string; wasTruncated?: boolean }> {
  console.log(`[FLOW 4] Début fetchSourceContent - documentId: ${documentId}, coursId: ${coursId}`);
  const supabase = await createClient();

  if (documentId && documentId !== 'dummy') {
    console.log(`[FLOW 4.1] Recherche du document PDF dans Supabase...`);
    const { data: document } = await supabase.from('documents').select('url_fichier').eq('id', documentId).single();
    if (document?.url_fichier) {
      console.log(`[FLOW 4.2] Document trouvé, URL: ${document.url_fichier}. Téléchargement...`);
      try {
        const response = await fetch(document.url_fichier);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        
        console.log(`[FLOW 4.3] Téléchargement OK (taille: ${buffer.length} bytes). Démarrage de l'extraction pdf-parse...`);
        let extractedText = "";
        let wasTruncated = false;
        try {
          // Limite stricte à 30 pages pour éviter le timeout Vercel (10s)
          const pdfData = await pdfParse(buffer, { max: 30 });
          extractedText = pdfData.text;
          wasTruncated = pdfData.numpages > 30;
          console.log(`[FLOW 5] Extraction réussie. Texte extrait : ${extractedText.length} caractères. Tronqué: ${wasTruncated}`);
        } catch (err) {
          console.log(`[FLOW 5 ERROR] Erreur pdf-parse :`, err);
        }

        return { pdfBase64: base64, text: extractedText, wasTruncated };
      } catch (e) {
        return { error: "Erreur lors du téléchargement du PDF source." };
      }
    }
    return { error: "Document introuvable ou URL invalide." };
  }

  if (coursId) {
    console.log(`[FLOW 4.1] Recherche des chapitres du cours ${coursId} dans Supabase...`);
    const { data: chapitres } = await supabase.from('chapitres').select('titre, contenu_texte').eq('cours_id', coursId);
    if (chapitres && chapitres.length > 0) {
      const text = chapitres.map(c => `${c.titre}\n${c.contenu_texte}`).join('\n\n');
      console.log(`[FLOW 5] Extraction réussie depuis chapitres. Texte: ${text.length} caractères.`);
      return { text, wasTruncated: false };
    }
    console.log(`[FLOW 5 ERROR] Le cours ne contient aucun chapitre.`);
    return { error: "Le cours sélectionné ne contient aucun chapitre." };
  }

  return { error: "Aucune source valide fournie." };
}

// --- 1. GÉNÉRATION DE FLASHCARDS ---
export async function generateFlashcardsAction(documentId: string, documentName: string, coursId: string | null = null, count: number = 10) {
  console.log(`[FLOW 3] Server Action appelée: generateFlashcardsAction (${count} cartes demandées)`);
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.log(`[FLOW 3 ERROR] Non authentifié.`);
    return { error: "Non authentifié" };
  }

  const { text, pdfBase64, error, wasTruncated } = await fetchSourceContent(documentId, coursId);
  if (error) return { error };

  const schema = {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        question: { type: SchemaType.STRING, description: "Question courte et directe" },
        reponse: { type: SchemaType.STRING, description: "Réponse précise et concise" }
      },
      required: ["question", "reponse"]
    }
  };

  try {
    console.log(`[FLOW 6] Appel à l'IA pour générer les flashcards...`);
    const flashcardsJson = await generateJSON(
      `Tu es un professeur de droit. Tu dois extraire les concepts clés du document fourni et générer exactement ${count} flashcards.`,
      text ? `Génère ${count} flashcards à partir de ce contenu :\n\n${text}` : `Génère ${count} flashcards à partir de ce PDF.`,
      schema as Schema,
      wasTruncated ? undefined : pdfBase64 // Si tronqué, on force l'utilisation du texte limité à 30 pages
    );

    if (!Array.isArray(flashcardsJson)) throw new Error("Format JSON invalide");
    console.log(`[FLOW 6.1] Flashcards générées (${flashcardsJson.length} unités). Insertion...`);

    const flashcardsToInsert = flashcardsJson.map((fc: any) => ({
      question: fc.question,
      reponse: fc.reponse,
      cours_id: coursId,
      document_id: documentId !== 'dummy' ? documentId : null,
      user_id: user.id,
      statut: 'validated',
      next_review: new Date().toISOString()
    }));

    const { error: dbError } = await supabase.from('flashcards').insert(flashcardsToInsert);
    
    if (dbError) {
      console.log(`[FLOW 7 ERROR] Erreur insertion Supabase :`, dbError);
      return { error: dbError.message };
    }

    console.log(`[FLOW 7.1] Insertion réussie dans Supabase.`);
    revalidatePath('/app/bibliotheque');
    revalidatePath('/app/revisions');
    console.log(`[FLOW 8] Retour avec succès au Frontend.`);
    return { success: true, wasTruncated };
  } catch (error: any) {
    console.log(`[FLOW GLOBAL ERROR]`, error);
    return { error: error.message };
  }
}

export async function updateFlashcardReview(flashcardId: string, evaluation: 'mastered' | 'toReview' | 'hard') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Récupérer la box actuelle
  const { data: flashcard } = await supabase.from('flashcards').select('box').eq('id', flashcardId).single();
  const currentBox = flashcard?.box || 1;
  let newBox = currentBox;
  
  let nextReviewDate = new Date();
  if (evaluation === 'mastered') {
    newBox = currentBox + 1;
    nextReviewDate.setDate(nextReviewDate.getDate() + (newBox * 2)); // Algorithme simple d'espacement
  } else if (evaluation === 'toReview') {
    nextReviewDate.setDate(nextReviewDate.getDate() + 1);
  } else {
    newBox = 1;
    nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
  }

  const { error } = await supabase.from('flashcards').update({ next_review: nextReviewDate.toISOString(), box: newBox }).eq('id', flashcardId);
  if (error) return { error: error.message };

  // Log dans l'historique
  await supabase.from('historique_revisions').insert({
    user_id: user.id,
    flashcard_id: flashcardId,
    evaluation: evaluation,
    box_precedente: currentBox,
    nouvelle_box: newBox
  });

  return { success: true };
}

// --- 2. GÉNÉRATION D'ÉVALUATIONS ---
export async function generateEvaluationAction(documentId: string, documentName: string, coursId: string, type: 'quiz' | 'qcm' | 'vrai_faux' | 'juridique', count: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  if (type === 'qcm' && count > 20) return { error: "Limite de 20 questions pour un QCM." };
  if (type !== 'qcm' && count > 15) return { error: "Limite de 15 questions pour ce type d'évaluation." };
  if (!coursId) return { error: "Un cours doit être sélectionné." };

  const { text, pdfBase64, error } = await fetchSourceContent(documentId, coursId);
  if (error) return { error };

  let schemaTypeProps: any = {};
  let instruction = "";

  if (type === 'qcm') {
    instruction = `Génère ${count} questions à choix multiples (4 options, 1 seule bonne réponse).`;
    schemaTypeProps = {
      question: { type: SchemaType.STRING },
      options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      correctAnswer: { type: SchemaType.NUMBER, description: "Index de la bonne réponse (0 à 3)" },
      explication: { type: SchemaType.STRING }
    };
  } else if (type === 'vrai_faux') {
    instruction = `Génère ${count} affirmations. L'étudiant devra répondre Vrai ou Faux.`;
    schemaTypeProps = {
      question: { type: SchemaType.STRING },
      options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      correctAnswer: { type: SchemaType.NUMBER, description: "Index (0 pour Vrai, 1 pour Faux)" },
      explication: { type: SchemaType.STRING }
    };
  } else if (type === 'juridique') {
    instruction = `Génère ${count} petits cas pratiques juridiques.`;
    schemaTypeProps = {
      question: { type: SchemaType.STRING, description: "Le cas pratique court" },
      expectedAnswer: { type: SchemaType.STRING, description: "La solution juridique attendue avec fondement" }
    };
  } else {
    instruction = `Génère ${count} questions ouvertes.`;
    schemaTypeProps = {
      question: { type: SchemaType.STRING },
      expectedAnswer: { type: SchemaType.STRING, description: "Les mots clés ou l'idée principale attendue" }
    };
  }

  const schema = {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: { id: { type: SchemaType.NUMBER }, ...schemaTypeProps },
      required: ["id", "question", type === 'qcm' || type === 'vrai_faux' ? "options" : "expectedAnswer"]
    }
  };

  try {
    const questionsJson = await generateJSON(
      "Tu es un examinateur en droit exigeant. " + instruction,
      text ? `Base-toi strictement sur ce cours :\n\n${text}` : "Base-toi strictement sur ce document.",
      schema as Schema,
      pdfBase64
    );

    if (!Array.isArray(questionsJson)) throw new Error("Format JSON invalide");

    const { data, error: dbError } = await supabase.from('evaluations').insert([{
      type: type,
      titre: `Évaluation - ${documentName || 'Cours'}`,
      questions: questionsJson,
      score: null,
      user_id: user.id,
      cours_id: coursId,
      document_id: documentId !== 'dummy' ? documentId : null
    }]).select().single();

    if (dbError) throw dbError;

    revalidatePath('/app/evaluations');
    return { success: true, evaluation: data };
  } catch (err: any) {
    return { error: err.message };
  }
}

// --- 3. ANALYSE DE RÉDACTION ---
export async function analyzeRedactionAction(coursId: string, texte: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  if (!coursId) return { error: "Un cours doit être sélectionné pour analyser une rédaction." };

  const { text: coursText, error } = await fetchSourceContent('', coursId);
  if (error) return { error };

  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      points_forts: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      points_faibles: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      axes_amelioration: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      note_globale: { type: SchemaType.STRING, description: "Note sur 20 avec courte appréciation" }
    },
    required: ["points_forts", "points_faibles", "axes_amelioration", "note_globale"]
  };

  try {
    const feedbackJson = await generateJSON(
      "Tu es un correcteur juridique strict. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion par rapport au cours cible.",
      `COURS DE RÉFÉRENCE :\n${coursText || 'Non fourni'}\n\nRÉDACTION DE L'ÉTUDIANT :\n${texte}`,
      schema as Schema
    );

    const { data, error: dbError } = await supabase.from('redactions').insert([{
      titre: 'Analyse de rédaction',
      type: 'dissertation',
      texte,
      rapport_analyse: feedbackJson,
      user_id: user.id,
      cours_id: coursId
    }]).select().single();

    if (dbError) throw dbError;

    revalidatePath('/app/redaction');
    return { success: true, redaction: data };
  } catch (err: any) {
    return { error: err.message };
  }
}
