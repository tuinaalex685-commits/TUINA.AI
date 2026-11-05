import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserNiveau, isNiveau, upsertProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/**
 * Retour des liens Supabase : connexion Google et lien « mot de passe oublié ».
 * Le code à usage unique est échangé contre une session côté serveur (cookies HttpOnly).
 *
 * Google est ouvert à TOUS les étudiants (décision du responsable, 05/11/2026) : Google prouve que
 * la personne possède l'adresse email ; le Premium reste rattaché à cette adresse par le code
 * d'accès (isPremium), donc un Premium entre directement en Premium et une adresse sans code reste
 * un compte gratuit. Avant, un compte Premium était déconnecté ici.
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
  // Inscription par Google : l'année choisie sur la page d'inscription, seulement si le compte n'en
  // a pas encore (l'année d'un compte gratuit ne se change pas par ce chemin).
  const niveau = url.searchParams.get('niveau');
  if (isNiveau(niveau) && !(await getUserNiveau(data.user.id))) {
    await upsertProfile(data.user.id, { niveau, onboardingDone: true });
  }
  return vers(next);
}
