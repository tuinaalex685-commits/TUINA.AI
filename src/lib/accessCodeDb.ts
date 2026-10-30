// Serveur uniquement (service role).
import { supabaseAdmin } from '@/lib/supabase/admin';
import { accessCodeVariants, isPlausibleAccessCode } from '@/lib/accessCode';

/**
 * Identifiants des codes correspondant EXACTEMENT à une saisie (casse et espaces ignorés).
 * Fonction SQL find_access_code (migration 09) ; à défaut, comparaison littérale sur quelques
 * variantes de casse. Aucune recherche par motif : `*` ou `%` ne désignent jamais un code.
 */
export async function findAccessCodeIds(raw: unknown): Promise<string[]> {
  // Hors alphabet des codes (ex. un mot de passe avec guillemets) : ne peut être un code.
  if (!isPlausibleAccessCode(raw)) return [];
  const { data, error } = await supabaseAdmin.rpc('find_access_code', { p_code: String(raw ?? '') });
  if (!error) return ((data as unknown[]) || []).map(String);
  if (!['PGRST202', '42883'].includes(String(error.code))) throw new Error(error.message);
  const { data: rows } = await supabaseAdmin.from('access_codes').select('id').in('code', accessCodeVariants(raw)).limit(2);
  return (rows || []).map((r: { id: string }) => r.id);
}
