"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { isNiveau } from '@/lib/profileShared';
import { enqueueDedup } from '@/lib/jobs/enqueue';
import { ENGINE_VERSION } from '@/lib/etude3/types';
import { documentsAvecEtudeV4 } from '@/lib/etude3/examen';
import { getAnalyse, getSequence } from '@/lib/etude3/store';

// --- FONCTION DE SÉCURITÉ RÉUTILISABLE (même pattern que actions/admin.ts) ---
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Utilisateur non authentifié");

  const { data: role } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") throw new Error("Accès administrateur refusé");

  return user;
}

function revalidateCatalog() {
  revalidatePath('/admin/dashboard/catalogue');
  revalidatePath('/app/catalogue');
}

// Liste les cours déjà générés (statut 'pret') pas encore publiés au catalogue, avec le nom
// du document source pour que l'admin puisse choisir quoi publier en connaissance de cause.
// NB : etude_cours.pdf_id n'est PAS une vraie clé étrangère PostgREST (jamais déclarée en tant que
// telle en base) — la syntaxe de jointure imbriquée `documents(nom)` échoue (PGRST200). Deux requêtes
// séparées + fusion en mémoire, comme le fait déjà /app/etude/[pdfId]/page.tsx.
export async function listPublishableCourses() {
  try {
    await requireAdmin();

    const { data: alreadyPublished } = await supabaseAdmin
      .from('catalog_courses').select('etude_cours_id');
    const excludedIds = (alreadyPublished || []).map((c: any) => c.etude_cours_id);

    let query = supabaseAdmin
      .from('etude_cours')
      .select('id, pdf_id, created_at')
      .eq('statut_generation', 'pret')
      .order('created_at', { ascending: false });

    if (excludedIds.length > 0) query = query.not('id', 'in', `(${excludedIds.join(',')})`);

    const { data: anciens, error } = await query;
    if (error) return { error: error.message };

    // Cours étudiés par un Premium avec la nouvelle Étude guidée (analyse commune prête), pas encore publiés.
    const { data: publies } = excludedIds.length ? await supabaseAdmin.from('etude_cours').select('pdf_id').in('id', excludedIds) : { data: [] as { pdf_id: string }[] };
    const pdfPublies = new Set((publies || []).map((c: any) => c.pdf_id));
    const { data: parcours } = await supabaseAdmin.from('etude_parcours').select('document_id')
      .eq('engine_version', ENGINE_VERSION).not('source_hash', 'is', null).limit(2000);
    const candidats = Array.from(new Set((parcours || []).map((p: any) => p.document_id as string))).filter((id) => !pdfPublies.has(id));
    const v4 = await documentsAvecEtudeV4(candidats);
    const dejaListes = new Set((anciens || []).map((c: any) => c.pdf_id));
    const nouveaux = Array.from(v4.keys()).filter((id) => !dejaListes.has(id)).map((id) => ({ id: `doc:${id}`, pdf_id: id, created_at: '' }));
    const courses = [...nouveaux, ...(anciens || [])];
    if (courses.length === 0) return { success: true, courses: [] };

    const pdfIds = courses.map((c: any) => c.pdf_id);
    const { data: docs } = await supabaseAdmin.from('documents').select('id, nom').in('id', pdfIds);
    const nomById = new Map((docs || []).map((d: any) => [d.id, d.nom]));

    const enriched = courses.map((c: any) => ({ ...c, documentNom: nomById.get(c.pdf_id) || 'Document sans nom' }));
    return { success: true, courses: enriched };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Vue admin complète (actifs ET désactivés) pour gérer le catalogue.
export async function listCatalogAdmin() {
  try {
    await requireAdmin();
    const { data, error } = await supabaseAdmin
      .from('catalog_courses')
      .select('*')
      .order('ordre', { ascending: true });
    if (error) return { error: error.message };
    return { success: true, entries: data || [] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function publishToCatalog(etudeCoursId: string, titreAffiche: string, matiere?: string, niveau?: string | null) {
  try {
    const admin = await requireAdmin();
    if (!titreAffiche || titreAffiche.trim() === '') {
      return { error: "Le titre affiché ne peut pas être vide." };
    }
    // Niveau invalide = refus explicite (jamais une publication « à tous » par erreur).
    if (niveau && !isNiveau(niveau)) return { error: 'Niveau inconnu.' };

    // Sécurité : n'accepter que des cours réellement prêts (jamais un cours en cours de
    // génération ou en erreur — le catalogue ne doit exposer que du contenu stable).
    if (etudeCoursId.startsWith('doc:')) {
      const pdfId = etudeCoursId.slice(4);
      if (!(await documentsAvecEtudeV4([pdfId])).has(pdfId)) return { error: "L'Étude guidée de ce cours n'est pas encore prête." };
      const { data: ancre } = await supabaseAdmin.from('etude_cours').select('id').eq('pdf_id', pdfId).maybeSingle();
      if (ancre) etudeCoursId = ancre.id;
      else {
        const { data: cree, error: e } = await supabaseAdmin.from('etude_cours').insert({ pdf_id: pdfId, statut_generation: 'pret' }).select('id').single();
        if (e || !cree) return { error: 'Publication impossible pour le moment.' };
        etudeCoursId = cree.id;
      }
    }
    const { data: cours } = await supabaseAdmin
      .from('etude_cours').select('id, pdf_id, statut_generation').eq('id', etudeCoursId).maybeSingle();
    if (!cours) return { error: "Cours introuvable." };
    if (cours.statut_generation !== 'pret') {
      return { error: "Ce cours n'est pas encore prêt (génération en cours ou en erreur)." };
    }
    // Ancienne Étude guidée : un cours « prêt » sans section (résidu V1) ne doit jamais atterrir au
    // catalogue. Nouvelle Étude guidée : c'est l'analyse commune prête qui fait foi.
    const estV4 = (await documentsAvecEtudeV4([cours.pdf_id as string])).size > 0;
    if (!estV4) {
      const { count: sectionCount } = await supabaseAdmin
        .from('etude_sections').select('id', { count: 'exact', head: true }).eq('cours_id', etudeCoursId);
      if (!sectionCount || sectionCount === 0) {
        return { error: "Ce cours n'a aucune section générée (probablement un ancien format) — impossible à publier." };
      }
    }

    const { data, error } = await supabaseAdmin
      .from('catalog_courses')
      .insert([{ etude_cours_id: etudeCoursId, titre_affiche: titreAffiche.trim(), matiere: matiere?.trim() || null, niveau: isNiveau(niveau) ? niveau : null, actif: true, added_by: admin.id }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return { error: "Ce cours est déjà publié au catalogue." };
      return { error: error.message };
    }

    // Pré-génération de la banque d'examen, maintenant que le cours est publié.
    // Sans cela, le PREMIER étudiant Free qui lance un examen sur ce cours attend la
    // génération complète — mauvaise première impression sur la fonctionnalité qui doit
    // justement le séduire. Générée une fois ici, elle est ensuite mutualisée par
    // source_hash entre tous les utilisateurs : aucun appel Gemini supplémentaire.
    //
    // Best-effort et volontairement non bloquant : si l'enqueue échoue, la publication
    // reste valide (la banque sera générée à la première demande, comme avant).
    await prepareExamBank(cours.id).catch(() => {});
    await preparerEtudeGuidee(admin.id, cours.id).catch(() => {});

    revalidateCatalog();
    return { success: true, entry: data };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * S'assure qu'une banque d'examen existe (ou est en préparation) pour un cours publié.
 * Utilisable aussi pour rattraper les cours publiés avant l'arrivée des examens catalogue.
 */
export async function prepareExamBank(etudeCoursId: string) {
  try {
    await requireAdmin();

    const { data: cours } = await supabaseAdmin
      .from('etude_cours').select('id, pdf_id').eq('id', etudeCoursId).maybeSingle();
    if (!cours?.pdf_id) return { error: "Cours introuvable." };

    const { data: doc } = await supabaseAdmin
      .from('documents').select('text_hash').eq('id', cours.pdf_id).maybeSingle();

    // Banque déjà en cache pour ce contenu → rien à faire, surtout pas un nouveau job.
    if (doc?.text_hash) {
      const { data: pool } = await supabaseAdmin
        .from('examen_question_pools').select('id').eq('source_hash', doc.text_hash).maybeSingle();
      if (pool) return { success: true, alreadyReady: true };
    }

    const { enqueueAiJob } = await import('@/app/actions/jobs');
    const res: any = await enqueueAiJob('examen_pool', { documentId: cours.pdf_id });
    if (res?.error) return { error: res.error };
    return { success: true, jobId: res.jobId };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Retrait définitif de l'index catalogue. N'affecte JAMAIS etude_cours/sections/themes
// (aucun ON DELETE CASCADE dans ce sens) : le cours original et son contenu restent intacts,
// seule la ligne d'index disparaît — republier nécessite de refaire publishToCatalog().
export async function removeFromCatalog(id: string) {
  try {
    await requireAdmin();
    const { error } = await supabaseAdmin.from('catalog_courses').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidateCatalog();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Désactivation/réactivation temporaire : garde titre/ordre/matière pour une remise en ligne
// instantanée, sans jamais toucher au cours original.
export async function setCatalogActive(id: string, actif: boolean) {
  try {
    await requireAdmin();
    const { error } = await supabaseAdmin.from('catalog_courses').update({ actif }).eq('id', id);
    if (error) return { error: error.message };
    revalidateCatalog();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function reorderCatalog(updates: { id: string; ordre: number }[]) {
  try {
    await requireAdmin();
    for (const u of updates) {
      const { error } = await supabaseAdmin.from('catalog_courses').update({ ordre: u.ordre }).eq('id', u.id);
      if (error) return { error: error.message };
    }
    revalidateCatalog();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function renameCatalogEntry(id: string, titreAffiche: string, matiere?: string) {
  try {
    await requireAdmin();
    if (!titreAffiche || titreAffiche.trim() === '') {
      return { error: "Le titre affiché ne peut pas être vide." };
    }
    const { error } = await supabaseAdmin
      .from('catalog_courses')
      .update({ titre_affiche: titreAffiche.trim(), matiere: matiere?.trim() || null })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateCatalog();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Niveau d'un cours du catalogue (L1, L2…) ou null = proposé à tous les niveaux.
 * Le niveau ne concerne que la visibilité dans le catalogue gratuit, jamais l'abonnement.
 */
export async function setCatalogNiveau(id: string, niveau: string | null) {
  try {
    await requireAdmin();
    if (niveau !== null && !isNiveau(niveau)) return { error: 'Niveau inconnu.' };
    const { error } = await supabaseAdmin.from('catalog_courses').update({ niveau }).eq('id', id);
    if (error) return { error: error.message };
    revalidateCatalog();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}


/**
 * Prépare l'Étude guidée d'un cours du catalogue (analyse du cours, puis le worker enchaîne sur
 * TOUTES ses leçons). Payé une seule fois, au nom de l'administrateur : ensuite, les étudiants du
 * catalogue n'attendent rien et ne déclenchent aucune génération.
 */
async function preparerEtudeGuidee(adminId: string, etudeCoursId: string) {
  const { data: cours } = await supabaseAdmin.from('etude_cours').select('pdf_id').eq('id', etudeCoursId).maybeSingle();
  if (!cours?.pdf_id) return;
  const hash = (await documentsAvecEtudeV4([cours.pdf_id])).get(cours.pdf_id);
  if (!hash) {
    // Pas encore d'analyse de la nouvelle Étude guidée : le worker l'enchaînera sur toutes les leçons.
    await enqueueDedup({ userId: adminId, type: 'etude3_analyse', payload: { documentId: cours.pdf_id }, dedupKey: `${ENGINE_VERSION}:${cours.pdf_id}` });
    return;
  }
  // Analyse déjà faite (par l'étudiant Premium) : seules les leçons qu'il n'a pas ouvertes sont générées.
  const analyse = await getAnalyse(hash);
  for (const p of analyse?.plan || []) {
    if (await getSequence(hash, p.ordre)) continue;
    await enqueueDedup({ userId: adminId, type: 'etude3_sequence', payload: { documentId: cours.pdf_id, hash, ordre: p.ordre }, dedupKey: `${ENGINE_VERSION}:${hash}:${p.ordre}` }).catch(() => {});
  }
}

/** Administration : prépare l'Étude guidée de tous les cours actifs du catalogue (après une nouvelle version du moteur). */
export async function preparerEtudesCatalogue() {
  try {
    const admin = await requireAdmin();
    const { data: entries } = await supabaseAdmin.from('catalog_courses').select('etude_cours_id').eq('actif', true);
    let n = 0;
    for (const e of entries || []) { await preparerEtudeGuidee(admin.id, e.etude_cours_id).catch(() => {}); n++; }
    return { success: true, count: n };
  } catch (err: any) {
    return { error: err?.message || 'Préparation impossible.' };
  }
}
