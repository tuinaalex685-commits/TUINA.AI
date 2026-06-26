import { createClient } from '@supabase/supabase-js';

// Ce client utilise la clé SERVICE_ROLE.
// ⚠️ IL NE DOIT JAMAIS ÊTRE UTILISÉ DANS LE NAVIGATEUR (CLIENT COMPONENTS) !
// Il sert uniquement dans les Server Actions ou Route Handlers pour contourner le RLS
// afin de créer des utilisateurs ou de vérifier des codes sécurisés.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
