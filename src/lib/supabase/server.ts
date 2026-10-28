import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
  return makeClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

/**
 * Client réservé à la CONNEXION et à l'INSCRIPTION (jamais aux lectures de données).
 *
 * Supabase limite l'inscription (30 / 5 min) et la connexion (150 / 5 min) PAR ADRESSE IP.
 * Appelées depuis nos actions serveur, toutes les demandes partent des quelques IP de Vercel :
 * une vague d'inscriptions le jour du lancement serait refusée en bloc. On transmet donc l'IP
 * réelle de l'étudiant (sb-forwarded-for), ce que Supabase n'accepte qu'avec une clé SECRÈTE
 * de nouvelle génération (sb_secret_…) et l'option « IP Address Forwarding » activée.
 * Sans SUPABASE_SECRET_KEY : comportement d'avant (limite partagée).
 */
export async function createAuthClient() {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret?.startsWith('sb_secret_')) return createClient()
  // Sur Vercel, x-real-ip et x-forwarded-for sont posés par la plateforme (non falsifiables).
  const h = await headers()
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return makeClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, ip ? { 'sb-forwarded-for': ip } : undefined)
}

async function makeClient(url: string, key: string, extraHeaders?: Record<string, string>) {
  const cookieStore = await cookies()

  return createServerClient(
    url,
    key,
    {
      ...(extraHeaders ? { global: { headers: extraHeaders } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
