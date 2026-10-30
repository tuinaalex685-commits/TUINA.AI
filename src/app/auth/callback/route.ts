import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';

export const dynamic = 'force-dynamic';

/**
 * Retour des liens Supabase : connexion Google (comptes gratuits) et lien « mot de passe oublié ».
 * Le code à usage unique est échangé contre une session côté serveur (cookies HttpOnly).
 * Un compte Premium ne passe JAMAIS par ici : session refermée, retour à la connexion classique.
 */
const DESTINATIONS = new Set(['/app/dashboard', '/reinitialiser', '/app/catalogue']);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') || '/app/dashboard';
  // Destination en liste blanche : pas de redirection ouverte vers un autre site.
  const next = DESTINATIONS.has(nextParam) ? nextParam : '/app/dashboard';
  const vers = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (!code) return vers('/login?erreur=lien');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return vers('/login?erreur=lien');

  if (await isPremium(supabase, data.user.email)) {
    await supabase.auth.signOut();
    return vers('/login?erreur=premium');
  }
  return vers(next);
}
