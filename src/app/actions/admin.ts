"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// --- FONCTION DE SÉCURITÉ RÉUTILISABLE ---
async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Utilisateur non authentifié");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (role?.role !== "admin") {
    throw new Error("Accès administrateur refusé");
  }

  return user;
}

export async function createAccessCode(customCode: string) {
  try {
    await requireAdmin(); // Vérification de sécurité obligatoire
    
    if (!customCode || customCode.trim() === '') {
      return { error: "Le code d'accès ne peut pas être vide." };
    }
    
    const code = customCode.trim();

    // On insère le code sans email (il sera lié lors de la première utilisation)
    const { data, error } = await supabaseAdmin
      .from('access_codes')
      .insert([
        { code, status: 'active', email: null }
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { error: "Ce code d'accès existe déjà." };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard/users');
    revalidatePath('/admin/dashboard');
    return { success: true, data };
  } catch (err: any) {
    return { error: err.message || "Erreur inattendue." };
  }
}

export async function updateAccessCodeStatus(id: string, status: 'active' | 'inactive' | 'blocked') {
  try {
    await requireAdmin(); // Vérification de sécurité obligatoire

    // 1. Mettre à jour le statut du code
    const { data: codeData, error } = await supabaseAdmin
      .from('access_codes')
      .update({ status })
      .eq('id', id)
      .select('email')
      .single();

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard/users');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteAccessCode(id: string, email: string) {
  try {
    await requireAdmin(); // Vérification de sécurité obligatoire

    // 1. Supprimer le code
    const { error: codeError } = await supabaseAdmin
      .from('access_codes')
      .delete()
      .eq('id', id);

    if (codeError) return { error: codeError.message };

    revalidatePath('/admin/dashboard/users');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// PURGE DÉFINITIVE d'un utilisateur : supprime le compte (auth) ET toutes ses données. IRRÉVERSIBLE.
// Gardes : impossible de purger un compte 'admin' ni son propre compte.
export async function purgeUser(email: string) {
  try {
    const adminUser = await requireAdmin();
    if (!email) return { error: 'Email manquant : ce code n’est lié à aucun compte.' };

    const { data: role } = await supabaseAdmin
      .from('user_roles').select('user_id, role').eq('email', email).maybeSingle();
    if (role?.role === 'admin') return { error: 'Impossible de purger un compte administrateur.' };
    const uid = role?.user_id as string | undefined;
    if (uid && uid === adminUser.id) return { error: 'Vous ne pouvez pas purger votre propre compte.' };

    if (uid) {
      const { data: docs } = await supabaseAdmin.from('documents').select('id').eq('user_id', uid);
      const docIds = (docs || []).map((d: any) => d.id);
      if (docIds.length) {
        const { data: cours } = await supabaseAdmin.from('etude_cours').select('id').in('pdf_id', docIds);
        const cids = (cours || []).map((c: any) => c.id);
        if (cids.length) {
          await supabaseAdmin.from('etude_sections').delete().in('cours_id', cids);
          await supabaseAdmin.from('etude_cours').delete().in('id', cids);
        }
        await supabaseAdmin.from('flashcards').delete().in('document_id', docIds);
        await supabaseAdmin.from('evaluations').delete().in('document_id', docIds);
      }
      // Données liées à l'utilisateur (best-effort : on tolère les tables absentes).
      for (const tbl of ['flashcards', 'evaluations', 'redactions', 'ai_jobs', 'historique_revisions',
        'etude_progression_sections', 'etude_progression_themes', 'etude_progression_cours', 'documents']) {
        await supabaseAdmin.from(tbl).delete().eq('user_id', uid).then(() => {}, () => {});
      }
      await supabaseAdmin.from('user_roles').delete().eq('user_id', uid);
    }
    await supabaseAdmin.from('access_codes').delete().eq('email', email);
    if (uid) { try { await supabaseAdmin.auth.admin.deleteUser(uid); } catch { /* déjà supprimé */ } }

    revalidatePath('/admin/dashboard/users');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
