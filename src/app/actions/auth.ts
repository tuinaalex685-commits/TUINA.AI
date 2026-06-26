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
      // Succès de la connexion : on récupère le rôle de l'utilisateur
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id)
        .single();

      return { success: true, role: roleData?.role || 'student' };
    }

    // 2. SI ECHEC : Soit le compte n'existe pas, soit le code/mdp est faux.
    // On va vérifier l'état de la base de données.
    
    // Y a-t-il au moins un admin (ou un utilisateur) dans user_roles ?
    const { count: roleCount, error: countError } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error("Erreur de comptage user_roles:", countError);
      return { error: "Erreur technique de vérification des rôles." };
    }

    // --- CAS A : Aucun utilisateur dans la base (C'est le tout premier compte !) ---
    if (roleCount === 0) {
      // C'est l'administrateur qui s'inscrit. On le crée silencieusement.
      const { data: newUserData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: secret,
        email_confirm: true,
      });

      if (signUpError || !newUserData.user) {
        console.error("Erreur création 1er admin:", signUpError);
        return { error: "Erreur lors de la création du compte administrateur." };
      }

      // Le trigger en base (s'il est mis à jour) ou cette logique le mettra Admin.
      // Par sécurité, s'il n'y a personne, on force l'insertion Admin ici :
      await supabaseAdmin.from('user_roles').insert({
        user_id: newUserData.user.id,
        email: email,
        role: 'admin'
      });

      // On connecte cet utilisateur sur le client
      await supabase.auth.signInWithPassword({ email, password: secret });
      
      return { success: true, role: 'admin' };
    }

    // --- CAS B : La base contient déjà des utilisateurs. C'est donc un étudiant. ---
    // Le "secret" doit être un Code d'accès valide généré par l'admin.
    
    const { data: accessCode, error: codeError } = await supabaseAdmin
      .from('access_codes')
      .select('*')
      .eq('code', secret)
      .single();

    // Si le code n'existe pas
    if (codeError || !accessCode) {
      return { error: "Identifiants ou code d'accès invalides." };
    }

    // Vérifier si le code est déjà assigné à un autre email
    if (accessCode.email && accessCode.email !== email) {
      return { error: "Ce code d'accès est déjà assigné à un autre étudiant." };
    }

    // Vérifier les statuts du code
    if (accessCode.status === 'inactive') {
      return { error: "Ce code d'accès a été désactivé." };
    }
    if (accessCode.status === 'blocked') {
      return { error: "L'accès à ce compte a été bloqué." };
    }

    // Le code est valide et disponible (ou déjà assigné à cet email précis).
    // On l'assigne si ce n'est pas fait :
    if (!accessCode.email) {
      await supabaseAdmin
        .from('access_codes')
        .update({ email: email })
        .eq('id', accessCode.id);
    }

    // On vérifie si l'étudiant a déjà un compte Auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers.users.find(u => u.email === email);

    if (!userExists) {
      // On crée son compte avec son code comme mot de passe
      const { data: newStudentData, error: studentSignUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: secret,
        email_confirm: true,
      });

      if (studentSignUpError || !newStudentData.user) {
        console.error("Erreur création étudiant:", studentSignUpError);
        return { error: "Erreur technique lors de la création du compte." };
      }

      // On force le rôle étudiant (même si le trigger doit le faire)
      await supabaseAdmin.from('user_roles').insert({
        user_id: newStudentData.user.id,
        email: email,
        role: 'student'
      }).select().single();
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
