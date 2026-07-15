"use server";


import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// L'analyse IA des rédactions est désormais gérée par le système de jobs unifié
// (actions/jobs.ts enqueueAiJob('redaction') → /api/worker/ai). Ce fichier ne conserve
// que le CRUD des rédactions et le compteur de quota.

export async function createRedaction(titre: string, type: string, etudeCoursId?: string | null) {
  console.log(`[REDACTION] createRedaction appelée: titre="${titre}", type="${type}"`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.log(`[REDACTION ERROR] auth.getUser: ${authError.message}`);
    if (!user) return { error: "Non authentifié" };

    // Soft-gate INC.3 : rattachement FACULTATIF à un cours Étude. On ne conserve
    // l'id que s'il correspond à un cours réellement travaillé par l'utilisateur
    // (défense : évite d'associer un cours arbitraire). Sinon → NULL.
    let coursId: string | null = null;
    if (etudeCoursId) {
      const { data: prog } = await supabase
        .from('etude_progression_cours')
        .select('cours_id')
        .eq('user_id', user.id)
        .eq('cours_id', etudeCoursId)
        .maybeSingle();
      if (prog) coursId = etudeCoursId;
    }

    console.log(`[REDACTION] Insertion dans la table redactions pour user ${user.id}...`);
    // On n'ajoute etude_cours_id QUE si un cours est réellement associé : ainsi
    // la création reste fonctionnelle même si la migration softgate n'est pas
    // encore passée en prod (dégradation gracieuse — cf. redaction_softgate.sql).
    const payload: Record<string, any> = { user_id: user.id, titre, type, sujet: titre };
    if (coursId) payload.etude_cours_id = coursId;

    const { data, error } = await supabase
      .from('redactions')
      .insert([payload])
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
    .gte('date_creation', startOfDay.toISOString());
    
  return count || 0;
}
