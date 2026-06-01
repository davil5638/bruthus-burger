'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const SEGMENTOS = [
  { id: 'vip',               rotulo: 'VIP',            emoji: '👑', cor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { id: 'em_risco',          rotulo: 'Em risco',       emoji: '⚠️', cor: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { id: 'perdido',           rotulo: 'Perdido',        emoji: '💔', cor: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { id: 'novo',              rotulo: 'Novo',           emoji: '🆕', cor: 'bg-green-500/15 text-green-400 border-green-500/30' },
  { id: 'impulsivo',         rotulo: 'Impulsivo',      emoji: '⚡', cor: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { id: 'sensivel_desconto', rotulo: 'Sens. desconto', emoji: '🏷️', cor: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
  { id: 'regular',           rotulo: 'Regular',        emoji: '🔄', cor: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
]

function corSeg(id)  { return SEGMENTOS.find(s => s.id === id)?.cor   || 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
function nomeSeg(id) { return SEGMENTOS.find(s => s.id === id)?.rotulo || id || '—' }
function brl(v) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

function corRisco(n) {
  if (n >= 80) return 'text-red-400'
  if (n >= 50) return 'text-orange-400'
  return 'text-gray-400'
}

function formatarTelefone(tel) {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}

function abrirWhatsapp(telefone, mensagem) {
  const num = formatarTelefone(telefone)
  if (!num) return alert('Telefone inválido para este cliente.')
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`
  window.open(url, '_blank')
}

export default function ClientesPage() {
  const [metricas, setMetricas]   = useState(null)
  const [segmentos, setSegmentos] = useState([])
  const [clientes, setClientes]   = useState([])
  const [filtroSeg, setFiltroSeg] = useState('')
  const [busca, setBusca]         = useState('')
  const [ordenar, setOrdenar]     = useState({ campo: 'score_risco', dir: 'desc' })
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)

  const [detalhe, setDetalhe]     = useState(null)
  const [preview, setPreview]     = useState(null)
  const [wppModal, setWppModal]   = useState(null) // { cliente, mensagem, carregando }
  const [busy, setBusy]           = useState(false)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [m, s, c] = await Promise.all([
        api.get('/clientes/metricas'),
        api.get('/clientes/segmentos'),
        api.get(`/clientes?segmento=${filtroSeg}&busca=${busca}&limite=500`),
      ])
      setMetricas(m)
      setSegmentos(s.segmentos || [])
      setClientes(c.clientes || [])
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setLoading(false) }
  }, [filtroSeg, busca])

  useEffect(() => { carregar() }, [carregar])

  // Ordenação local
  const clientesOrdenados = [...clientes].sort((a, b) => {
    const { campo, dir } = ordenar
    const va = Number(a[campo] ?? 0)
    const vb = Number(b[campo] ?? 0)
    return dir === 'desc' ? vb - va : va - vb
  })

  function toggleOrdem(campo) {
    setOrdenar(o => o.campo === campo
      ? { campo, dir: o.dir === 'desc' ? 'asc' : 'desc' }
      : { campo, dir: 'desc' }
    )
  }

  function seta(campo) {
    if (ordenar.campo !== campo) return <span className="text-[#333] ml-0.5">↕</span>
    return <span className="text-[#f97316] ml-0.5">{ordenar.dir === 'desc' ? '↓' : '↑'}</span>
  }

  async function abrirDetalhe(id) {
    setDetalhe({ carregando: true })
    try {
      const r = await api.get(`/clientes/${id}`)
      setDetalhe(r)
    } catch (e) { setDetalhe({ erro: e.message }) }
  }

  async function abrirPreview(seg) {
    setBusy(true)
    setPreview({ segmento: seg, carregando: true })
    try {
      const r = await api.post('/campanhas/preview', { segmento: seg, limite: 8 })
      setPreview(r)
    } catch (e) { setPreview({ erro: e.message, segmento: seg }) }
    finally { setBusy(false) }
  }

  async function gerarMensagemWpp(cliente) {
    setWppModal({ cliente, carregando: true })
    try {
      const r = await api.get(`/campanhas/cliente/${cliente.id}/mensagem`)
      setWppModal({ cliente, mensagem: r.mensagem, incentivo: r.incentivo, cupom: r.cupom })
    } catch (e) {
      setWppModal(null)
      showToast('Erro ao gerar mensagem: ' + e.message, 'error')
    }
  }

  async function recalcular() {
    try {
      const r = await api.post('/clientes/recalcular', {})
      showToast(`Scores recalculados: ${r.processados} clientes`)
      carregar()
    } catch (e) { showToast(e.message, 'error') }
  }

  function exportarCSV() {
    const linhas = [
      ['Nome', 'Telefone', 'Segmento', 'Pedidos', 'Ticket Médio', 'Total Gasto', 'Recência (dias)', 'Score Risco', 'Chance Abandono', 'Perda Estimada'],
      ...clientesOrdenados.map(c => [
        c.nome || '',
        c.telefone || '',
        nomeSeg(c.segmento),
        c.total_pedidos || 0,
        Number(c.ticket_medio || 0).toFixed(2),
        Number(c.total_gasto || 0).toFixed(2),
        c.recencia_dias ?? '',
        c.score_risco || 0,
        Number(c.chance_abandono || 0).toFixed(0) + '%',
        Number(c.valor_estimado_perdido || 0).toFixed(2),
      ])
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes${filtroSeg ? '-' + filtroSeg : ''}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Alertas urgentes
  const alertas = []
  const vipSemPedido = clientes.filter(c => c.segmento === 'vip' && c.recencia_dias >= 30)
  const emRiscoAlto  = clientes.filter(c => c.segmento === 'em_risco' && c.score_risco >= 70)
  const perdidosRico = clientes.filter(c => c.segmento === 'perdido' && Number(c.total_gasto) >= 100)
  if (vipSemPedido.length) alertas.push({ cor: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300', texto: `${vipSemPedido.length} cliente${vipSemPedido.length > 1 ? 's' : ''} VIP sem pedir há 30+ dias — vale uma mensagem pessoal.` })
  if (emRiscoAlto.length)  alertas.push({ cor: 'border-orange-500/30 bg-orange-500/5 text-orange-300', texto: `${emRiscoAlto.length} cliente${emRiscoAlto.length > 1 ? 's' : ''} em risco com score alto — bom momento para reativar.` })
  if (perdidosRico.length) alertas.push({ cor: 'border-red-500/30 bg-red-500/5 text-red-300',         texto: `${perdidosRico.length} cliente${perdidosRico.length > 1 ? 's' : ''} perdido${perdidosRico.length > 1 ? 's' : ''} que já gastaram R$100+ — vale oferecer desconto.` })

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader emoji="👥" title="Clientes" description="Segmentação RFM, alertas de churn e envio manual via WhatsApp">
        <button onClick={recalcular} className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white rounded-lg transition-colors">
          🧮 Recalcular scores
        </button>
        <button onClick={exportarCSV} className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white rounded-lg transition-colors">
          📥 Exportar CSV
        </button>
      </PageHeader>

      {/* Alertas urgentes */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${a.cor}`}>
              <span className="shrink-0">🔔</span>
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      {metricas && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total de clientes',  valor: metricas.totalClientes,        dest: false },
            { label: 'Receita total',      valor: brl(metricas.receitaTotal),    dest: false },
            { label: 'Recuperados',        valor: metricas.recuperados,          dest: true  },
            { label: 'Valor recuperado',   valor: brl(metricas.valorRecuperado), dest: true  },
          ].map(k => (
            <div key={k.label} className={`rounded-xl p-4 border ${k.dest ? 'bg-[#f97316]/10 border-[#f97316]/20' : 'bg-[#111] border-[#1e1e1e]'}`}>
              <div className="text-xs text-[#666] mb-1">{k.label}</div>
              <div className={`text-xl font-bold ${k.dest ? 'text-[#f97316]' : 'text-white'}`}>{k.valor}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cards por segmento */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
        <h2 className="font-semibold text-white mb-4">Segmentos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {segmentos.map(s => (
            <div key={s.segmento} className="bg-[#0d0d0d] rounded-xl p-3 border border-[#1e1e1e]">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${corSeg(s.segmento)}`}>{nomeSeg(s.segmento)}</span>
                <span className="text-xl font-bold text-white">{s.total}</span>
              </div>
              <div className="text-[11px] text-[#555] space-y-0.5 mb-3">
                <div>Ticket médio: {brl(s.ticket_medio)}</div>
                <div>Perda potencial: {brl(s.perda_potencial)}</div>
              </div>
              <button
                onClick={() => abrirPreview(s.segmento)}
                disabled={busy}
                className="w-full text-xs py-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white transition-colors"
              >
                👁️ Ver mensagens
              </button>
            </div>
          ))}
          {segmentos.length === 0 && !loading && (
            <div className="col-span-4 text-center py-6 text-[#444] text-sm">
              Nenhum cliente ainda. Aguardando pedidos.
            </div>
          )}
        </div>
      </div>

      {/* Tabela de clientes */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <select
            value={filtroSeg}
            onChange={e => setFiltroSeg(e.target.value)}
            className="bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Todos os segmentos</option>
            {SEGMENTOS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.rotulo}</option>)}
          </select>
          <input
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px] focus:outline-none focus:border-[#f97316]/40"
          />
          <span className="text-xs text-[#444]">{clientesOrdenados.length} clientes</span>
        </div>

        {loading && <div className="py-10 text-center text-[#444] text-sm">Carregando...</div>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#444] text-xs border-b border-[#1e1e1e]">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">WhatsApp</th>
                  <th className="pb-3 font-medium">Segmento</th>
                  <th className="pb-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => toggleOrdem('total_pedidos')}>
                    Pedidos {seta('total_pedidos')}
                  </th>
                  <th className="pb-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => toggleOrdem('ticket_medio')}>
                    Ticket {seta('ticket_medio')}
                  </th>
                  <th className="pb-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => toggleOrdem('recencia_dias')}>
                    Recência {seta('recencia_dias')}
                  </th>
                  <th className="pb-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => toggleOrdem('score_risco')}>
                    Risco {seta('score_risco')}
                  </th>
                  <th className="pb-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => toggleOrdem('valor_estimado_perdido')}>
                    Perda est. {seta('valor_estimado_perdido')}
                  </th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {clientesOrdenados.map(c => (
                  <tr key={c.id} className="border-b border-[#1a1a1a] hover:bg-[#0d0d0d] transition-colors">
                    <td className="py-2.5 pr-3">
                      <button onClick={() => abrirDetalhe(c.id)} className="text-[#f97316] hover:underline text-left font-medium leading-tight">
                        {c.nome || '(sem nome)'}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.telefone ? (
                        <span className="text-[12px] text-[#888] font-mono">{c.telefone}</span>
                      ) : (
                        <span className="text-[11px] text-[#444]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${corSeg(c.segmento)}`}>{nomeSeg(c.segmento)}</span>
                    </td>
                    <td className="text-right text-white pr-3">{c.total_pedidos}</td>
                    <td className="text-right text-[#888] pr-3">{brl(c.ticket_medio)}</td>
                    <td className="text-right text-[#666] pr-3">{c.recencia_dias ?? '—'}d</td>
                    <td className={`text-right font-bold pr-3 ${corRisco(c.score_risco)}`}>{c.score_risco}</td>
                    <td className="text-right text-[#888] pr-3">{brl(c.valor_estimado_perdido)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => gerarMensagemWpp(c)}
                        title="Abrir WhatsApp com mensagem personalizada"
                        className="text-xs px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors border border-green-500/20 whitespace-nowrap"
                      >
                        📲 WhatsApp
                      </button>
                    </td>
                  </tr>
                ))}
                {clientesOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[#444] text-sm">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal WhatsApp — mensagem personalizada */}
      {wppModal && (
        <Modal titulo="📲 Enviar mensagem via WhatsApp" onClose={() => setWppModal(null)}>
          {wppModal.carregando ? (
            <div className="py-8 text-center">
              <p className="text-[#666] text-sm animate-pulse">Gerando mensagem personalizada com IA...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-[#555]">Cliente</p>
                  <p className="text-white font-semibold">{wppModal.cliente?.nome || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[#555]">Telefone</p>
                  <p className="text-white font-mono">{wppModal.cliente?.telefone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[#555]">Segmento</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${corSeg(wppModal.cliente?.segmento)}`}>
                    {nomeSeg(wppModal.cliente?.segmento)}
                  </span>
                </div>
                {wppModal.cupom && (
                  <div>
                    <p className="text-xs text-[#555]">Cupom</p>
                    <p className="text-[#f97316] font-bold font-mono">{wppModal.cupom}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-[#555] mb-2">Mensagem gerada</p>
                <textarea
                  value={wppModal.mensagem || ''}
                  onChange={e => setWppModal(m => ({ ...m, mensagem: e.target.value }))}
                  rows={7}
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#f97316]/40 resize-none leading-relaxed"
                />
                <p className="text-[11px] text-[#444] mt-1">Você pode editar a mensagem antes de enviar.</p>
              </div>

              <button
                onClick={() => {
                  abrirWhatsapp(wppModal.cliente?.telefone, wppModal.mensagem)
                }}
                disabled={!wppModal.cliente?.telefone}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Abrir no WhatsApp Business
              </button>

              {!wppModal.cliente?.telefone && (
                <p className="text-xs text-red-400 text-center">Este cliente não tem telefone cadastrado.</p>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Modal preview de segmento */}
      {preview && (
        <Modal titulo={`Preview — ${nomeSeg(preview.segmento)}`} onClose={() => setPreview(null)}>
          {preview.carregando && <p className="text-[#666] text-sm animate-pulse">Gerando mensagens com IA...</p>}
          {preview.erro && <p className="text-red-400 text-sm">{preview.erro}</p>}
          {preview.previews?.length === 0 && <p className="text-[#666] text-sm">Nenhum cliente elegível neste segmento.</p>}
          {preview.previews?.map(p => (
            <div key={p.clienteId} className="bg-[#0d0d0d] rounded-xl border border-[#1e1e1e] p-4 mb-3">
              <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{p.nome}</p>
                  <p className="text-[11px] text-[#555] font-mono">{p.telefone}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {p.cupom && (
                    <span className="text-[10px] bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/20 px-2 py-0.5 rounded-full font-bold font-mono">
                      {p.cupom}
                    </span>
                  )}
                  <span className="text-[10px] text-[#555]">Risco {p.scoreRisco}</span>
                  <button
                    onClick={() => {
                      setPreview(null)
                      setWppModal({ cliente: { id: p.clienteId, nome: p.nome, telefone: p.telefone, segmento: preview.segmento }, mensagem: p.mensagem, cupom: p.cupom })
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                  >
                    📲 WhatsApp
                  </button>
                </div>
              </div>
              <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed bg-[#0a0a0a] rounded-lg p-3 border border-[#1a1a1a]">{p.mensagem}</pre>
            </div>
          ))}
        </Modal>
      )}

      {/* Modal detalhe do cliente */}
      {detalhe && (
        <Modal titulo={detalhe.cliente?.nome || 'Cliente'} onClose={() => setDetalhe(null)}>
          {detalhe.carregando && <p className="text-[#666] text-sm">Carregando...</p>}
          {detalhe.erro && <p className="text-red-400 text-sm">{detalhe.erro}</p>}
          {detalhe.cliente && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Telefone',     detalhe.cliente.telefone || '—'],
                  ['Segmento',     nomeSeg(detalhe.cliente.segmento)],
                  ['Pedidos',      detalhe.cliente.total_pedidos],
                  ['Ticket médio', brl(detalhe.cliente.ticket_medio)],
                  ['Total gasto',  brl(detalhe.cliente.total_gasto)],
                  ['Intervalo',    `${Number(detalhe.cliente.intervalo_medio_dias || 0).toFixed(0)}d`],
                  ['Recência',     `${detalhe.cliente.recencia_dias ?? '—'}d`],
                  ['Score risco',  detalhe.cliente.score_risco],
                  ['Abandono',     `${Number(detalhe.cliente.chance_abandono).toFixed(0)}%`],
                ].map(([l, v]) => (
                  <div key={l} className="bg-[#0d0d0d] rounded-xl border border-[#1e1e1e] p-3">
                    <div className="text-[10px] text-[#444] uppercase tracking-wide mb-1">{l}</div>
                    <div className="text-white font-medium">{v}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setDetalhe(null)
                  gerarMensagemWpp(detalhe.cliente)
                }}
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar mensagem pelo WhatsApp Business
              </button>

              <div>
                <h4 className="text-[#444] text-xs uppercase tracking-wide mb-2">Últimos pedidos</h4>
                {detalhe.pedidos?.length === 0 && <p className="text-[#555] text-xs">Sem pedidos registrados.</p>}
                {detalhe.pedidos?.slice(0, 8).map(p => (
                  <div key={p.id} className="flex justify-between text-xs py-2 border-b border-[#1a1a1a]">
                    <span className="text-[#666]">{new Date(p.data_pedido).toLocaleString('pt-BR')}</span>
                    <span className="text-[#555]">{p.cupom || ''}</span>
                    <span className="text-white font-medium">{brl(p.valor)}</span>
                  </div>
                ))}
              </div>

              {detalhe.envios?.length > 0 && (
                <div>
                  <h4 className="text-[#444] text-xs uppercase tracking-wide mb-2">Campanhas enviadas</h4>
                  {detalhe.envios.map(e => (
                    <div key={e.id} className="text-xs py-2 border-b border-[#1a1a1a]">
                      <div className="flex justify-between mb-1">
                        <span className="text-[#555]">{new Date(e.enviado_em).toLocaleString('pt-BR')}</span>
                        <span className={e.status === 'comprou' ? 'text-green-400 font-medium' : 'text-[#555]'}>{e.status}</span>
                      </div>
                      <pre className="text-[#888] whitespace-pre-wrap font-sans">{e.mensagem}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111] border border-[#1e1e1e] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-base">{titulo}</h3>
          <button onClick={onClose} className="text-[#444] hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
