"use server";

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// 1. Matières
export async function createMatiere(titre: string, description: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from('matieres')
    .insert([
      { user_id: user.id, titre, description }
    ]);

  if (error) return { error: error.message };
  
  revalidatePath('/app/matieres');
  return { success: true };
}
export async function deleteMatiere(matiereId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('matieres')
    .delete()
    .eq('id', matiereId);

  if (error) return { error: error.message };
  
  revalidatePath('/app/matieres');
  return { success: true };
}

// 2. Cours
export async function createCours(matiereId: string, titre: string) {
  const supabase = await createClient();
  // Sécurité: RLS garantit qu'on ne peut pas insérer dans une matière qui ne nous appartient pas
  const { error } = await supabase
    .from('cours')
    .insert([
      { matiere_id: matiereId, titre }
    ]);

  if (error) return { error: error.message };
  
  revalidatePath(`/app/matieres/${matiereId}`);
  return { success: true };
}
export async function deleteCours(coursId: string, matiereId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('cours')
    .delete()
    .eq('id', coursId);

  if (error) return { error: error.message };
  
  revalidatePath(`/app/matieres/${matiereId}`);
  return { success: true };
}

// 3. Chapitres
export async function createChapitre(coursId: string, matiereId: string, titre: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('chapitres')
    .insert([
      { cours_id: coursId, titre }
    ]);

  if (error) return { error: error.message };
  
  revalidatePath(`/app/matieres/${matiereId}`);
  revalidatePath(`/app/matieres/${matiereId}/cours/${coursId}`);
  return { success: true };
}

export async function updateChapitreContent(chapitreId: string, coursId: string, contenu: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('chapitres')
    .update({ contenu_texte: contenu })
    .eq('id', chapitreId);

  if (error) return { error: error.message };
  
  revalidatePath(`/app/matieres/cours/${coursId}`); // Invalidate whatever path is needed
  return { success: true };
}

// 4. Objectifs
export async function createObjectif(titre: string, type: string, cible: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.from('objectifs').insert([{ user_id: user.id, titre, type, cible }]);
  console.log("Supabase insert result:", error);
  if (error) return { error: error.message };
  
  revalidatePath('/app/objectifs');
  revalidatePath('/app/dashboard');
  return { success: true };
}

export async function updateObjectifProgress(id: string, progression: number) {
  const supabase = await createClient();
  const { error } = await supabase.from('objectifs').update({ progression }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/app/objectifs');
  revalidatePath('/app/dashboard');
  return { success: true };
}

export async function deleteObjectif(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('objectifs').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/app/objectifs');
  revalidatePath('/app/dashboard');
  return { success: true };
}

// 5. Evaluations
export async function updateEvaluationScore(evaluationId: string, score: number) {
  const supabase = await createClient();
  const { error } = await supabase.from('evaluations').update({ score }).eq('id', evaluationId);
  if (error) return { error: error.message };
  revalidatePath('/app/evaluations');
  revalidatePath('/app/progression');
  return { success: true };
}
