import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const type = 'qcm';
let instruction = "Génère 2 questions à choix multiples (QCM). Fournis 4 options par question et indique l'index de la bonne réponse.";
const systemInstruction = `Tu es un examinateur en droit exigeant. ${instruction}\n\nIMPORTANT: Tu DOIS générer un JSON valide contenant un tableau d'objets. Ne rajoute aucun texte avant ou après le JSON.
Tu DOIS utiliser EXACTEMENT ces noms de propriétés pour chaque objet du tableau :
- "question" : le texte de la question, de l'affirmation ou du cas pratique
${type === 'qcm' || type === 'vrai_faux' ? '- "options" : un tableau de chaînes de caractères (les choix de réponses)\n- "correctAnswer" : un nombre entier représentant l\'index de la bonne réponse (commençant à 0)\n- "explication" : l\'explication de la réponse' : '- "expectedAnswer" : la réponse ou les éléments de correction attendus'}

Exemple de format attendu :
[
  {
    "question": "...",
    ${type === 'qcm' || type === 'vrai_faux' ? '"options": ["...", "..."],\n    "correctAnswer": 0,\n    "explication": "..."' : '"expectedAnswer": "..."'}
  }
]`;

async function run() {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-1.5-flash',
    contents: "Base-toi strictement sur le cours de droit constitutionnel français.",
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
    }
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    if (chunk.text) {
      fullResponse += chunk.text;
    }
  }
  console.log(fullResponse);
}
run();
