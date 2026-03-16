'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '../lib/api'

const ORDER_LINK = 'https://bruthus-burger.ola.click/products'

const quickActions = [
  { href: '/legendas',  emoji: '✍️', label: 'Gerar Legenda',   desc: 'Crie legendas com IA',          color: 'from-orange-600/20 to-orange-600/5',  border: 'border-orange-600/30' },
  { href: '/promocoes', emoji: '🎉', label: 'Nova Promoção',   desc: 'Quinta Burger, Combo Casal…',   color: 'from-purple-600/20 to-purple-600/5',  border: 'border-purple-600/30' },
  { href: '/posts',     emoji: '📸', label: 'Publicar Post',   desc: 'Publique no Instagram agora',   color: 'from-blue-600/20 to-blue-600/5',      border: 'border-blue-600/30'   },
  { href: '/reels',     emoji: '🎬', label: 'Roteiro de Reels', desc: 'Cenas, ângulos e músicas',     color: 'from-pink-600/20 to-pink-600/5',      border: 'border-pink-600/30'   },
  { href: '/hashtags',  emoji: '#',  label: 'Hashtags',        desc: 'Gere hashtags anti-shadowban', color: 'from-green-600/20 to-green-600/5',    border: 'border-green-600/30'  },
  { href: '/anuncios',  emoji: '📣', label: 'Criar Anúncio',   desc: 'Meta Ads R$10/dia',            color: 'from-yellow-600/20 to-yellow-600/5',  border: 'border-yellow-600/30' },
  { href: '/agendador', emoji: '📅', label: 'Agendador',       desc: 'Posts automáticos da semana',  color: 'from-cyan-600/20 to-cyan-600/5',      border: 'border-cyan-600/30'   },
]

const schedule = [
  { dia: 'Seg', hora: '18h', tipo: 'Burger Clássico',       emoji: '🍔', color: 'text-orange-400' },
  { dia: 'Qua', hora: '18h', tipo: 'Batata / Combo',        emoji: '🍟', color: 'text-yellow-400' },
  { dia: 'Qui', hora: '18h', tipo: 'Quinta do Hambúrguer',  emoji: '🎉', color: 'text-purple-400' },
  { dia: 'Sex', hora: '19h', tipo: 'Smash Burger',          emoji: '🔥', color: 'text-red-400'    },
  { dia: 'Dom', hora: '17h', tipo: 'Combo Família',         emoji: '👨‍👩‍👧‍👦', color: 'text-blue-400'   },
]

export default function Dashboard() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/status')
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  const configs = status?.configuracoes || {}

  const statusItems = [
    { label: 'Meta Access Token', key: 'META_ACCESS_TOKEN' },
    { label: 'Instagram User ID',  key: 'IG_USER_ID'        },
    { label: 'Ad Account ID',      key: 'AD_ACCOUNT_ID'     },
    { label: 'OpenAI API Key',     key: 'OPENAI_API_KEY'    },
  ]

  const allOk = statusItems.every(i => configs[i.key]?.includes('✅'))

  return (
    <div className="max-w-6xl">
      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">🍔</span>
          <div>
            <h1 className="text-3xl font-bold text-white">Bruthus Burger</h1>
            <p className="text-[#666] text-sm">Painel de automação de marketing — Instagram & Meta Ads</p>
          </div>
        </div>
        <a href={ORDER_LINK} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-2 mt-3 text-xs text-[#f97316] hover:underline">
          🔗 {ORDER_LINK}
        </a>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {statusItems.map(item => {
          const ok = configs[item.key]?.includes('✅')
          return (
            <div key={item.key} className={`rounded-xl border p-4 bg-[#111] ${ok ? 'border-green-600/30' : 'border-red-600/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-xs font-semibold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                  {ok ? 'Configurado' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-[#666] leading-snug">{item.label}</p>
            </div>
          )
        })}
      </div>

      {/* Aviso se não configurado */}
      {!loading && !allOk && (
        <div className="mb-8 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-yellow-300">Configure seu .env antes de usar</p>
            <p className="text-xs text-yellow-400/70 mt-1">
              Edite o arquivo <code className="bg-[#222] px-1 rounded">bruthus-marketing/.env</code> com seus tokens da Meta e OpenAI. Depois reinicie o servidor.
            </p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold text-[#666] uppercase tracking-wider mb-4">Ações Rápidas</h2>
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

      {/* Schedule preview */}
      <div>
        <h2 className="text-sm font-semibold text-[#666] uppercase tracking-wider mb-4">📅 Estratégia Semanal</h2>
        <div className="rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
          <div className="grid grid-cols-5 divide-x divide-[#1e1e1e]">
            {schedule.map(s => (
              <div key={s.dia} className="p-4 text-center hover:bg-[#1a1a1a] transition-colors">
                <div className="text-xs text-[#555] font-semibold uppercase tracking-wider">{s.dia}</div>
                <div className="text-[10px] text-[#f97316] font-bold mt-1">{s.hora}</div>
                <div className="text-xl my-2">{s.emoji}</div>
                <div className={`text-[11px] font-medium leading-tight ${s.color}`}>{s.tipo}</div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-[#1e1e1e] flex items-center justify-between">
            <span className="text-xs text-[#555]">Posts automáticos configurados para Fortaleza/CE</span>
            <Link href="/agendador" className="text-xs text-[#f97316] hover:underline">Gerenciar →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
