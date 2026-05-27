'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const router       = useRouter()
  const params       = useSearchParams()
  const next         = params.get('next') || '/'
  const [senha, setSenha]   = useState('')
  const [erro, setErro]     = useState('')
  const [loading, setLoading] = useState(false)
  const [ver, setVer]       = useState(false)

  async function entrar(e) {
    e.preventDefault()
    if (!senha) return
    setLoading(true)
    setErro('')
    try {
      const res  = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: senha }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.erro || 'Senha incorreta.'); return }
      router.push(next)
      router.refresh()
    } catch {
      setErro('Erro de conexão.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#060606] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', boxShadow: '0 20px 60px rgba(249,115,22,0.3)' }}
          >
            <span className="text-3xl">🍔</span>
          </div>
          <h1 className="text-xl font-bold text-white">Bruthus Burger</h1>
          <p className="text-sm text-[#444] mt-1">Painel de Marketing</p>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 shadow-2xl">
          <h2 className="text-sm font-semibold text-[#888] mb-5 text-center">Acesso restrito</h2>

          <form onSubmit={entrar} className="space-y-4">
            <div className="relative">
              <input
                type={ver ? 'text' : 'password'}
                placeholder="Senha"
                value={senha}
                onChange={e => { setSenha(e.target.value); setErro('') }}
                autoFocus
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] text-white rounded-xl px-4 py-3 text-sm pr-10 focus:outline-none focus:border-[#f97316]/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setVer(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888] text-xs transition-colors"
              >
                {ver ? '🙈' : '👁️'}
              </button>
            </div>

            {erro && (
              <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl py-2 px-3">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !senha}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea6c0a)', boxShadow: '0 8px 24px rgba(249,115,22,0.25)' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-[#2a2a2a] mt-6">
          Bruthus Burger © {new Date().getFullYear()} · Dados protegidos
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
