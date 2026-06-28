import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runValidation() {
  console.log("=== RAPPORT DE VALIDATION ===");
  try {
    // 1. ÉVALUATION
    console.log("\\n[1] TEST DU MODULE ÉVALUATION (Génération)");
    const evalRes = await fetch('http://localhost:3000/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'dummy',
        coursName: 'Test Automatisé',
        coursId: 'test-123',
        type: 'qcm',
        count: 2
      })
    });
    
    let evalText = await evalRes.text();
    console.log("-> Réponse brute reçue du stream :");
    console.log(evalText);

    let cleanedEval = evalText.trim();
    if (cleanedEval.startsWith('```json')) cleanedEval = cleanedEval.slice(7);
    else if (cleanedEval.startsWith('```')) cleanedEval = cleanedEval.slice(3);
    if (cleanedEval.endsWith('```')) cleanedEval = cleanedEval.slice(0, -3);

    const evalJson = JSON.parse(cleanedEval.trim());
    console.log("\\n-> JSON Validé (Évaluation) :");
    console.log(JSON.stringify(evalJson, null, 2));

    if (evalJson.error) {
      console.log("ERREUR DÉTECTÉE PAR LA BARRIÈRE :", evalJson.error);
    } else {
      console.log("✅ Évaluation OK");
    }

    // 2. RÉDACTION
    console.log("\\n[2] TEST DU MODULE RÉDACTION (Analyse)");
    // Insert dummy redaction
    const { data: newRedac, error: insErr } = await supabase.from('redactions').insert([{
      titre: "Devoir Test",
      type: "Dissertation",
      sujet: "La responsabilité",
      contenu: "La responsabilité civile est engagée en cas de faute. C'est l'article 1240 du Code civil.",
      user_id: '00000000-0000-0000-0000-000000000000' // user might fail if FK constraints exist. We will just use the first user in DB.
    }]).select().single();

    let redacId = newRedac?.id;
    if (insErr) {
       console.log("Impossible d'insérer, on prend une rédaction existante.");
       const { data: exist } = await supabase.from('redactions').select('id, contenu').limit(1).single();
       if (exist && exist.contenu) redacId = exist.id;
    }

    if (redacId) {
      const redacRes = await fetch('http://localhost:3000/api/redaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: redacId })
      });
      let redacText = await redacRes.text();
      console.log("\\n-> Réponse brute reçue (Rédaction) :");
      console.log(redacText);

      let cleanedRedac = redacText.trim();
      if (cleanedRedac.startsWith('```json')) cleanedRedac = cleanedRedac.slice(7);
      else if (cleanedRedac.startsWith('```')) cleanedRedac = cleanedRedac.slice(3);
      if (cleanedRedac.endsWith('```')) cleanedRedac = cleanedRedac.slice(0, -3);

      const redacJson = JSON.parse(cleanedRedac.trim());
      console.log("\\n-> JSON Validé (Rédaction) :");
      console.log(JSON.stringify(redacJson, null, 2));
      console.log("✅ Rédaction OK");
    } else {
      console.log("Pas de rédaction valide pour tester.");
    }
  } catch (err) {
    console.error("Erreur durant la validation :", err);
  }
}

runValidation();
