"use server";

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateJSON } from '@/lib/gemini';
import { SchemaType, Schema } from '@google/generative-ai';

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
      .insert([{ user_id: user.id, titre, type }])
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
      "Tu es un correcteur juridique strict. Analyse la rédaction de l'étudiant en évaluant l'introduction, la structure, le raisonnement et la conclusion.",
      `TYPE DE DEVOIR : ${redaction.type}\n\nRÉDACTION DE L'ÉTUDIANT :\n${redaction.contenu}`,
      schema as Schema
    );

    const { error: updateError } = await supabase
      .from('redactions')
      .update({ statut: 'analyse', rapport_analyse: feedbackJson })
      .eq('id', id);

    if (updateError) throw updateError;

    revalidatePath('/app/redaction');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
