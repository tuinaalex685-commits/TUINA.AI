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
