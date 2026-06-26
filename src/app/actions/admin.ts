"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

// Générer un code aléatoire de type TUINA-XXXXX
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Pas de O, 0, 1, I pour éviter les confusions
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TUINA-${result}`;
}

export async function createAccessCode() {
  try {
    const code = generateRandomCode();
    
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
        return { error: "Un code d'accès existe déjà pour cet email." };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard/users');
    return { success: true, data };
  } catch (err) {
    return { error: "Erreur inattendue." };
  }
}

export async function updateAccessCodeStatus(id: string, status: 'active' | 'inactive' | 'blocked') {
  // 1. Mettre à jour le statut du code
  const { data: codeData, error } = await supabaseAdmin
    .from('access_codes')
    .update({ status })
    .eq('id', id)
    .select('email')
    .single();

  if (error) return { error: error.message };

  // 2. Bannir ou Débannir instantanément l'utilisateur dans Supabase Auth
  // Cela bloque TOUTES ses requêtes API sans avoir besoin de charger le middleware
  if (codeData?.email) {
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const user = usersData.users.find(u => u.email === codeData.email);
    
    if (user) {
      if (status === 'inactive' || status === 'blocked') {
        // Banni pendant 100 ans = effet immédiat
        await supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
      } else {
        // Débanni
        await supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: "none" });
      }
    }
  }

  revalidatePath('/admin/dashboard/users');
  return { success: true };
}

export async function deleteAccessCode(id: string, email: string) {
  // 1. Supprimer le code
  const { error: codeError } = await supabaseAdmin
    .from('access_codes')
    .delete()
    .eq('id', id);

  if (codeError) return { error: codeError.message };

  // 2. Tenter de supprimer le compte utilisateur de l'auth Supabase s'il s'était déjà connecté
  // (Cela l'empêchera totalement de se reconnecter)
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const user = usersData.users.find(u => u.email === email);
  
  if (user) {
    await supabaseAdmin.auth.admin.deleteUser(user.id);
  }

  revalidatePath('/admin/dashboard/users');
  return { success: true };
}
