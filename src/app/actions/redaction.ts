"use server";


import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateStructuredJSON } from '@/lib/gemini';
import { Type } from '@google/genai';

export async function createRedaction(titre: string, type: string) {
  console.log(`[REDACTION] createRedaction appelée: titre="${titre}", type="${type}"`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.log(`[REDACTION ERROR] auth.getUser: ${authError.message}`);
    if (!user) return { error: "Non authentifié" };

    console.log(`[REDACTION] Insertion dans la table redactions pour user ${user.id}...`);
    const { data, error } = await supabase
      .from('redactions')
      .insert([{ user_id: user.id, titre, type, sujet: titre }])
      .select()
      .single();

    if (error) {
      console.log(`[REDACTION ERROR] Erreur insertion: ${error.message} (Code: ${error.code})`);
      return { error: error.message };
    }
    
    console.log(`[REDACTION] Insertion réussie. ID: ${data.id}`);
    revalidatePath('/app/redaction');
    return { success: true, redaction: data };
  } catch (err: any) {
    console.log(`[REDACTION FATAL] ${err.message}\n${err.stack}`);
    return { error: `Erreur serveur: ${err.message}` };
  }
}

export async function updateRedactionContent(id: string, contenu: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('redactions')
    .update({ contenu })
    .eq('id', id);

  if (error) return { error: error.message };
  
  revalidatePath('/app/redaction');
  return { success: true };
}

export async function saveRedactionVersion(redactionId: string, contenu: string) {
  const supabase = await createClient();
  
  // Mettre à jour la rédaction principale
  const { error: updateError } = await supabase
    .from('redactions')
    .update({ contenu })
    .eq('id', redactionId);
    
  if (updateError) return { error: updateError.message };

  // Créer une version dans l'historique
  const { error: versionError } = await supabase
    .from('redaction_versions')
    .insert([{ redaction_id: redactionId, contenu }]);

  if (versionError) return { error: versionError.message };
  
  revalidatePath('/app/redaction');
  return { success: true };
}

export async function sendRedactionForAnalysis(id: string) {
  const serverActionStartTime = Date.now();
  console.log(`[PERF] --------------------------------------------------`);
  console.log(`[PERF] Heure de début de la Server Action (Redaction) : ${new Date(serverActionStartTime).toISOString()}`);
  
  const supabase = await createClient();
  
  // Récupérer la rédaction
  const { data: redaction, error: fetchError } = await supabase
    .from('redactions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !redaction || !redaction.contenu) {
    return { error: "Rédaction introuvable ou vide." };
  }

  // Schema attendu par Gemini / Mock
  const schema = {
    type: Type.OBJECT,
    properties: {
      points_forts: { type: Type.ARRAY, items: { type: Type.STRING } },
      points_faibles: { type: Type.ARRAY, items: { type: Type.STRING } },
      axes_amelioration: { type: Type.ARRAY, items: { type: Type.STRING } },
      note_globale: { type: Type.STRING, description: "Note sur 20 avec courte appréciation" }
    },
    required: ["points_forts", "points_faibles", "axes_amelioration", "note_globale"]
  };

  try {
    const preGeminiTime = Date.now();
    console.log(`[PERF] Heure juste avant l'appel à Gemini : ${new Date(preGeminiTime).toISOString()}`);
    
    const feedbackJson = await generateStructuredJSON(
      "Tu es un correcteur juridique strict. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.",
      `TYPE DE DEVOIR : ${redaction.type}\n\nRÉDACTION DE L'ÉTUDIANT :\n${redaction.contenu}`,
      schema
    );

    const postGeminiTime = Date.now();
    console.log(`[PERF] Heure de retour de Gemini : ${new Date(postGeminiTime).toISOString()}`);
    console.log(`[PERF] Temps exact passé à attendre Gemini : ${postGeminiTime - preGeminiTime} ms`);
    console.log(`[ACTION REDACTION] generateJSON terminé avec succès. Résultat: ${JSON.stringify(feedbackJson).substring(0, 150)}...`);

    const preInsertTime = Date.now();
    const { error: updateError } = await supabase
      .from('redactions')
      .update({ statut: 'analyse', rapport_analyse: feedbackJson })
      .eq('id', id);
    const postInsertTime = Date.now();
    console.log(`[PERF] Temps de mise à jour Supabase : ${postInsertTime - preInsertTime} ms`);

    if (updateError) {
      console.error(`[ACTION REDACTION] Erreur update Supabase: ${updateError.message}`, updateError);
      throw updateError;
    }

    revalidatePath('/app/redaction');
    const endTime = Date.now();
    console.log(`[PERF] Temps total d'exécution de la Server Action : ${endTime - serverActionStartTime} ms`);
    return { success: true };
  } catch (err: any) {
    const errorTime = Date.now();
    console.log(`[PERF] Temps total d'exécution avant FATAL ERROR : ${errorTime - serverActionStartTime} ms`);
    console.error(`[ACTION REDACTION FATAL] Erreur: ${err.message}`, err.stack);
    return { error: err.message };
  }
}

export async function updateRedactionStatusAction(id: string, rapport_analyse: any) {
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from('redactions')
    .update({ statut: 'analyse', rapport_analyse })
    .eq('id', id);

  if (updateError) {
    console.error("Erreur updateRedactionStatusAction:", updateError);
    return { error: updateError.message };
  }

  revalidatePath('/app/redaction');
  return { success: true };
}

export async function getDailyRedactionUsage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const { count } = await supabase
    .from('redactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('statut', 'analyse')
    .gte('created_at', startOfDay.toISOString());
    
  return count || 0;
}
