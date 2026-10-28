"use server";

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { premiumExpiryFromNow, isMissingColumn } from '@/lib/plan';
import { exactEmailPattern } from '@/lib/email';
import { normalizeAccessCode } from '@/lib/accessCode';
import { findAccessCodeIds } from '@/lib/accessCodeDb';
import { removeOwnedFiles } from '@/lib/storage';

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
    
    // Forme normalisée (majuscules, sans espaces) : c'est sous cette forme que l'étudiant le
    // saisit sur mobile, et deux codes ne différant que par la casse seraient ambigus.
    const code = normalizeAccessCode(customCode);
    if (code.length < 4) return { error: "Le code d'accès doit contenir au moins 4 caractères." };
    if ((await findAccessCodeIds(code)).length) return { error: "Ce code d'accès existe déjà (majuscules et minuscules confondues)." };

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

    // Réactiver un code déjà rattaché à un étudiant = une nouvelle période d'un mois de Premium
    // à partir d'aujourd'hui. Un code vierge n'a pas de date : son mois démarre à l'activation.
    const { data: current } = await supabaseAdmin
      .from('access_codes').select('email').eq('id', id).maybeSingle();
    const patch: Record<string, string> = { status };
    if (status === 'active' && current?.email) patch.expires_at = premiumExpiryFromNow();

    let { error } = await supabaseAdmin.from('access_codes').update(patch).eq('id', id);
    if (isMissingColumn(error)) {
      // Migration expires_at non appliquée : mise à jour du statut seul.
      ({ error } = await supabaseAdmin.from('access_codes').update({ status }).eq('id', id));
    }
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
      .from('user_roles').select('user_id, role').ilike('email', exactEmailPattern(email)).maybeSingle();
    if (role?.role === 'admin') return { error: 'Impossible de purger un compte administrateur.' };
    const uid = role?.user_id as string | undefined;
    if (uid && uid === adminUser.id) return { error: 'Vous ne pouvez pas purger votre propre compte.' };

    if (uid) {
      const { data: docs } = await supabaseAdmin.from('documents').select('id, url, url_fichier').eq('user_id', uid);
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
      // Données de l'étudiant. Les tables marquées « bloquante » ont une clé étrangère vers
      // auth.users SANS cascade : tant qu'elles contiennent une ligne, le compte ne peut pas
      // être supprimé. Avant, matieres et objectifs n'étaient pas vidées et l'échec de
      // deleteUser était ignoré : l'admin voyait « succès » et le compte restait actif.
      const tables: { name: string; blocking: boolean }[] = [
        { name: 'flashcards', blocking: false }, { name: 'evaluations', blocking: false },
        { name: 'redactions', blocking: true }, { name: 'ai_jobs', blocking: false },
        { name: 'historique_revisions', blocking: false }, { name: 'theme_mastery', blocking: false },
        { name: 'etude_progression_sections', blocking: false }, { name: 'etude_progression_themes', blocking: false },
        { name: 'etude_progression_cours', blocking: false }, { name: 'objectifs', blocking: true },
        { name: 'documents', blocking: true }, { name: 'matieres', blocking: true },
      ];
      for (const t of tables) {
        const { error } = await supabaseAdmin.from(t.name).delete().eq('user_id', uid);
        if (error && t.blocking) return { error: `Purge interrompue : suppression impossible dans « ${t.name} » (${error.message}).` };
      }

      // Fichiers du stockage : ceux référencés par ses documents, puis tout ce qui reste dans son dossier.
      await removeOwnedFiles(uid, (docs || []).flatMap((d: any) => [d.url_fichier, d.url]));
      const { data: leftovers } = await supabaseAdmin.storage.from('documents').list(uid, { limit: 1000 });
      const leftoverPaths = (leftovers || []).filter((f) => f.id).map((f) => `${uid}/${f.name}`);
      if (leftoverPaths.length) await supabaseAdmin.storage.from('documents').remove(leftoverPaths);
    }

    const { error: codesError } = await supabaseAdmin.from('access_codes').delete().ilike('email', exactEmailPattern(email));
    if (codesError) return { error: `Purge interrompue : codes d’accès non supprimés (${codesError.message}).` };

    if (uid) {
      // deleteUser ne lève pas d'exception : l'erreur est dans le résultat et DOIT être lue.
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (authError && !/not.?found/i.test(authError.message)) {
        return { error: `Les données ont été supprimées, mais pas le compte de connexion : ${authError.message}` };
      }
    }

    revalidatePath('/admin/dashboard/users');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Crédit Gemini (saisi par l'admin après une recharge sur Google AI Studio) et plafond journalier.
 * Sert au suivi de consommation et aux coupe-circuits (lib/aiBudget.ts).
 */
export async function saveGeminiSettings(input: { credit_usd: number; recharge_at: string; daily_usd: number; alert_pct: number }) {
  try {
    const admin = await requireAdmin();
    const credit = Number(input?.credit_usd);
    const daily = Number(input?.daily_usd);
    const alert = Number(input?.alert_pct);
    const recharge = new Date(String(input?.recharge_at || ''));
    if (!Number.isFinite(credit) || credit <= 0 || credit > 100000) return { error: 'Montant de crédit invalide.' };
    if (!Number.isFinite(daily) || daily < 0 || daily > 10000) return { error: 'Plafond journalier invalide (0 = aucun plafond).' };
    if (!Number.isFinite(alert) || alert < 10 || alert > 99) return { error: 'Seuil d’alerte invalide (entre 10 et 99 %).' };
    if (Number.isNaN(recharge.getTime()) || recharge.getTime() > Date.now() + 60_000) return { error: 'Date de recharge invalide.' };

    const { error } = await supabaseAdmin.from('admin_settings').upsert({
      key: 'gemini',
      value: { credit_usd: Math.round(credit * 100) / 100, recharge_at: recharge.toISOString(), daily_usd: Math.round(daily * 100) / 100, alert_pct: Math.round(alert) },
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    }, { onConflict: 'key' });
    if (error) return { error: 'Enregistrement impossible (la migration 07 est-elle appliquée ?).' };
    const { invalidateGeminiSettings } = await import('@/lib/aiBudget');
    invalidateGeminiSettings();
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur.' };
  }
}
