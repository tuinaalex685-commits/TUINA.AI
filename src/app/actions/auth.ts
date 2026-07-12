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
        
        // S'assurer que l'email correspond au code (en ignorant la casse)
        if (accessCode.email && accessCode.email.toLowerCase() !== email.toLowerCase()) {
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
      if (signInError && signInError.message.toLowerCase().includes('ban')) {
        return { error: "Votre compte a été banni." };
      }
      return { error: "Identifiants ou code d'accès invalides." };
    }

    if (accessCode.email && accessCode.email.toLowerCase() !== email.toLowerCase()) {
      return { error: "Ce code d'accès est déjà assigné à un autre étudiant." };
    }
    if (accessCode.status === 'inactive') {
      return { error: "Ce code d'accès a été désactivé." };
    }
    if (accessCode.status === 'blocked') {
      return { error: "L'accès à ce compte a été bloqué." };
    }

    // Assigner l'email si ce n'est pas fait (C'est un code vierge)
    if (!accessCode.email) {
      // SÉCURITÉ : Vérifier que l'étudiant ne possède pas DÉJÀ un autre code !
      const { data: existingCodes } = await supabaseAdmin
        .from('access_codes')
        .select('id')
        .ilike('email', email);

      if (existingCodes && existingCodes.length > 0) {
        return { error: "Vous possédez déjà un code d'accès. Si vous l'avez perdu, demandez à l'administrateur de le réinitialiser." };
      }

      // Claim ATOMIQUE : n'assigne l'email que si le code est encore vierge (email IS NULL).
      // Empêche deux étudiants de réclamer le même code simultanément (race condition).
      const { data: claimedCode, error: updateErr } = await supabaseAdmin
        .from('access_codes')
        .update({ email: email })
        .eq('id', accessCode.id)
        .is('email', null)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("[AUTH] Erreur lors de l'assignation de l'email au code:", updateErr);
        return { error: "Erreur serveur lors de la validation du code." };
      }
      if (!claimedCode) {
        return { error: "Ce code d'accès vient d'être assigné à un autre étudiant." };
      }
    }

    // Vérifier si l'étudiant a déjà un compte Auth
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .ilike('email', email)
      .single();

    if (!existingRole) {
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
      console.log(`[AUTH] Utilisateur existant (role). Mise à jour Auth. uid: ${existingRole.user_id}`);
      // L'utilisateur existe mais signInWithPassword a échoué (probablement un nouveau code)
      const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(existingRole.user_id, { 
        password: secret,
        ban_duration: "none" // Révoque tout ban précédent si le nouveau code est valide
      });

      if (updateAuthErr) {
        console.error("[AUTH] Erreur updateUserById:", updateAuthErr);
        // Si l'utilisateur a été supprimé de auth.users (User not found)
        if (updateAuthErr.message.includes('not found')) {
            console.log("[AUTH] Utilisateur introuvable dans auth.users. Recréation...");
            // Il faut recréer l'utilisateur dans auth.users
            const { data: recreatedUser, error: recreateErr } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: secret,
                email_confirm: true,
            });
            if (recreateErr || !recreatedUser.user) {
                return { error: `Erreur de recréation du compte: ${recreateErr?.message}` };
            }
            // Mettre à jour user_roles avec le NOUVEAU user_id
            await supabaseAdmin.from('user_roles').update({ user_id: recreatedUser.user.id }).eq('email', email);
            // Mettre à jour les documents avec le NOUVEAU user_id
            await supabaseAdmin.from('documents').update({ user_id: recreatedUser.user.id }).eq('user_id', existingRole.user_id);
            console.log(`[AUTH] Compte recréé avec succès. Nouveau uid: ${recreatedUser.user.id}`);
        } else {
            return { error: `Erreur de restauration du compte: ${updateAuthErr.message}` };
        }
      } else {
        console.log(`[AUTH] Mise à jour Auth réussie pour ${email}.`);
      }
    }

    // Finalement, on connecte l'étudiant
    console.log(`[AUTH] Tentative de connexion finale avec email=${email}`);
    const { data: finalAuthData, error: finalSignInError } = await supabase.auth.signInWithPassword({
      email,
      password: secret,
    });

    if (finalSignInError) {
      console.error("[AUTH] Echec connexion finale:", finalSignInError);
      return { error: `Impossible de se connecter après validation du code: ${finalSignInError.message}` };
    }
    
    console.log(`[AUTH] Connexion finale réussie pour ${email}`);
    return { success: true, role: 'student' };

  } catch (err: any) {
    console.error("Auth server error:", err);
    return { error: "Une erreur inattendue s'est produite." };
  }
}
