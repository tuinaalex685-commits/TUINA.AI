import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runValidationProd() {
  console.log("=== RAPPORT DE VALIDATION PRODUCTION (VERCEL) ===");
  try {
    console.log("\\n[1] TEST DU MODULE ÉVALUATION (Vercel)");
    const evalRes = await fetch('https://tuina-ai.vercel.app/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'dummy-prod',
        coursName: 'Test Automatisé Vercel',
        coursId: 'test-prod-123',
        type: 'qcm',
        count: 2
      })
    });
    
    let evalText = await evalRes.text();
    console.log("-> Réponse brute Vercel :");
    console.log(evalText);

    let cleanedEval = evalText.trim();
    if (cleanedEval.startsWith('```json')) cleanedEval = cleanedEval.slice(7);
    else if (cleanedEval.startsWith('```')) cleanedEval = cleanedEval.slice(3);
    if (cleanedEval.endsWith('```')) cleanedEval = cleanedEval.slice(0, -3);

    try {
        const evalJson = JSON.parse(cleanedEval.trim());
        console.log("\\n-> JSON Validé (Vercel) :");
        console.log(JSON.stringify(evalJson, null, 2));
    } catch(e) {
        console.log("Erreur de parsing : ", e.message);
    }

  } catch (err) {
    console.error("Erreur durant la validation :", err);
  }
}

runValidationProd();
