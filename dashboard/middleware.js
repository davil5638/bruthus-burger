import { NextResponse } from 'next/server'

const TOKEN_COOKIE = 'bb_session'
const LOGIN_PATH   = '/login'
const API_AUTH     = '/api/auth'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Libera login e a rota de autenticação
  if (pathname === LOGIN_PATH || pathname.startsWith(API_AUTH)) {
    return NextResponse.next()
  }

  const token    = request.cookies.get(TOKEN_COOKIE)?.value
  const expected = process.env.DASHBOARD_TOKEN

  // Sem token configurado no Vercel → avisa mas não bloqueia (facilita setup)
  if (!expected) return NextResponse.next()

  if (token !== expected) {
    const url = request.nextUrl.clone()
    url.pathname = LOGIN_PATH
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
