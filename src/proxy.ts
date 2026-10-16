import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

// Next.js 16 : « Middleware » s'appelle désormais « Proxy » (même fonctionnement).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Le point doit rester échappé (\\.) : sans cela, toute URL qui se TERMINE par « png », « svg »…
    // échappait au contrôle de session.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
