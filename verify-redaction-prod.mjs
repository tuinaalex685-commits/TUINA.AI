import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyProd() {
  console.log("=== TEST DE PRODUCTION SUR VERCEL ===");
  
  const testId = '11111111-1111-1111-1111-111111111111';
  const fakeCopy = "En droit français, la responsabilité civile pour faute nécessite de prouver une faute, un préjudice et un lien de causalité (art 1240 Code civil).";
  
  // 1. Delete and insert a fresh redaction
  await supabase.from('redactions').delete().eq('id', testId);
  const { data: insertData, error: insertError } = await supabase.from('redactions').insert({
    id: testId,
    titre: "Test Prod Redaction",
    sujet: "La faute en droit civil",
    type: "Dissertation",
    contenu: fakeCopy,
    statut: "brouillon",
    user_id: '1993bac5-94ee-4456-a3ef-91d2a36d19ff'
  }).select().single();

  if (insertError) {
    console.error("Erreur insertion:", insertError);
    return;
  }
  console.log("-> Rédaction insérée dans Supabase Prod");

  // 2. Call Vercel API
  console.log("-> Envoi de la requête POST à https://tuina-ai.vercel.app/api/redaction");
  const startTime = Date.now();
  const res = await fetch('https://tuina-ai.vercel.app/api/redaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: testId })
  });

  const duration = Date.now() - startTime;
  console.log(`-> Statut de la réponse: ${res.status} (en ${duration}ms)`);
  
  // 3. Get the JSON
  const rawText = await res.text();
  console.log("-> Réponse brute de Vercel :");
  console.log(rawText.substring(0, 500) + (rawText.length > 500 ? "..." : ""));
  
  let jsonResponse;
  try {
    jsonResponse = JSON.parse(rawText);
    console.log("-> JSON parsé avec succès !");
  } catch (e) {
    console.log("-> ERREUR: Vercel a renvoyé un JSON invalide ou une erreur serveur.");
  }
  
  // 4. Update in DB (Simulate Frontend action)
  if (jsonResponse && !jsonResponse.error) {
    await supabase.from('redactions').update({
      rapport_analyse: jsonResponse,
      statut: 'analysé'
    }).eq('id', testId);
    
    console.log("-> JSON enregistré dans Supabase");
  }

  // 5. Read back from DB
  const { data: finalData } = await supabase.from('redactions').select('rapport_analyse').eq('id', testId).single();
  console.log("-> Contenu relu depuis Supabase (rapport_analyse.note_globale):", finalData.rapport_analyse?.note_globale || "NULL");

  // Cleanup
  await supabase.from('redactions').delete().eq('id', testId);
}

verifyProd();
