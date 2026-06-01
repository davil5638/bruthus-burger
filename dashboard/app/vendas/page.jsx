'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const DIAS = [
  { dow: 1, label: 'Seg', full: 'segunda' },
  { dow: 2, label: 'Ter', full: 'terça' },
  { dow: 3, label: 'Qua', full: 'quarta' },
  { dow: 4, label: 'Qui', full: 'quinta' },
  { dow: 5, label: 'Sex', full: 'sexta' },
  { dow: 6, label: 'Sáb', full: 'sábado' },
  { dow: 0, label: 'Dom', full: 'domingo' },
]

const PERIODOS = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
]

function brl(v) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
function fmtCompact(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return Math.round(v)
}

function corCelula(valor, max) {
  if (!valor || max <= 0) return { background: '#0d0d0d', color: '#2a2a2a' }
  const t = valor / max
  const op = 0.14 + 0.86 * t
  return { background: `rgba(249, 115, 22, ${op})`, color: t > 0.5 ? '#fff' : '#e8a76a' }
}

export default function VendasPage() {
  const [dados, setDados]     = useState(null)
  const [periodo, setPeriodo] = useState(90)
  const [metrica, setMetrica] = useState('pedidos') // 'pedidos' | 'faturamento'
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState(null)

  const carregar = useCallback(async (dias) => {
    setLoading(true)
    try {
      const d = await api.get(`/vendas/mapa-calor?dias=${dias}`)
      setDados(d)
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar(periodo) }, [carregar, periodo])

  // Mapa { "dow-hora": célula }
  const gradeMap = {}
  let maxCelula = 0
  if (dados?.grade) {
    for (const c of dados.grade) {
      gradeMap[`${c.diaSemana}-${c.hora}`] = c
      if (c[metrica] > maxCelula) maxCelula = c[metrica]
    }
  }

  // Horas ativas (faixa contígua do menor ao maior horário com venda)
  let horas = []
  if (dados?.grade?.length) {
    const hs = dados.grade.map(c => c.hora)
    const minH = Math.min(...hs)
    const maxH = Math.max(...hs)
    for (let h = minH; h <= maxH; h++) horas.push(h)
  }

  // Análise por dia (preenchendo dias sem venda com zero)
  const porDiaFull = DIAS.map(d => {
    const f = dados?.porDia?.find(p => p.diaSemana === d.dow)
    return { ...d, pedidos: f?.pedidos || 0, faturamento: f?.faturamento || 0 }
  })
  const maxDia = Math.max(...porDiaFull.map(d => d[metrica]), 0)
  const diasComVenda = porDiaFull.filter(d => d.faturamento > 0)
  const melhorDia = diasComVenda.length ? [...diasComVenda].sort((a, b) => b.faturamento - a.faturamento)[0] : null
  const piorDia   = diasComVenda.length > 1 ? [...diasComVenda].sort((a, b) => a.faturamento - b.faturamento)[0] : null
  const picoHora  = dados?.porHora?.length ? [...dados.porHora].sort((a, b) => b.pedidos - a.pedidos)[0] : null
  const temDados  = dados && dados.totalPedidos > 0

  const ticketGeral = temDados ? dados.totalFaturamento / dados.totalPedidos : 0

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader emoji="🔥" title="Mapa de Vendas" description="Descubra seus dias e horários fortes e fracos para saber quando agir" />

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#555]">Período:</span>
        {PERIODOS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              periodo === p.value ? 'bg-[#f97316] text-white' : 'bg-[#1a1a1a] text-[#666] border border-[#333] hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 bg-[#1a1a1a] border border-[#333] rounded-lg p-0.5">
          {[['pedidos', '🍔 Pedidos'], ['faturamento', '💰 Faturamento']].map(([m, l]) => (
            <button
              key={m}
              onClick={() => setMetrica(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                metrica === m ? 'bg-[#f97316] text-white' : 'text-[#666] hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-3xl mb-3 animate-pulse">🔥</p>
          <p className="text-sm text-[#555]">Carregando suas vendas...</p>
        </div>
      )}

      {!loading && !temDados && (
        <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm text-[#555]">Ainda não há pedidos suficientes neste período.</p>
          <p className="text-[11px] text-[#333] mt-1">O mapa aparece conforme os pedidos chegam pelo OlaClick.</p>
        </div>
      )}

      {!loading && temDados && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 border bg-[#111] border-[#1e1e1e]">
              <div className="text-xs text-[#666] mb-1">Pedidos no período</div>
              <div className="text-xl font-bold text-white">{dados.totalPedidos}</div>
            </div>
            <div className="rounded-xl p-4 border bg-[#111] border-[#1e1e1e]">
              <div className="text-xs text-[#666] mb-1">Faturamento</div>
              <div className="text-xl font-bold text-white">{brl(dados.totalFaturamento)}</div>
            </div>
            <div className="rounded-xl p-4 border bg-[#f97316]/10 border-[#f97316]/20">
              <div className="text-xs text-[#666] mb-1">Dia mais forte</div>
              <div className="text-xl font-bold text-[#f97316] capitalize">{melhorDia?.full || '—'}</div>
            </div>
            <div className="rounded-xl p-4 border bg-[#111] border-[#1e1e1e]">
              <div className="text-xs text-[#666] mb-1">Horário de pico</div>
              <div className="text-xl font-bold text-white">{picoHora ? `${picoHora.hora}h` : '—'}</div>
            </div>
          </div>

          {/* Mapa de calor */}
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-white">Mapa de calor — {metrica === 'pedidos' ? 'pedidos' : 'faturamento'} por dia e hora</h2>
              <div className="flex items-center gap-2 text-[10px] text-[#555]">
                <span>menos</span>
                <div className="flex gap-0.5">
                  {[0.14, 0.35, 0.55, 0.75, 1].map(op => (
                    <span key={op} className="w-4 h-3 rounded-sm" style={{ background: `rgba(249,115,22,${op})` }} />
                  ))}
                </div>
                <span>mais</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-max">
                {/* Cabeçalho de horas */}
                <div className="flex gap-1 mb-1">
                  <div className="w-10 shrink-0" />
                  {horas.map(h => (
                    <div key={h} className="w-10 shrink-0 text-center text-[10px] text-[#555] font-mono">{h}h</div>
                  ))}
                </div>
                {/* Linhas por dia */}
                {DIAS.map(d => (
                  <div key={d.dow} className="flex gap-1 mb-1 items-center">
                    <div className="w-10 shrink-0 text-[11px] text-[#888] font-medium">{d.label}</div>
                    {horas.map(h => {
                      const cel = gradeMap[`${d.dow}-${h}`]
                      const val = cel?.[metrica] || 0
                      const estilo = corCelula(val, maxCelula)
                      return (
                        <div
                          key={h}
                          className="w-10 h-10 shrink-0 rounded-md flex items-center justify-center text-[10px] font-semibold transition-transform hover:scale-110 cursor-default"
                          style={estilo}
                          title={cel ? `${d.label} ${h}h — ${cel.pedidos} pedido(s), ${brl(cel.faturamento)}` : `${d.label} ${h}h — sem vendas`}
                        >
                          {val > 0 ? (metrica === 'faturamento' ? fmtCompact(val) : val) : ''}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-[#444] mt-3">Passe o mouse sobre cada quadrado para ver os números. Horário de Fortaleza.</p>
          </div>

          {/* Comparativo por dia da semana */}
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
            <h2 className="font-semibold text-white mb-4">{metrica === 'pedidos' ? 'Pedidos' : 'Faturamento'} por dia da semana</h2>
            <div className="space-y-2.5">
              {porDiaFull.map(d => {
                const val = d[metrica]
                const pct = maxDia > 0 ? (val / maxDia) * 100 : 0
                const ehMelhor = melhorDia && d.dow === melhorDia.dow
                const ehPior = piorDia && d.dow === piorDia.dow
                return (
                  <div key={d.dow} className="flex items-center gap-3">
                    <span className="w-10 text-xs text-[#888] font-medium shrink-0">{d.label}</span>
                    <div className="flex-1 h-7 bg-[#0a0a0a] rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all flex items-center justify-end px-2"
                        style={{
                          width: `${Math.max(pct, val > 0 ? 6 : 0)}%`,
                          background: ehMelhor ? 'linear-gradient(90deg, #f97316, #ea580c)' : ehPior ? 'rgba(239,68,68,0.5)' : 'rgba(249,115,22,0.35)',
                        }}
                      >
                        {val > 0 && (
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">
                            {metrica === 'faturamento' ? brl(val) : `${val} pedidos`}
                          </span>
                        )}
                      </div>
                    </div>
                    {ehMelhor && <span className="text-[10px] text-[#f97316] shrink-0">🔥 forte</span>}
                    {ehPior && <span className="text-[10px] text-red-400 shrink-0">📉 fraco</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recomendações */}
          <div className="bg-[#0f0f0f] rounded-2xl border border-[#f97316]/20 p-5">
            <h2 className="font-semibold text-white mb-3 flex items-center gap-2">💡 O que fazer com isso</h2>
            <div className="space-y-2.5 text-sm">
              {piorDia && (
                <div className="flex items-start gap-2 text-[#bbb]">
                  <span className="shrink-0">📉</span>
                  <p>
                    <strong className="text-white capitalize">{piorDia.full}</strong> é seu dia mais fraco
                    (apenas {brl(piorDia.faturamento)}). Uma <strong className="text-[#f97316]">promoção de {piorDia.full}</strong> ajuda
                    a equilibrar a semana e aproveitar a cozinha ociosa.
                  </p>
                </div>
              )}
              {melhorDia && (
                <div className="flex items-start gap-2 text-[#bbb]">
                  <span className="shrink-0">🔥</span>
                  <p>
                    <strong className="text-white capitalize">{melhorDia.full}</strong> é seu dia mais forte
                    ({brl(melhorDia.faturamento)}). Garanta <strong className="text-[#f97316]">estoque e equipe</strong> reforçados —
                    e evite dar desconto num dia que já vende sozinho.
                  </p>
                </div>
              )}
              {picoHora && (
                <div className="flex items-start gap-2 text-[#bbb]">
                  <span className="shrink-0">⏰</span>
                  <p>
                    Seu pico de pedidos é por volta das <strong className="text-white">{picoHora.hora}h</strong>.
                    Solte anúncios e stories <strong className="text-[#f97316]">~1h antes</strong> (por volta das {Math.max(0, picoHora.hora - 1)}h)
                    para pegar a fome chegando.
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2 text-[#bbb]">
                <span className="shrink-0">🎟️</span>
                <p>
                  Ticket médio do período: <strong className="text-white">{brl(ticketGeral)}</strong>.
                  Use esse valor na aba <strong className="text-[#f97316]">Relatório Ads</strong> para estimar o retorno dos anúncios.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
