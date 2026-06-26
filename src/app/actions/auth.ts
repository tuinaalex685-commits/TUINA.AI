"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function loginWithAccessCode(email: string, code: string) {
  try {
    // 0. BYPASS ADMINISTRATEUR : L'admin se connecte avec son mot de passe habituel
    if (email === 'tuinaalex685@gmail.com') {
      const supabase = await createClient();
      const { error: adminAuthError } = await supabase.auth.signInWithPassword({
        email,
        password: code, // Le champ "code" agit ici comme le mot de passe pour l'admin
      });
      if (adminAuthError) {
        return { error: "Mot de passe administrateur invalide." };
      }
      return { success: true, role: 'admin' };
    }

    // 1. Vérifier si le code existe globalement
    const { data: accessCode, error: codeError } = await supabaseAdmin
      .from('access_codes')
      .select('*')
      .eq('code', code)
      .single();

    if (codeError || !accessCode) {
      return { error: "Code d'accès invalide ou inexistant." };
    }

    // 2. Vérifier si le code est déjà assigné à quelqu'un d'autre
    if (accessCode.email && accessCode.email !== email) {
      return { error: "Ce code d'accès est déjà utilisé par un autre compte." };
    }

    // 3. Vérifier le statut du code
    if (accessCode.status === 'inactive') {
      return { error: "Ce code d'accès a été désactivé par l'administrateur." };
    }
    if (accessCode.status === 'blocked') {
      return { error: "L'accès à ce compte a été bloqué." };
    }

    // 4. Si le code est libre (email null), on l'assigne à cet utilisateur (Claiming)
    if (!accessCode.email) {
      await supabaseAdmin
        .from('access_codes')
        .update({ email: email })
        .eq('id', accessCode.id);
    }

    // 5. Vérifier si l'utilisateur existe déjà dans l'authentification Supabase
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers.users.find(u => u.email === email);

    // Si l'utilisateur n'existe pas, on le crée silencieusement en utilisant le code comme mot de passe
    if (!userExists) {
      const { error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: code,
        email_confirm: true, // Bypass l'email de confirmation !
      });

      if (signUpError) {
        console.error("Erreur création auth:", signUpError);
        return { error: "Erreur technique lors de la création du compte." };
      }
    }

    // 4. On connecte l'utilisateur sur le client
    // (Cette étape crée la session dans les cookies via le server component)
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: code,
    });

    if (signInError) {
      // S'il ne peut pas se connecter, c'est peut-être que son mot de passe initial
      // ne correspond plus (si on a régénéré un compte). Mais dans 99% des cas ça passera.
      console.error("Erreur signIn:", signInError);
      return { error: "Erreur de connexion. Vérifiez vos identifiants." };
    }

    // 5. On renvoie le rôle pour rediriger correctement
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('email', email)
      .single();

    return { success: true, role: roleData?.role || 'student' };

  } catch (err: any) {
    console.error("Auth server error:", err);
    return { error: "Une erreur inattendue s'est produite." };
  }
}
