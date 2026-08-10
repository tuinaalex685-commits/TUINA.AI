import type { SupabaseClient } from '@supabase/supabase-js';

// Premium = calculé dynamiquement depuis access_codes, jamais stocké dans une colonne séparée
// (éviterait une double source de vérité qui peut se désynchroniser à chaque activation/
// désactivation de code). Même requête que le middleware (src/lib/supabase/middleware.ts).
export async function isPremium(db: SupabaseClient, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { data } = await db.from('access_codes').select('status').ilike('email', email);
  return !!data?.some((c: any) => c.status === 'active');
}
