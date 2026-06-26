"use server";

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateJSON } from '@/lib/gemini';
import { SchemaType, Schema } from '@google/generative-ai';
const pdfParse = require('pdf-parse');

// --- UTILITAIRE : Extraction du contenu source ---
async function fetchSourceContent(documentId: string, coursId: string | null, debugLog: (msg: string) => void): Promise<{ text?: string; pdfBase64?: string; error?: string; wasTruncated?: boolean }> {
  debugLog(`[FETCH] Début fetchSourceContent - documentId: ${documentId}, coursId: ${coursId}`);
  try {
    const supabase = await createClient();

    if (documentId && documentId !== 'dummy') {
      debugLog(`[FETCH] Recherche du document PDF dans Supabase...`);
      const { data: document, error: docError } = await supabase.from('documents').select('url_fichier').eq('id', documentId).single();
      if (docError) debugLog(`[FETCH ERROR] Erreur Supabase documents: ${docError.message}`);
      
      if (document?.url_fichier) {
        debugLog(`[FETCH] Document trouvé, URL: ${document.url_fichier}. Téléchargement...`);
        try {
          const response = await fetch(document.url_fichier);
          if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          debugLog(`[FETCH] ArrayBuffer récupéré.`);
          const buffer = Buffer.from(arrayBuffer);
          debugLog(`[FETCH] Buffer créé.`);
          const base64 = buffer.toString('base64');
          
          debugLog(`[FETCH] Téléchargement OK (taille: ${buffer.length} bytes). Démarrage de l'extraction pdf-parse...`);
          let extractedText = "";
          let wasTruncated = false;
          try {
            debugLog(`[FETCH] Appel de pdfParse...`);
            const pdfData = await pdfParse(buffer, { max: 30 });
            debugLog(`[FETCH] pdfParse terminé.`);
            extractedText = pdfData.text;
            wasTruncated = pdfData.numpages > 30;
            debugLog(`[FETCH] Extraction réussie. Texte: ${extractedText.length} char. Tronqué: ${wasTruncated}`);
          } catch (err: any) {
            debugLog(`[FETCH ERROR] Erreur pdf-parse fatale : ${err.message || err}`);
            throw err; // On relance pour voir le vrai crash
          }

          return { pdfBase64: base64, text: extractedText, wasTruncated };
        } catch (e: any) {
          debugLog(`[FETCH ERROR] Erreur lors du téléchargement : ${e.message || e}`);
          return { error: `Erreur lors du téléchargement du PDF source: ${e.message}` };
        }
      }
      debugLog(`[FETCH ERROR] Document introuvable ou URL invalide.`);
      return { error: "Document introuvable ou URL invalide." };
    }

    if (coursId) {
      debugLog(`[FETCH] Recherche des chapitres du cours ${coursId}...`);
      const { data: chapitres, error: chapError } = await supabase.from('chapitres').select('titre, contenu_texte').eq('cours_id', coursId);
      if (chapError) debugLog(`[FETCH ERROR] Erreur Supabase chapitres: ${chapError.message}`);
      
      if (chapitres && chapitres.length > 0) {
        const text = chapitres.map(c => `${c.titre}\n${c.contenu_texte}`).join('\n\n');
        debugLog(`[FETCH] Extraction réussie depuis chapitres. Texte: ${text.length} char.`);
        return { text, wasTruncated: false };
      }
      debugLog(`[FETCH ERROR] Le cours ne contient aucun chapitre.`);
      return { error: "Le cours sélectionné ne contient aucun chapitre." };
    }

    return { error: "Aucune source valide fournie." };
  } catch (globalErr: any) {
    debugLog(`[FETCH FATAL] Erreur non gérée dans fetchSourceContent: ${globalErr.message}\n${globalErr.stack}`);
    return { error: `Fatal fetch error: ${globalErr.message}` };
  }
}

// --- 1. GÉNÉRATION DE FLASHCARDS ---
export async function generateFlashcardsAction(documentId: string, documentName: string, coursId: string | null = null, count: number = 10) {
  const logs: string[] = [];
  const debugLog = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  debugLog(`[ACTION] Début generateFlashcardsAction (${count} cartes)`);
  
  try {
    debugLog(`[ACTION] Initialisation Supabase...`);
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) debugLog(`[ACTION ERROR] auth.getUser: ${authError.message}`);

    if (!user) {
      debugLog(`[ACTION ERROR] Non authentifié.`);
      return { error: "Non authentifié", logs };
    }
    debugLog(`[ACTION] User identifié: ${user.id}`);

    const { text, pdfBase64, error, wasTruncated } = await fetchSourceContent(documentId, coursId, debugLog);
    if (error) {
      debugLog(`[ACTION ERROR] Erreur retournée par fetchSourceContent: ${error}`);
      return { error, logs };
    }

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

    debugLog(`[ACTION] Appel generateJSON (Gemini/Mock)...`);
    let flashcardsJson;
    try {
      flashcardsJson = await generateJSON(
        `Tu es un professeur de droit. Tu dois extraire les concepts clés du document fourni et générer exactement ${count} flashcards.`,
        text ? `Génère ${count} flashcards à partir de ce contenu :\n\n${text}` : `Génère ${count} flashcards à partir de ce PDF.`,
        schema as Schema,
        wasTruncated ? undefined : pdfBase64
      );
      debugLog(`[ACTION] generateJSON terminé avec succès.`);
    } catch (aiError: any) {
      debugLog(`[ACTION ERROR] Erreur generateJSON: ${aiError.message}\n${aiError.stack}`);
      return { error: `Erreur IA: ${aiError.message}`, logs };
    }

    if (!Array.isArray(flashcardsJson)) {
      debugLog(`[ACTION ERROR] Format JSON invalide retourné par IA: ${JSON.stringify(flashcardsJson).substring(0, 50)}...`);
      return { error: "L'IA n'a pas retourné un tableau valide", logs };
    }
    
    debugLog(`[ACTION] Préparation de l'insertion de ${flashcardsJson.length} flashcards...`);

    const flashcardsToInsert = flashcardsJson.map((fc: any) => ({
      question: fc.question,
      reponse: fc.reponse,
      cours_id: coursId,
      document_id: documentId !== 'dummy' ? documentId : null,
      user_id: user.id,
      statut: 'validated',
      next_review: new Date().toISOString()
    }));

    debugLog(`[ACTION] Appel Supabase insert...`);
    const { error: dbError } = await supabase.from('flashcards').insert(flashcardsToInsert);
    
    if (dbError) {
      debugLog(`[ACTION ERROR] Erreur insertion Supabase : ${dbError.message} (Code: ${dbError.code})`);
      return { error: `Erreur BDD: ${dbError.message}`, logs };
    }

    debugLog(`[ACTION] Insertion réussie. Appel revalidatePath...`);
    try {
      revalidatePath('/app/bibliotheque');
      revalidatePath('/app/revisions');
      debugLog(`[ACTION] revalidatePath OK.`);
    } catch (revError: any) {
      debugLog(`[ACTION ERROR] revalidatePath a échoué: ${revError.message}`);
      // On ne bloque pas si revalidatePath échoue, c'est cosmétique
    }

    debugLog(`[ACTION] Fin de l'action serveur avec succès.`);
    return { success: true, wasTruncated, logs };
  } catch (globalError: any) {
    debugLog(`[ACTION FATAL] Exception non interceptée: ${globalError.message}\n${globalError.stack}`);
    return { error: `Erreur Serveur Fatale: ${globalError.message}`, logs, fatal: true };
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
