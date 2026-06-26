import { createBrowserClient } from '@supabase/ssr';

// Création du client Supabase pour le navigateur avec gestion automatique des cookies pour Next.js SSR
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
