'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '../lib/api'

const CUPOM_SEXTA = 'SEXTAOFF10'

function getRangoSemana(offset = 0) {
  const hoje = new Date()
  const dia = hoje.getDay()
  const diasDesdeTerca = (dia + 5) % 7
  const terca = new Date(hoje)
  terca.setDate(hoje.getDate() - diasDesdeTerca + offset * 7)
  const seg = new Date(terca)
  seg.setDate(terca.getDate() + 6)
  return { dataInicio: terca.toISOString().slice(0, 10), dataFim: seg.toISOString().slice(0, 10) }
}

function fmt(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }
function fmtN(v) { return Number(v || 0).toLocaleString('pt-BR') }
function fmtF(v, d = 2) { return Number(v || 0).toFixed(d) }
function pctDiff(a, b) { if (!b || b === 0) return null; return ((a - b) / b) * 100 }

function TrendBadge({ pct, invert = false }) {
  if (pct === null || pct === undefined) return null
  const positive = invert ? pct <= 0 : pct >= 0
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
      style={positive
        ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' }
        : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }}
    >
      {positive ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

const quickActions = [
  { href: '/legendas',           emoji: '✍️', label: 'Legendas',      desc: 'Gerar com IA',          color: '#f97316' },
  { href: '/mensagens',          emoji: '💬', label: 'Transmissão',   desc: 'Mensagens WhatsApp',    color: '#25d366' },
  { href: '/anuncios',           emoji: '📣', label: 'Anúncios',      desc: 'Gestor Meta Ads',       color: '#facc15' },
  { href: '/anuncios/relatorio', emoji: '📊', label: 'Relatório ADS', desc: 'Performance completa', color: '#60a5fa' },
  { href: '/agendador',          emoji: '📅', label: 'Agendador',     desc: 'Posts Qui–Dom',         color: '#a78bfa' },
  { href: '/financeiro',         emoji: '💰', label: 'Financeiro',    desc: 'Controle financeiro',   color: '#34d399' },
]

const schedule = [
  { dia: 'Quinta', hora: '18h', emoji: '🍔', tipo: 'Quinta do Hambúrguer', sub: 'Preço promocional exclusivo', cor: '#f97316' },
  { dia: 'Sexta',  hora: '18h', emoji: '🔥', tipo: 'Cupom SEXTAOFF10',    sub: '10% OFF no pedido online',     cor: '#ef4444', badge: CUPOM_SEXTA },
  { dia: 'Sábado', hora: '18h', emoji: '🎉', tipo: 'Promoção Rotativa',   sub: '1ª e 3ª semana do mês',        cor: '#a855f7', badge: '2× por mês' },
  { dia: 'Domingo',hora: '17h', emoji: '❤️', tipo: 'Família & Casal',     sub: 'Post aconchegante',            cor: '#60a5fa' },
]

export default function Dashboard() {
  const [status,      setStatus]      = useState(null)
  const [fin,         setFin]         = useState(null)
  const [finAnt,      setFinAnt]      = useState(null)
  const [ads,         setAds]         = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [metaSemanal, setMetaSemanal] = useState(0)

  useEffect(() => {
    setMetaSemanal(parseFloat(localStorage.getItem('metaSemanal') || '0'))
    const { dataInicio, dataFim }     = getRangoSemana(0)
    const { dataInicio: p0, dataFim: p1 } = getRangoSemana(-1)
    Promise.allSettled([
      api.get('/status'),
      api.get(`/financeiro/resumo?dataInicio=${dataInicio}&dataFim=${dataFim}`),
      api.get(`/financeiro/resumo?dataInicio=${p0}&dataFim=${p1}`),
      api.get('/ads/relatorio?dias=7'),
    ]).then(([s, f, fa, a]) => {
      if (s.status  === 'fulfilled') setStatus(s.value)
      if (f.status  === 'fulfilled') setFin(f.value?.resumo || null)
      if (fa.status === 'fulfilled') setFinAnt(fa.value?.resumo || null)
      if (a.status  === 'fulfilled') setAds(a.value || null)
    }).finally(() => setLoading(false))
  }, [])

  const metaOk   = status?.configuracoes?.['META_ACCESS_TOKEN']?.includes('✅')
  const openaiOk = status?.configuracoes?.['OPENAI_API_KEY']?.includes('✅')

  const fat   = fin?.faturamento || 0
  const gas   = fin?.gastos      || 0
  const lucro = fin?.lucro       || 0
  const marg  = fat > 0 ? (lucro / fat) * 100 : 0

  const pFat   = pctDiff(fat,   finAnt?.faturamento)
  const pGas   = pctDiff(gas,   finAnt?.gastos)
  const pLucro = pctDiff(lucro, finAnt?.lucro)

  const metaPct    = metaSemanal > 0 ? Math.min((fat / metaSemanal) * 100, 100) : 0
  const healthCor  = marg >= 30 ? '#34d399' : marg >= 15 ? '#facc15' : fat > 0 ? '#f87171' : '#333'
  const healthText = marg >= 30 ? 'Saudável' : marg >= 15 ? 'Atenção' : fat > 0 ? 'Crítico' : 'Sem dados'

  const r = ads?.resumo
  const ativas = ads?.campanhas?.filter(c => c.status === 'ACTIVE' && !c.erro) || []

  const { dataInicio, dataFim } = getRangoSemana(0)
  const periodoLabel = (() => {
    const o = { day: '2-digit', month: '2-digit' }
    return `${new Date(dataInicio + 'T12:00').toLocaleDateString('pt-BR', o)} → ${new Date(dataFim + 'T12:00').toLocaleDateString('pt-BR', o)}`
  })()

  return (
    <div className="max-w-4xl space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#333' }}>Painel de controle · Bruthus Burger</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {[
            { label: 'Meta', ok: metaOk },
            { label: 'IA',   ok: openaiOk },
          ].map(s => (
            <div key={s.label}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold"
              style={s.ok
                ? { background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }
                : { background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.ok ? '#34d399' : '#f87171', boxShadow: s.ok ? '0 0 6px #34d39960' : 'none' }} />
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          FINANCEIRO — DESTAQUE PRINCIPAL
      ══════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #181818', background: '#0b0b0b' }}>

        {/* Topo do card financeiro */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #141414' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(5,150,105,0.1))', border: '1px solid rgba(52,211,153,0.15)' }}>
              <span className="text-base">💰</span>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Financeiro</p>
              <p className="text-[10px]" style={{ color: '#333' }}>{periodoLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: healthCor + '12', border: `1px solid ${healthCor}25`, color: healthCor }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: healthCor }} />
              {loading ? '…' : healthText}
            </div>
            <Link href="/financeiro" className="text-[10px] font-semibold hover:underline" style={{ color: '#f97316' }}>
              Detalhes →
            </Link>
          </div>
        </div>

        {/* Meta progress */}
        {metaSemanal > 0 && (
          <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #111' }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-medium" style={{ color: '#444' }}>Meta semanal</span>
              <span className="text-[10px] font-bold text-white">
                {loading ? '…' : `${fmt(fat)} / ${fmt(metaSemanal)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#141414' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${loading ? 0 : metaPct}%`,
                  background: metaPct >= 100
                    ? 'linear-gradient(90deg, #34d399, #059669)'
                    : metaPct >= 70
                    ? 'linear-gradient(90deg, #facc15, #d97706)'
                    : 'linear-gradient(90deg, #f97316, #ea580c)',
                  boxShadow: metaPct > 5 ? (metaPct >= 100 ? '0 0 10px rgba(52,211,153,0.3)' : '0 0 10px rgba(249,115,22,0.2)') : 'none',
                }}
              />
            </div>
            {!loading && (
              <p className="text-[10px] mt-1.5" style={{ color: '#2a2a2a' }}>
                {metaPct >= 100 ? '🎯 Meta atingida!' : `${metaPct.toFixed(0)}% — faltam ${fmt(metaSemanal - fat)}`}
              </p>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-[#111]">
          {[
            { label: 'Faturamento', val: fmt(fat),   cor: '#34d399', pct: pFat,   inv: false },
            { label: 'Gastos',      val: fmt(gas),   cor: '#f87171', pct: pGas,   inv: true  },
            { label: 'Lucro',       val: fmt(lucro), cor: lucro >= 0 ? '#60a5fa' : '#f87171', pct: pLucro, inv: false },
            { label: 'Margem',      val: `${marg.toFixed(1)}%`,      cor: healthCor, pct: null, inv: false },
          ].map(m => (
            <div key={m.label} className="px-5 py-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px]"
                style={{ background: `linear-gradient(90deg, ${m.cor}50, transparent)` }} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2.5" style={{ color: '#3a3a3a' }}>
                {m.label}
              </p>
              <p className="text-2xl font-black tracking-tight leading-none mb-2" style={{ color: m.cor }}>
                {loading ? <span style={{ color: '#1a1a1a' }}>—</span> : m.val}
              </p>
              {!loading && <TrendBadge pct={m.pct} invert={m.inv} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Meta Ads ── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #181818', background: '#0b0b0b' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #141414' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(29,78,216,0.1))', border: '1px solid rgba(96,165,250,0.15)' }}>
              <span className="text-base">📣</span>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Meta Ads</p>
              <p className="text-[10px]" style={{ color: '#333' }}>
                {loading ? '…' : ads
                  ? `${ativas.length} campanha${ativas.length !== 1 ? 's' : ''} ativa${ativas.length !== 1 ? 's' : ''} · últimos 7 dias`
                  : 'Token indisponível'}
              </p>
            </div>
          </div>
          <Link href="/anuncios/relatorio" className="text-[10px] font-semibold hover:underline" style={{ color: '#f97316' }}>
            Relatório →
          </Link>
        </div>

        {loading ? (
          <div className="px-5 py-5">
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: '#111' }} />)}
            </div>
          </div>
        ) : !ads ? (
          <div className="px-5 py-5 text-center">
            <p className="text-xs" style={{ color: '#333' }}>Configure o META_ACCESS_TOKEN no Render</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 divide-x divide-[#111]">
              {[
                { label: 'Investido', val: `R$ ${fmtF(r?.totalGasto)}`, cor: '#f97316' },
                { label: 'Cliques',   val: fmtN(r?.totalCliques),        cor: '#fff'    },
                { label: 'CTR',       val: `${fmtF(r?.ctrMedio)}%`,      cor: parseFloat(r?.ctrMedio) >= 1.5 ? '#34d399' : '#facc15' },
                { label: 'CPC',       val: `R$ ${fmtF(r?.cpcMedio)}`,    cor: parseFloat(r?.cpcMedio) <= 1.5 ? '#34d399' : '#facc15' },
              ].map(m => (
                <div key={m.label} className="px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-1.5" style={{ color: '#333' }}>{m.label}</p>
                  <p className="text-lg font-bold" style={{ color: m.cor }}>{m.val}</p>
                </div>
              ))}
            </div>
            {ativas.length > 0 && (
              <div className="px-5 py-3 space-y-2" style={{ borderTop: '1px solid #111' }}>
                {ativas.slice(0, 2).map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} />
                      <p className="text-[11px] truncate max-w-[200px]" style={{ color: '#555' }}>{c.nome}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-semibold">
                      <span style={{ color: parseFloat(c.ctr) >= 1.5 ? '#34d399' : '#facc15' }}>{fmtF(c.ctr)}% CTR</span>
                      <span style={{ color: '#f97316' }}>R$ {fmtF(c.gasto)}</span>
                    </div>
                  </div>
                ))}
                {ativas.length > 2 && <p className="text-[10px]" style={{ color: '#222' }}>+{ativas.length - 2} mais</p>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Acesso rápido ── */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#282828' }}>Acesso Rápido</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {quickActions.map(a => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 p-4 rounded-2xl transition-all duration-200"
              style={{ background: '#0a0a0a', border: '1px solid #141414' }}
              onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${a.color}25`; e.currentTarget.style.background = `${a.color}05` }}
              onMouseLeave={e => { e.currentTarget.style.border = '1px solid #141414'; e.currentTarget.style.background = '#0a0a0a' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                style={{ background: a.color + '12', border: `1px solid ${a.color}20` }}>
                <span className="text-base">{a.emoji}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">{a.label}</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: '#333' }}>{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Estratégia Qui–Dom ── */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#282828' }}>Estratégia de Abertura</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {schedule.map(s => (
            <div key={s.dia} className="p-4 rounded-2xl" style={{ background: '#0a0a0a', border: `1px solid ${s.cor}18` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl">{s.emoji}</span>
                <div className="text-right">
                  <p className="text-[11px] font-bold" style={{ color: s.cor }}>{s.dia}</p>
                  <p className="text-[9px] font-semibold" style={{ color: '#f97316' }}>{s.hora}</p>
                </div>
              </div>
              <p className="text-xs font-bold text-white leading-tight">{s.tipo}</p>
              <p className="text-[10px] mt-1 leading-snug" style={{ color: '#333' }}>{s.sub}</p>
              {s.badge && (
                <span className="inline-block mt-2 text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: s.cor + '15', color: s.cor, border: `1px solid ${s.cor}25` }}>
                  {s.badge}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: '#0a0a0a', border: '1px solid #141414' }}>
          <span className="text-base shrink-0">🏷️</span>
          <p className="text-[11px] min-w-0" style={{ color: '#444' }}>
            Cupom toda Sexta:{' '}
            <code className="font-bold px-1.5 py-0.5 rounded" style={{ color: '#f97316', background: 'rgba(249,115,22,0.08)' }}>
              {CUPOM_SEXTA}
            </code>
            <span className="ml-1">→ 10% OFF</span>
          </p>
          <Link href="/agendador" className="ml-auto text-[10px] font-semibold hover:underline shrink-0" style={{ color: '#f97316' }}>
            Gerenciar →
          </Link>
        </div>
      </div>

    </div>
  )
}
