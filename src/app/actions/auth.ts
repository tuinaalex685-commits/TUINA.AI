"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function loginWithAccessCode(email: string, secret: string) {
  try {
    const supabase = await createClient();

    // 1. TENTATIVE CLASSIQUE DE CONNEXION (Email + Mot de passe ou Code utilisé comme mdp)
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: secret,
    });

    if (!signInError && authData.user) {
      // Succès de la connexion par mot de passe
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id)
        .single();

      const userRole = roleData?.role || 'student';

      // VERIFICATION STRICTE DU CODE D'ACCES POUR LES ETUDIANTS
      if (userRole !== 'admin') {
        const { data: accessCode } = await supabaseAdmin
          .from('access_codes')
          .select('*')
          .eq('code', secret)
          .single();

        if (!accessCode) {
           return { error: "Accès refusé. Ce code d'accès n'existe plus ou a été supprimé." };
        }
        if (accessCode.status === 'inactive') {
          return { error: "Ce code d'accès a été désactivé par l'administrateur." };
        }
        if (accessCode.status === 'blocked') {
          return { error: "Votre accès à la plateforme a été bloqué." };
        }
        
        // S'assurer que l'email correspond au code
        if (accessCode.email && accessCode.email !== email) {
          return { error: "Ce code d'accès est déjà assigné à un autre étudiant." };
        }
      }

      return { success: true, role: userRole };
    }

    // 2. SI ECHEC DE CONNEXION (Mot de passe faux, ou compte inexistant, ou banni)
    const { count: roleCount, error: countError } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return { error: "Erreur technique de vérification des rôles." };
    }

    // --- CAS A : Aucun utilisateur dans la base (C'est le tout premier compte !) ---
    if (roleCount === 0) {
      const { data: newUserData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: secret,
        email_confirm: true,
      });

      if (signUpError || !newUserData.user) {
        return { error: "Erreur lors de la création du compte administrateur." };
      }

      await supabaseAdmin.from('user_roles').insert({
        user_id: newUserData.user.id,
        email: email,
        role: 'admin'
      });

      await supabase.auth.signInWithPassword({ email, password: secret });
      return { success: true, role: 'admin' };
    }

    // --- CAS B : La base contient déjà des utilisateurs. Vérification du code d'accès fourni ---
    const { data: accessCode, error: codeError } = await supabaseAdmin
      .from('access_codes')
      .select('*')
      .eq('code', secret)
      .single();

    if (codeError || !accessCode) {
      // Si signInWithPassword a échoué car l'utilisateur est banni, on veut renvoyer un message clair
      if (signInError && signInError.message.toLowerCase().includes('ban')) {
        return { error: "Votre compte a été banni." };
      }
      return { error: "Identifiants ou code d'accès invalides." };
    }

    if (accessCode.email && accessCode.email !== email) {
      return { error: "Ce code d'accès est déjà assigné à un autre étudiant." };
    }
    if (accessCode.status === 'inactive') {
      return { error: "Ce code d'accès a été désactivé." };
    }
    if (accessCode.status === 'blocked') {
      return { error: "L'accès à ce compte a été bloqué." };
    }

    // Assigner l'email si ce n'est pas fait
    if (!accessCode.email) {
      await supabaseAdmin
        .from('access_codes')
        .update({ email: email })
        .eq('id', accessCode.id);
    }

    // Vérifier si l'étudiant a déjà un compte Auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers.users.find(u => u.email === email);

    if (!userExists) {
      // Création du compte étudiant
      const { data: newStudentData, error: studentSignUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: secret,
        email_confirm: true,
      });

      if (studentSignUpError || !newStudentData.user) {
        return { error: "Erreur technique lors de la création du compte." };
      }

      await supabaseAdmin.from('user_roles').insert({
        user_id: newStudentData.user.id,
        email: email,
        role: 'student'
      }).select().single();
    } else {
      // L'utilisateur existe mais signInWithPassword a échoué (probablement un nouveau code)
      // On met à jour son mot de passe avec ce nouveau code valide !
      await supabaseAdmin.auth.admin.updateUserById(userExists.id, { password: secret });
    }

    // Finalement, on connecte l'étudiant
    const { error: finalSignInError } = await supabase.auth.signInWithPassword({
      email,
      password: secret,
    });

    if (finalSignInError) {
      return { error: "Impossible de se connecter après validation du code." };
    }

    return { success: true, role: 'student' };

  } catch (err: any) {
    console.error("Auth server error:", err);
    return { error: "Une erreur inattendue s'est produite." };
  }
}
