import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRedactionWorkflow() {
  console.log("=== AUDIT DU WORKFLOW RÉDACTION ===");

  // 1. L'étudiant écrit entièrement sa copie (Simulation de l'enregistrement DB)
  const testId = '00000000-0000-0000-0000-000000000000'; // ID fixe pour le test
  const fakeCopy = "Ceci est une dissertation juridique test. Le droit de la responsabilité civile repose sur l'article 1240 du Code civil, qui stipule que tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer. La faute, le préjudice et le lien de causalité sont les trois piliers essentiels.";
  
  await supabase.from('redactions').delete().eq('id', testId);
  const { data: insertData, error: insertError } = await supabase.from('redactions').insert({
    id: testId,
    titre: "Dissertation Test Audit",
    sujet: "La responsabilité civile extracontractuelle",
    type: "Dissertation",
    contenu: fakeCopy,
    statut: "brouillon",
    user_id: '1993bac5-94ee-4456-a3ef-91d2a36d19ff' // Utilisateur valide
  }).select().single();

  if (insertError) {
    console.error("Erreur insertion:", insertError);
    return;
  }
  
  console.log("\\n-> Contenu enregistré dans Supabase (Avant Analyse) :");
  console.log(insertData.contenu);

  // 2. Il clique sur "Analyser" -> Le frontend appelle /api/redaction
  console.log("\\n-> Envoi à l'API /api/redaction");
  const res = await fetch('https://tuina-ai.vercel.app/api/redaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: testId })
  });

  const rawText = await res.text();
  console.log("\\n-> Réponse brute streamée depuis Gemini via l'API :");
  console.log(rawText);

  // 3. Parsing du JSON
  let cleanedText = rawText.trim();
  if (cleanedText.startsWith('```json')) cleanedText = cleanedText.slice(7);
  else if (cleanedText.startsWith('```')) cleanedText = cleanedText.slice(3);
  if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedText.trim());
    console.log("\\n-> JSON Obtenu après parsing :");
    console.log(JSON.stringify(parsedJson, null, 2));
  } catch (e) {
    console.log("\\n-> ERREUR DE PARSING JSON :", e.message);
    return;
  }

  // 4. Enregistrement dans Supabase
  const { error: updateError } = await supabase.from('redactions').update({
    rapport_analyse: parsedJson,
    statut: 'analysé'
  }).eq('id', testId);

  if (updateError) console.error("Erreur update:", updateError);

  // 5. Relecture depuis Supabase
  const { data: relecture } = await supabase.from('redactions').select('*').eq('id', testId).single();
  console.log("\\n-> Contenu relu depuis Supabase (rapport_analyse) :");
  console.log(JSON.stringify(relecture.rapport_analyse, null, 2));
  
  // Nettoyage final
  await supabase.from('redactions').delete().eq('id', testId);
}

testRedactionWorkflow();
