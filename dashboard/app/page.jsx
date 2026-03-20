'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '../lib/api'

const CUPOM_SEXTA = 'SEXTAOFF10'

function getRangoSemana() {
  const hoje = new Date()
  const dia = hoje.getDay()
  const diasDesdeTerca = (dia + 5) % 7
  const terca = new Date(hoje)
  terca.setDate(hoje.getDate() - diasDesdeTerca)
  const seg = new Date(terca)
  seg.setDate(terca.getDate() + 6)
  return {
    dataInicio: terca.toISOString().slice(0, 10),
    dataFim:    seg.toISOString().slice(0, 10),
  }
}

function fmt(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }
function fmtN(v) { return Number(v || 0).toLocaleString('pt-BR') }
function fmtD(v, decimals = 2) { return Number(v || 0).toFixed(decimals) }

const quickActions = [
  { href: '/legendas',         emoji: '✍️', label: 'Legendas',      desc: 'Gerar com IA',             color: 'from-orange-600/20 to-orange-600/5',  border: 'border-orange-600/30'  },
  { href: '/mensagens',        emoji: '💬', label: 'Transmissão',   desc: 'Mensagens WhatsApp',        color: 'from-green-600/20 to-green-600/5',    border: 'border-green-600/30'   },
  { href: '/anuncios',         emoji: '📣', label: 'Anúncios',      desc: 'Gestor Meta Ads',           color: 'from-yellow-600/20 to-yellow-600/5',  border: 'border-yellow-600/30'  },
  { href: '/anuncios/relatorio', emoji: '📊', label: 'Relatório ADS', desc: 'Performance completa',  color: 'from-blue-600/20 to-blue-600/5',      border: 'border-blue-600/30'    },
  { href: '/agendador',        emoji: '📅', label: 'Agendador',     desc: 'Posts automáticos Qui–Dom', color: 'from-cyan-600/20 to-cyan-600/5',      border: 'border-cyan-600/30'    },
  { href: '/financeiro',       emoji: '💰', label: 'Financeiro',    desc: 'Faturamento e lucro',       color: 'from-emerald-600/20 to-emerald-600/5', border: 'border-emerald-600/30'},
]

const schedule = [
  { dia: 'Quinta', hora: '18h', emoji: '🍔', tipo: 'Quinta do Hambúrguer', sub: 'Preço promocional exclusivo toda quinta',          color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { dia: 'Sexta',  hora: '18h', emoji: '🔥', tipo: 'Cupom SEXTAOFF10',    sub: '10% OFF usando o cupom no link',                    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',   badge: CUPOM_SEXTA },
  { dia: 'Sábado', hora: '18h', emoji: '🎉', tipo: 'Promoção Rotativa',   sub: '2× por mês · Batata grátis · Smash promo · Refri grátis', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', badge: '1ª e 3ª semana' },
  { dia: 'Domingo',hora: '17h', emoji: '❤️', tipo: 'Família & Casal',     sub: 'Post aconchegante, sem promo fixa',                 color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
]

export default function Dashboard() {
  const [status,    setStatus]    = useState(null)
  const [financeiro,setFinanceiro]= useState(null)
  const [ads,       setAds]       = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const { dataInicio, dataFim } = getRangoSemana()
    Promise.allSettled([
      api.get('/status'),
      api.get(`/financeiro/resumo?dataInicio=${dataInicio}&dataFim=${dataFim}`),
      api.get('/ads/relatorio?dias=7'),
    ]).then(([s, f, a]) => {
      if (s.status === 'fulfilled') setStatus(s.value)
      if (f.status === 'fulfilled') setFinanceiro(f.value?.resumo || null)
      if (a.status === 'fulfilled') setAds(a.value || null)
    }).finally(() => setLoading(false))
  }, [])

  const configs = status?.configuracoes || {}
  const metaOk  = configs['META_ACCESS_TOKEN']?.includes('✅')
  const openaiOk = configs['OPENAI_API_KEY']?.includes('✅')

  // Ads resumo
  const r = ads?.resumo
  const campanhasAtivas = ads?.campanhas?.filter(c => c.status === 'ACTIVE' && !c.erro) || []

  // Financeiro
  const fat    = financeiro?.faturamento   || 0
  const gas    = financeiro?.gastos        || 0
  const lucro  = financeiro?.lucro         || 0
  const margem = fat > 0 ? ((lucro / fat) * 100).toFixed(1) : '0.0'

  return (
    <div className="max-w-4xl">

      {/* ── Hero ── */}
      <div className="mb-8 flex items-center gap-3">
        <span className="text-4xl">🍔</span>
        <div>
          <h1 className="text-2xl font-bold text-white">Bruthus Burger</h1>
          <p className="text-[#555] text-xs">Painel de controle · Qui a Dom</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${metaOk ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
          <span className="text-[10px] text-[#555]">{metaOk ? 'Meta OK' : 'Meta offline'}</span>
          <span className={`w-2 h-2 rounded-full ${openaiOk ? 'bg-green-400' : 'bg-red-400'} ml-2`} />
          <span className="text-[10px] text-[#555]">{openaiOk ? 'IA OK' : 'IA offline'}</span>
        </div>
      </div>

      {/* ── Financeiro da semana ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider">💰 Financeiro — Semana Atual</h2>
          <Link href="/financeiro" className="text-[10px] text-[#f97316] hover:underline">Ver completo →</Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4 animate-pulse">
                <div className="h-3 bg-[#222] rounded mb-2 w-16" />
                <div className="h-6 bg-[#222] rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Faturamento', valor: fmt(fat),   cor: 'text-green-400',                                           sub: 'receitas' },
              { label: 'Gastos',      valor: fmt(gas),   cor: 'text-red-400',                                             sub: 'despesas' },
              { label: 'Lucro',       valor: fmt(lucro), cor: lucro >= 0 ? 'text-blue-400' : 'text-red-400',             sub: lucro >= 0 ? '✅ positivo' : '❌ negativo' },
              { label: 'Margem',      valor: `${margem}%`, cor: parseFloat(margem) >= 30 ? 'text-green-400' : parseFloat(margem) >= 15 ? 'text-yellow-400' : 'text-red-400', sub: 'de lucro' },
            ].map(m => (
              <div key={m.label} className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
                <p className="text-[10px] text-[#555] mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${m.cor}`}>{m.valor}</p>
                <p className="text-[10px] text-[#333] mt-0.5">{m.sub}</p>
              </div>
            ))}
          </div>
        )}
        {!loading && fat === 0 && gas === 0 && (
          <p className="text-[11px] text-[#444] mt-2 text-center">Nenhum lançamento registrado esta semana ainda.</p>
        )}
      </div>

      {/* ── Meta Ads últimos 7 dias ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider">📣 Meta Ads — Últimos 7 dias</h2>
          <Link href="/anuncios/relatorio" className="text-[10px] text-[#f97316] hover:underline">Ver relatório →</Link>
        </div>
        {loading ? (
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4 animate-pulse h-20" />
        ) : !ads ? (
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4 text-center">
            <p className="text-xs text-[#555]">Meta Ads indisponível — verifique o token</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              {[
                { label: 'Investido',       valor: `R$ ${fmtD(r?.totalGasto)}`,   cor: 'text-[#f97316]' },
                { label: 'Cliques',         valor: fmtN(r?.totalCliques),          cor: 'text-white'      },
                { label: 'CTR médio',       valor: `${fmtD(r?.ctrMedio)}%`,        cor: parseFloat(r?.ctrMedio) >= 1.5 ? 'text-green-400' : 'text-yellow-400' },
                { label: 'CPC médio',       valor: `R$ ${fmtD(r?.cpcMedio)}`,      cor: parseFloat(r?.cpcMedio) <= 1.5 ? 'text-green-400' : 'text-yellow-400' },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-[10px] text-[#555] mb-0.5">{m.label}</p>
                  <p className={`text-sm font-bold ${m.cor}`}>{m.valor}</p>
                </div>
              ))}
            </div>
            {/* Campanhas ativas */}
            {campanhasAtivas.length > 0 && (
              <div className="border-t border-[#1a1a1a] pt-3">
                <p className="text-[10px] text-[#555] mb-2">🟢 {campanhasAtivas.length} campanha{campanhasAtivas.length > 1 ? 's' : ''} ativa{campanhasAtivas.length > 1 ? 's' : ''}</p>
                <div className="space-y-1.5">
                  {campanhasAtivas.slice(0, 2).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <p className="text-[11px] text-[#888] truncate max-w-[55%]">{c.nome}</p>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className={parseFloat(c.ctr) >= 1.5 ? 'text-green-400' : 'text-yellow-400'}>{fmtD(c.ctr)}% CTR</span>
                        <span className="text-[#f97316]">R$ {fmtD(c.gasto)} gasto</span>
                      </div>
                    </div>
                  ))}
                  {campanhasAtivas.length > 2 && (
                    <p className="text-[10px] text-[#444]">+{campanhasAtivas.length - 2} mais</p>
                  )}
                </div>
              </div>
            )}
            {campanhasAtivas.length === 0 && (
              <p className="text-[11px] text-[#444] border-t border-[#1a1a1a] pt-3">Nenhuma campanha ativa no momento.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Ações rápidas ── */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-3">🚀 Ações Rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickActions.map(a => (
            <Link key={a.href} href={a.href}
              className={`rounded-xl border ${a.border} bg-gradient-to-br ${a.color} p-4 flex items-center gap-3 hover:scale-[1.02] transition-transform group cursor-pointer`}>
              <span className="text-2xl shrink-0">{a.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white group-hover:text-[#f97316] transition-colors leading-tight">{a.label}</p>
                <p className="text-[10px] text-[#555] mt-0.5 truncate">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Estratégia Qui–Dom ── */}
      <div>
        <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-3">📅 Estratégia de Abertura — Qui a Dom</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {schedule.map(s => (
            <div key={s.dia} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{s.emoji}</span>
                <div className="text-right">
                  <div className={`text-xs font-bold ${s.color}`}>{s.dia}</div>
                  <div className="text-[10px] text-[#f97316] font-semibold">{s.hora}</div>
                </div>
              </div>
              <p className={`text-xs font-bold ${s.color}`}>{s.tipo}</p>
              <p className="text-[10px] text-[#555] mt-1 leading-snug">{s.sub}</p>
              {s.badge && (
                <span className="inline-block mt-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#f97316]">
                  {s.badge}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center gap-3">
          <span className="text-base">🏷️</span>
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
