"use server";

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { removeOwnedFiles } from '@/lib/storage';
import { isPremium } from '@/lib/plan';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 240;

/** Titre nettoyé (espaces superflus retirés) ou null s'il est vide ou trop long. */
function cleanTitle(value: unknown, max = TITLE_MAX): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v.length > 0 && v.length <= max ? v : null;
}

// 1. Matières
// Toutes les écritures passent par le client de l'étudiant : la RLS (user_id = auth.uid(),
// et pour les cours « matière qui m'appartient ») reste la barrière finale.
export async function createMatiere(titre: string, description: string) {
  const cleanTitre = cleanTitle(titre);
  if (!cleanTitre) return { error: 'Titre de matière invalide.' };
  const cleanDescription = typeof description === 'string' ? description.trim().slice(0, DESCRIPTION_MAX) : '';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  // Même règle que la page : organiser ses matières est une fonction Premium.
  if (!(await isPremium(supabase, user.email))) return { error: 'Fonction réservée au Premium.' };

  const { error } = await supabase
    .from('matieres')
    .insert([{ user_id: user.id, titre: cleanTitre, description: cleanDescription || null }]);
  if (error) return { error: 'Création impossible.' };

  revalidatePath('/app/matieres');
  return { success: true };
}

/**
 * Supprime une matière, ses cours et TOUS ses PDF (lignes puis fichiers du bucket).
 * Sans ce nettoyage, la cascade SQL effaçait les lignes des PDF rangés dans un cours mais
 * laissait leurs fichiers dans le stockage, et les PDF sans cours restaient orphelins.
 */
export async function deleteMatiere(matiereId: string) {
  if (!UUID_RE.test(matiereId)) return { error: 'Requête invalide.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: matiere } = await supabase.from('matieres').select('id').eq('id', matiereId).eq('user_id', user.id).maybeSingle();
  if (!matiere) return { error: 'Matière introuvable.' };

  const { data: cours } = await supabase.from('cours').select('id').eq('matiere_id', matiereId);
  const coursIds = (cours || []).map((c) => c.id);
  const filter = coursIds.length ? `matiere_id.eq.${matiereId},cours_id.in.(${coursIds.join(',')})` : `matiere_id.eq.${matiereId}`;
  const { data: docs, error: docsError } = await supabase.from('documents').delete().eq('user_id', user.id).or(filter).select('url_fichier, url');
  if (docsError) return { error: 'Suppression impossible.' };

  // Les lignes des PDF sont déjà supprimées : leurs fichiers le sont aussi, même si la suite échoue.
  await removeOwnedFiles(user.id, (docs || []).flatMap((d) => [d.url_fichier, d.url]));

  const { error } = await supabase.from('matieres').delete().eq('id', matiereId).eq('user_id', user.id);
  if (error) return { error: 'Suppression impossible.' };

  revalidatePath('/app/matieres');
  return { success: true };
}

// 2. Cours
export async function createCours(matiereId: string, titre: string) {
  if (!UUID_RE.test(matiereId)) return { error: 'Requête invalide.' };
  const cleanTitre = cleanTitle(titre);
  if (!cleanTitre) return { error: 'Titre de cours invalide.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  if (!(await isPremium(supabase, user.email))) return { error: 'Fonction réservée au Premium.' };
  // La RLS refuse l'insertion dans une matière qui n'appartient pas à l'étudiant.
  const { error } = await supabase.from('cours').insert([{ matiere_id: matiereId, titre: cleanTitre }]);
  if (error) return { error: 'Création impossible.' };

  revalidatePath(`/app/matieres/${matiereId}`);
  return { success: true };
}

/** Supprime un cours et ses PDF (lignes puis fichiers du bucket). */
export async function deleteCours(coursId: string, matiereId: string) {
  if (!UUID_RE.test(coursId) || !UUID_RE.test(matiereId)) return { error: 'Requête invalide.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // La RLS ne renvoie le cours que s'il est dans une matière de l'étudiant.
  const { data: cours } = await supabase.from('cours').select('id').eq('id', coursId).eq('matiere_id', matiereId).maybeSingle();
  if (!cours) return { error: 'Cours introuvable.' };

  const { data: docs, error: docsError } = await supabase.from('documents').delete().eq('cours_id', coursId).eq('user_id', user.id).select('url_fichier, url');
  if (docsError) return { error: 'Suppression impossible.' };

  await removeOwnedFiles(user.id, (docs || []).flatMap((d) => [d.url_fichier, d.url]));

  const { error } = await supabase.from('cours').delete().eq('id', coursId);
  if (error) return { error: 'Suppression impossible.' };

  revalidatePath(`/app/matieres/${matiereId}`, 'layout');
  return { success: true };
}

// Garde Premium côté SERVEUR : les pages verrouillaient ces fonctions, mais les actions restaient
// appelables directement par un compte gratuit (ou dont le Premium a expiré).
async function premiumUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' } as const;
  if (!(await isPremium(supabase, user.email))) return { error: 'Fonction réservée au Premium.' } as const;
  return { supabase, user } as const;
}

// 3. Chapitres
export async function createChapitre(coursId: string, matiereId: string, titre: string) {
  if (!UUID_RE.test(coursId) || !UUID_RE.test(matiereId)) return { error: 'Requête invalide.' };
  const cleanTitre = cleanTitle(titre);
  if (!cleanTitre) return { error: 'Titre de chapitre invalide.' };
  const ctx = await premiumUser();
  if ('error' in ctx) return { error: ctx.error };

  // La RLS refuse l'insertion dans un cours qui n'appartient pas à l'étudiant.
  const { error } = await ctx.supabase.from('chapitres').insert([{ cours_id: coursId, titre: cleanTitre }]);
  if (error) return { error: 'Création impossible.' };

  revalidatePath(`/app/matieres/${matiereId}`);
  revalidatePath(`/app/matieres/${matiereId}/cours/${coursId}`);
  return { success: true };
}

const CONTENU_MAX = 200_000;
export async function updateChapitreContent(chapitreId: string, coursId: string, contenu: string) {
  if (!UUID_RE.test(chapitreId) || !UUID_RE.test(coursId)) return { error: 'Requête invalide.' };
  if (typeof contenu !== 'string' || contenu.length > CONTENU_MAX) return { error: 'Contenu trop long.' };
  const ctx = await premiumUser();
  if ('error' in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase.from('chapitres').update({ contenu_texte: contenu }).eq('id', chapitreId);
  if (error) return { error: 'Enregistrement impossible.' };

  revalidatePath(`/app/matieres/cours/${coursId}`);
  return { success: true };
}

// 4. Objectifs
const OBJECTIF_TYPES_MAX = 40;
export async function createObjectif(titre: string, type: string, cible: number) {
  const cleanTitre = cleanTitle(titre);
  if (!cleanTitre) return { error: 'Titre d’objectif invalide.' };
  if (typeof type !== 'string' || !type.trim() || type.length > OBJECTIF_TYPES_MAX) return { error: 'Type d’objectif invalide.' };
  if (!Number.isInteger(cible) || cible < 1 || cible > 100_000) return { error: 'Cible invalide.' };
  const ctx = await premiumUser();
  if ('error' in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase.from('objectifs').insert([{ user_id: ctx.user.id, titre: cleanTitre, type: type.trim(), cible }]);
  if (error) return { error: 'Création impossible.' };

  revalidatePath('/app/objectifs');
  revalidatePath('/app/dashboard');
  return { success: true };
}

export async function updateObjectifProgress(id: string, progression: number) {
  if (!UUID_RE.test(id) || !Number.isFinite(progression) || progression < 0 || progression > 1_000_000) return { error: 'Requête invalide.' };
  const ctx = await premiumUser();
  if ('error' in ctx) return { error: ctx.error };
  // RLS : seul l'objectif de l'étudiant est modifiable ; le filtre user_id le rend explicite.
  const { error } = await ctx.supabase.from('objectifs').update({ progression }).eq('id', id).eq('user_id', ctx.user.id);
  if (error) return { error: 'Mise à jour impossible.' };
  revalidatePath('/app/objectifs');
  revalidatePath('/app/dashboard');
  return { success: true };
}

// Supprimer SES données reste permis même après la fin du Premium.
export async function deleteObjectif(id: string) {
  if (!UUID_RE.test(id)) return { error: 'Requête invalide.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };
  const { error } = await supabase.from('objectifs').delete().eq('id', id).eq('user_id', user.id);
  if (error) return { error: 'Suppression impossible.' };
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
