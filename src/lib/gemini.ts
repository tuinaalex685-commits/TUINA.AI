import { GoogleGenerativeAI, Schema } from '@google/generative-ai';

// Fonction interne pour générer un contenu typé JSON
export async function generateJSON(systemInstruction: string, prompt: string, schema: Schema, pdfBase64?: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  // MODE MOCK : Si aucune clé n'est fournie, on simule la réponse de Gemini
  if (!apiKey || apiKey.trim() === 'VOTRE_CLE_API_ICI') {
    console.log("⚠️ MODE MOCK IA ACTIVÉ : Aucune clé Gemini valide trouvée. Génération de données fictives...");
    
    // Simuler le délai réseau
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Analyser l'instruction pour déterminer le type de mock à retourner
    const instructionLower = systemInstruction.toLowerCase();
    
    if (instructionLower.includes("flashcard")) {
      let count = 5;
      const countMatch = systemInstruction.match(/exactement (\d+)/i);
      if (countMatch) count = parseInt(countMatch[1], 10);

      let sourceText = "";
      const textParts = prompt.split(":\n\n");
      if (textParts.length > 1) {
        sourceText = textParts[1];
      }

      if (!sourceText || sourceText.trim().length < 10) {
        return Array.from({ length: count }).map((_, i) => ({
           question: `Question fictive ${i + 1} (Aucun texte lisible extrait)`,
           reponse: `Réponse fictive ${i + 1}`
        }));
      }

      // Analyse locale simple du texte extrait
      const sentences = sourceText.replace(/([.?!])\s*(?=[A-Z])/g, "$1|").split("|").filter(s => s.trim().length > 15);
      
      const flashcards = [];
      for (let i = 0; i < count; i++) {
        const sentence = sentences[i % sentences.length] || `Concept #${i+1}`;
        flashcards.push({
          question: `Expliquez le concept suivant évoqué dans le document : "${sentence.substring(0, 30)}..."`,
          reponse: sentence.trim()
        });
      }
      return flashcards;
    } 
    
    if (instructionLower.includes("choix multiples")) {
      return [
        {
          id: 1,
          question: "Que se passe-t-il si aucune clé Gemini n'est définie ?",
          options: ["L'application plante", "Le mode Mock IA prend le relais", "Rien du tout", "L'ordinateur explose"],
          correctAnswer: 1,
          explication: "Le système bascule automatiquement sur des données factices pour garantir la continuité des tests."
        }
      ];
    }

    if (instructionLower.includes("vrai ou faux")) {
      return [
        {
          id: 1,
          question: "Le mode mock permet d'enregistrer les résultats dans Supabase.",
          options: ["Vrai", "Faux"],
          correctAnswer: 0,
          explication: "Le mode mock remplace uniquement l'appel externe à Gemini, le reste du système (Backend et Base de données) fonctionne exactement comme en production."
        }
      ];
    }

    if (instructionLower.includes("cas pratiques juridiques")) {
      return [
        {
          id: 1,
          question: "M. X n'a pas de clé API. Peut-il tester l'application ?",
          expectedAnswer: "Oui, selon le principe du Mode Mock intégré au backend de Tuina.ai, M. X bénéficie d'une génération locale automatique permettant de tester tous les flux."
        }
      ];
    }

    if (instructionLower.includes("questions ouvertes")) {
      return [
        {
          id: 1,
          question: "Expliquez le fonctionnement du Mode Mock.",
          expectedAnswer: "Le Mode Mock intercepte l'appel à l'API Google, simule un temps de réponse, et renvoie un JSON valide correspondant à la demande initiale."
        }
      ];
    }

    if (instructionLower.includes("correcteur juridique")) {
      return {
        points_forts: ["Excellente gestion de crise technique", "Architecture robuste"],
        points_faibles: ["Manque la véritable API pour avoir des données pertinentes"],
        axes_amelioration: ["Renseigner GEMINI_API_KEY dans le fichier .env.local"],
        note_globale: "18/20 - Excellent travail d'adaptation."
      };
    }

    // Fallback par défaut
    return { mock: true, message: "Type de requête non reconnu par le mock local." };
  }

  // MODE PRODUCTION (Gemini Réel)
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Modèle recommandé pour le traitement texte/pdf
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    }
  });

  const parts: any[] = [{ text: prompt }];

  if (pdfBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }

  const result = await model.generateContent(parts);
  const responseText = result.response.text();
  
  try {
    return JSON.parse(responseText);
  } catch (e) {
    throw new Error("L'IA n'a pas retourné un JSON valide.");
  }
}
