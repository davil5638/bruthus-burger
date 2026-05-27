import { NextResponse } from 'next/server'

const TOKEN_COOKIE = 'bb_session'
const LOGIN_PATH   = '/login'
const API_AUTH     = '/api/auth'

// Rotas que exigem senha
const ROTAS_PROTEGIDAS = ['/clientes']

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Libera login e API de auth sempre
  if (pathname === LOGIN_PATH || pathname.startsWith(API_AUTH)) {
    return NextResponse.next()
  }

  // Só verifica autenticação nas rotas protegidas
  const protegida = ROTAS_PROTEGIDAS.some(r => pathname === r || pathname.startsWith(r + '/'))
  if (!protegida) return NextResponse.next()

  const token    = request.cookies.get(TOKEN_COOKIE)?.value
  const expected = process.env.DASHBOARD_TOKEN

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
