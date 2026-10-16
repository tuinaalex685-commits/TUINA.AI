import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

// Next.js 16 : « Middleware » s'appelle désormais « Proxy » (même fonctionnement).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
