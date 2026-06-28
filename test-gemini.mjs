import { Type, GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We simulate what gemini.ts does because we can't easily import a Next.js TS file in a plain node script without ts-node setup.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      reponse: { type: Type.STRING }
    },
    required: ["question", "reponse"]
  }
};

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: "Génère 2 flashcards sur le droit civil." }],
      config: {
        systemInstruction: "Tu es un prof. Génère 2 flashcards.",
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    console.log("Success:", response.text);
  } catch (err) {
    console.error("Test failed:", err);
  }
}
run();
