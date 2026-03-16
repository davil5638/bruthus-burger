'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '../lib/api'

const ORDER_LINK = 'https://bruthus-burger.ola.click/products'
const CUPOM_SEXTA = 'SEXTAOFF10'

const quickActions = [
  { href: '/legendas',  emoji: '✍️', label: 'Gerar Legenda',    desc: 'Crie legendas com IA',          color: 'from-orange-600/20 to-orange-600/5',  border: 'border-orange-600/30' },
  { href: '/promocoes', emoji: '🎉', label: 'Nova Promoção',    desc: 'Quinta, Sexta, Sábado, Domingo', color: 'from-purple-600/20 to-purple-600/5',  border: 'border-purple-600/30' },
  { href: '/posts',     emoji: '📸', label: 'Publicar Post',    desc: 'Publique no Instagram agora',    color: 'from-blue-600/20 to-blue-600/5',      border: 'border-blue-600/30'   },
  { href: '/reels',     emoji: '🎬', label: 'Roteiro de Reels', desc: 'Cenas, ângulos e músicas',      color: 'from-pink-600/20 to-pink-600/5',      border: 'border-pink-600/30'   },
  { href: '/hashtags',  emoji: '#',  label: 'Hashtags',         desc: 'Anti-shadowban rotativas',      color: 'from-green-600/20 to-green-600/5',    border: 'border-green-600/30'  },
  { href: '/anuncios',  emoji: '📣', label: 'Criar Anúncio',    desc: 'Meta Ads R$10/dia',             color: 'from-yellow-600/20 to-yellow-600/5',  border: 'border-yellow-600/30' },
  { href: '/agendador', emoji: '📅', label: 'Agendador',        desc: 'Posts automáticos Qui–Dom',     color: 'from-cyan-600/20 to-cyan-600/5',      border: 'border-cyan-600/30'   },
]

const schedule = [
  {
    dia: 'Quinta', hora: '18h', emoji: '🍔',
    tipo: 'Quinta do Hambúrguer',
    sub: 'Preço promocional exclusivo toda quinta',
    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20',
  },
  {
    dia: 'Sexta', hora: '18h', emoji: '🔥',
    tipo: 'Cupom SEXTAOFF10',
    sub: '10% OFF usando o cupom no link',
    color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20',
    badge: CUPOM_SEXTA,
  },
  {
    dia: 'Sábado', hora: '18h', emoji: '🎉',
    tipo: 'Promoção Rotativa',
    sub: '2× por mês · Batata grátis · Smash promo · Refri grátis',
    color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    badge: '1ª e 3ª semana',
  },
  {
    dia: 'Domingo', hora: '17h', emoji: '❤️',
    tipo: 'Família & Casal',
    sub: 'Post aconchegante, sem promo fixa',
    color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
  },
]

const statusItems = [
  { label: 'Meta Access Token', key: 'META_ACCESS_TOKEN' },
  { label: 'Instagram User ID',  key: 'IG_USER_ID'        },
  { label: 'Ad Account ID',      key: 'AD_ACCOUNT_ID'     },
  { label: 'OpenAI API Key',     key: 'OPENAI_API_KEY'    },
]

export default function Dashboard() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/status').then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false))
  }, [])

  const configs = status?.configuracoes || {}
  const allOk = statusItems.every(i => configs[i.key]?.includes('✅'))

  return (
    <div className="max-w-5xl">
      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">🍔</span>
          <div>
            <h1 className="text-3xl font-bold text-white">Bruthus Burger</h1>
            <p className="text-[#666] text-sm">Automação de marketing · Abre Quinta a Domingo</p>
          </div>
        </div>
        <a href={ORDER_LINK} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-2 mt-3 text-xs text-[#f97316] hover:underline">
          🔗 {ORDER_LINK}
        </a>
      </div>

      {/* Status APIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {statusItems.map(item => {
          const ok = configs[item.key]?.includes('✅')
          return (
            <div key={item.key} className={`rounded-xl border p-4 bg-[#111] ${ok ? 'border-green-600/30' : 'border-red-600/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-xs font-semibold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                  {ok ? 'OK' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-[#666] leading-snug">{item.label}</p>
            </div>
          )
        })}
      </div>

      {!loading && !allOk && (
        <div className="mb-8 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-yellow-300">Configure seu .env antes de usar</p>
            <p className="text-xs text-yellow-400/70 mt-1">
              Edite <code className="bg-[#222] px-1 rounded">bruthus-marketing/.env</code> com os tokens da Meta e OpenAI, depois reinicie o servidor.
            </p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {quickActions.map(a => (
            <Link key={a.href} href={a.href}
              className={`rounded-xl border ${a.border} bg-gradient-to-br ${a.color} p-5 flex flex-col gap-2 hover:scale-[1.02] transition-transform group cursor-pointer`}>
              <span className="text-2xl">{a.emoji}</span>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-[#f97316] transition-colors">{a.label}</p>
                <p className="text-[11px] text-[#666] mt-0.5">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Estratégia Qui–Dom */}
      <div>
        <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-4">📅 Estratégia de Abertura — Qui a Dom</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {schedule.map(s => (
            <div key={s.dia} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{s.emoji}</span>
                <div className="text-right">
                  <div className={`text-xs font-bold ${s.color}`}>{s.dia}</div>
                  <div className="text-[10px] text-[#f97316] font-semibold">{s.hora}</div>
                </div>
              </div>
              <p className={`text-sm font-bold ${s.color}`}>{s.tipo}</p>
              <p className="text-[11px] text-[#555] mt-1 leading-snug">{s.sub}</p>
              {s.badge && (
                <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#f97316]">
                  {s.badge}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 p-3 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center gap-3">
          <span className="text-lg">🏷️</span>
          <div>
            <span className="text-xs text-[#888]">Cupom ativo toda Sexta: </span>
            <code className="text-xs font-bold text-[#f97316] bg-[#f97316]/10 px-2 py-0.5 rounded">{CUPOM_SEXTA}</code>
            <span className="text-xs text-[#888] ml-1">→ 10% OFF no pedido online</span>
          </div>
          <Link href="/agendador" className="ml-auto text-xs text-[#f97316] hover:underline shrink-0">Gerenciar →</Link>
        </div>
      </div>
    </div>
  )
}
