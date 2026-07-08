import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLogoutRoute = request.nextUrl.pathname === '/app/logout';

  // Protection des routes (Si non connecté et essaie d'aller sur /app ou /admin)
  if (!user && (request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/admin'))) {
    if (!isLogoutRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Vérification de sécurité CRITIQUE pour les utilisateurs connectés
  if (user && !isLogoutRoute) {
    // 1. Obtenir le rôle
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
      
    const isAdmin = roleData?.role === 'admin';

    // 2. Si NON admin, on VÉRIFIE STRICTEMENT le code d'accès à CHAQUE REQUÊTE
    if (!isAdmin) {
      const { data: accessCode } = await supabase
        .from('access_codes')
        .select('status')
        .ilike('email', user.email || '')
        .single()

      // Si le code n'existe plus ou n'est plus actif -> EJECTION DIRECTE
      if (!accessCode || accessCode.status !== 'active') {
        const url = request.nextUrl.clone()
        url.pathname = '/app/logout'
        return NextResponse.redirect(url)
      }
    }

    // 3. Protection stricte des routes Administrateur
    if (request.nextUrl.pathname.startsWith('/admin')) {
      if (!isAdmin) {
        // Un étudiant tente d'accéder à l'admin -> Redirection immédiate
        const url = request.nextUrl.clone()
        url.pathname = '/app/dashboard'
        return NextResponse.redirect(url)
      }
    }

    // 4. Empêcher l'utilisateur valide de retourner sur /login
    if (request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = isAdmin ? '/admin/dashboard' : '/app/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
