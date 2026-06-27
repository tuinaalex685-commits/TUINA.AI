import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const schemaProps = {
  question: { type: Type.STRING },
  options: { type: Type.ARRAY, items: { type: Type.STRING } },
  correctAnswer: { type: Type.INTEGER, description: "Index de la bonne réponse" },
  explication: { type: Type.STRING }
};

const schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { id: { type: Type.INTEGER }, ...schemaProps },
    required: ["id", "question", "options"]
  }
};

try {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-1.5-flash',
    contents: "Base-toi strictement sur ce document.",
    config: {
      systemInstruction: "Tu es un examinateur.",
      responseMimeType: 'application/json',
      responseSchema: schema,
    }
  });

  for await (const chunk of stream) {
    console.log(chunk.text);
  }
} catch (e) {
  console.error("ERROR", e);
}
