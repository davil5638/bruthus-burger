import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TOKEN_COOKIE = 'bb_session'
const MAX_AGE     = 60 * 60 * 24 * 30 // 30 dias

export async function POST(request) {
  const { password, action } = await request.json()

  // Logout
  if (action === 'logout') {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(TOKEN_COOKIE, '', { maxAge: 0, path: '/' })
    return res
  }

  const senhaCorreta = process.env.DASHBOARD_PASSWORD
  const token        = process.env.DASHBOARD_TOKEN

  if (!senhaCorreta || !token) {
    return NextResponse.json({ erro: 'DASHBOARD_PASSWORD e DASHBOARD_TOKEN não configurados no Vercel.' }, { status: 500 })
  }

  if (password !== senhaCorreta) {
    return NextResponse.json({ erro: 'Senha incorreta.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    maxAge:   MAX_AGE,
    path:     '/',
  })
  return res
}
