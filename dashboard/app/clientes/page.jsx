'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import Button from '../../components/Button'
import { Toast } from '../../components/Toast'

const SEGMENTOS = [
  { id: 'vip',               rotulo: 'VIP',               cor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { id: 'em_risco',          rotulo: 'Em risco',          cor: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { id: 'perdido',           rotulo: 'Perdido',           cor: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { id: 'novo',              rotulo: 'Novo',              cor: 'bg-green-500/15 text-green-400 border-green-500/30' },
  { id: 'impulsivo',         rotulo: 'Impulsivo',         cor: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { id: 'sensivel_desconto', rotulo: 'Sens. desconto',    cor: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
  { id: 'regular',           rotulo: 'Regular',           cor: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
]

function corSeg(id) { return SEGMENTOS.find(s => s.id === id)?.cor || 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
function nomeSeg(id) { return SEGMENTOS.find(s => s.id === id)?.rotulo || id || '—' }
function brl(v) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
function risco(n) {
  if (n >= 80) return 'text-red-400'
  if (n >= 50) return 'text-orange-400'
  return 'text-gray-300'
}

export default function ClientesPage() {
  const [metricas, setMetricas]   = useState(null)
  const [segmentos, setSegmentos] = useState([])
  const [clientes, setClientes]   = useState([])
  const [filtroSeg, setFiltroSeg] = useState('')
  const [busca, setBusca]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [wpp, setWpp]             = useState(null)

  const [detalhe, setDetalhe]     = useState(null)
  const [preview, setPreview]     = useState(null)
  const [busy, setBusy]           = useState(false)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [m, s, c, w] = await Promise.all([
        api.get('/clientes/metricas'),
        api.get('/clientes/segmentos'),
        api.get(`/clientes?segmento=${filtroSeg}&busca=${busca}&limite=200`),
        api.get('/clientes/whatsapp/status'),
      ])
      setMetricas(m)
      setSegmentos(s.segmentos || [])
      setClientes(c.clientes || [])
      setWpp(w)
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setLoading(false) }
  }, [filtroSeg, busca])

  useEffect(() => { carregar() }, [carregar])

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
      const r = await api.post('/campanhas/preview', { segmento: seg, limite: 5 })
      setPreview(r)
    } catch (e) { setPreview({ erro: e.message, segmento: seg }) }
    finally { setBusy(false) }
  }

  async function disparar(seg, dryRun = false) {
    if (!confirm(`Disparar campanha para "${nomeSeg(seg)}"${dryRun ? ' (teste, não envia)' : ''}?`)) return
    setBusy(true)
    try {
      const r = await api.post('/campanhas/disparar', { segmento: seg, limite: 30, dryRun })
      showToast(`Enviados: ${r.enviados} | Falhas: ${r.falhas}`)
      setPreview(null)
      carregar()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function dispararCliente(id) {
    if (!confirm('Enviar campanha personalizada para este cliente?')) return
    try {
      const r = await api.post(`/campanhas/cliente/${id}`, { dryRun: false })
      showToast(`Enviado! Status: ${r.status}`)
      if (detalhe?.cliente?.id === id) abrirDetalhe(id)
    } catch (e) { showToast(e.message, 'error') }
  }

  async function recalcular() {
    try {
      const r = await api.post('/clientes/recalcular', {})
      showToast(`Scores recalculados: ${r.processados} clientes`)
      carregar()
    } catch (e) { showToast(e.message, 'error') }
  }

  async function seed() {
    if (!confirm('Gerar 80 clientes fake para teste?')) return
    try {
      const r = await api.post('/clientes/seed', { qtd: 80 })
      showToast(`${r.criados} clientes gerados`)
      carregar()
    } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader emoji="👥" title="Recuperação de Clientes" description="Detecta churn, segmenta e dispara campanhas personalizadas via WhatsApp">
        <button onClick={recalcular} className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white rounded-lg transition-colors">
          🧮 Recalcular
        </button>
        <button onClick={seed} className="px-3 py-1.5 text-sm bg-[#f97316]/10 border border-[#f97316]/20 text-[#f97316] hover:bg-[#f97316]/20 rounded-lg transition-colors">
          🌱 Seed teste
        </button>
      </PageHeader>

      {/* Status WhatsApp */}
      {wpp && (
        <div className={`text-xs rounded-xl px-4 py-2.5 border ${
          wpp.dryRun
            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
            : wpp.erro
              ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : 'bg-green-500/10 border-green-500/20 text-green-300'
        }`}>
          {wpp.dryRun
            ? '🧪 WhatsApp em modo TESTE — configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no Render para disparar de verdade.'
            : wpp.erro
              ? `⚠️ Evolution API com erro: ${typeof wpp.erro === 'string' ? wpp.erro : JSON.stringify(wpp.erro)}`
              : `✅ WhatsApp conectado — instância: ${wpp.instancia}`}
        </div>
      )}

      {/* KPIs */}
      {metricas && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Clientes',        valor: metricas.totalClientes,             dest: false },
            { label: 'Receita total',   valor: brl(metricas.receitaTotal),         dest: false },
            { label: 'Envios 30d',      valor: metricas.enviosUltimos30,           dest: false },
            { label: 'Recuperados',     valor: metricas.recuperados,               dest: true  },
            { label: 'Valor recuperado',valor: brl(metricas.valorRecuperado),      dest: true  },
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
              <div className="text-[11px] text-[#555] space-y-0.5">
                <div>Ticket: {brl(s.ticket_medio)}</div>
                <div>Perda pot.: {brl(s.perda_potencial)}</div>
              </div>
              <div className="flex gap-1 mt-2">
                <button onClick={() => abrirPreview(s.segmento)} disabled={busy}
                  className="flex-1 text-xs py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white transition-colors">
                  👁️ Ver
                </button>
                <button onClick={() => disparar(s.segmento, false)} disabled={busy}
                  className="flex-1 text-xs py-1 rounded-lg bg-[#f97316] text-white font-medium hover:bg-[#ea6c0a] transition-colors">
                  📨 Enviar
                </button>
              </div>
            </div>
          ))}
          {segmentos.length === 0 && !loading && (
            <div className="col-span-4 text-center py-6 text-[#444] text-sm">
              Nenhum cliente ainda. Aguardando pedidos ou use 🌱 Seed teste.
            </div>
          )}
        </div>
      </div>

      {/* Tabela de clientes */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <select value={filtroSeg} onChange={e => setFiltroSeg(e.target.value)}
            className="bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] rounded-lg px-3 py-1.5 text-sm">
            <option value="">Todos os segmentos</option>
            {SEGMENTOS.map(s => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
          </select>
          <input placeholder="Buscar nome ou telefone..." value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px] focus:outline-none focus:border-[#f97316]/40" />
          <span className="text-xs text-[#444] ml-auto">{clientes.length} clientes</span>
        </div>

        {loading && <div className="py-10 text-center text-[#444] text-sm">Carregando...</div>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#444] text-xs border-b border-[#1e1e1e]">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Segmento</th>
                  <th className="pb-3 font-medium text-right">Pedidos</th>
                  <th className="pb-3 font-medium text-right">Ticket</th>
                  <th className="pb-3 font-medium text-right">Recência</th>
                  <th className="pb-3 font-medium text-right">Risco</th>
                  <th className="pb-3 font-medium text-right">Abandono</th>
                  <th className="pb-3 font-medium text-right">Perda est.</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id} className="border-b border-[#1a1a1a] hover:bg-[#0d0d0d] transition-colors">
                    <td className="py-2.5">
                      <button onClick={() => abrirDetalhe(c.id)} className="text-[#f97316] hover:underline text-left font-medium">
                        {c.nome || '(sem nome)'}
                      </button>
                      <div className="text-[11px] text-[#555]">{c.telefone}</div>
                    </td>
                    <td>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${corSeg(c.segmento)}`}>{nomeSeg(c.segmento)}</span>
                    </td>
                    <td className="text-right text-white">{c.total_pedidos}</td>
                    <td className="text-right text-[#888]">{brl(c.ticket_medio)}</td>
                    <td className="text-right text-[#666]">{c.recencia_dias ?? '—'}d</td>
                    <td className={`text-right font-bold ${risco(c.score_risco)}`}>{c.score_risco}</td>
                    <td className="text-right text-[#888]">{Number(c.chance_abandono || 0).toFixed(0)}%</td>
                    <td className="text-right text-[#888]">{brl(c.valor_estimado_perdido)}</td>
                    <td className="text-right">
                      <button onClick={() => dispararCliente(c.id)}
                        className="text-xs px-2 py-1 rounded-lg bg-[#f97316]/10 text-[#f97316] hover:bg-[#f97316]/20 transition-colors border border-[#f97316]/20">
                        📨
                      </button>
                    </td>
                  </tr>
                ))}
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[#444] text-sm">
                      Nenhum cliente encontrado. Aguardando pedidos via OlaClick.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal preview de campanha */}
      {preview && (
        <Modal titulo={`Preview — ${nomeSeg(preview.segmento)}`} onClose={() => setPreview(null)}>
          {preview.carregando && <p className="text-[#666] text-sm">Gerando mensagens com IA...</p>}
          {preview.erro && <p className="text-red-400 text-sm">{preview.erro}</p>}
          {preview.previews?.length === 0 && <p className="text-[#666] text-sm">Nenhum cliente elegível neste segmento.</p>}
          {preview.previews?.map(p => (
            <div key={p.clienteId} className="bg-[#0d0d0d] rounded-xl border border-[#1e1e1e] p-4 mb-3">
              <div className="flex justify-between text-[11px] text-[#555] mb-2">
                <span>{p.nome} · {p.telefone}</span>
                <span>Risco {p.scoreRisco} {p.cupom ? `· cupom ${p.cupom}` : ''}</span>
              </div>
              <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed">{p.mensagem}</pre>
            </div>
          ))}
          {preview.previews?.length > 0 && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => disparar(preview.segmento, true)} disabled={busy}
                className="flex-1 py-2 text-sm rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white transition-colors">
                🧪 Testar (não envia)
              </button>
              <button onClick={() => disparar(preview.segmento, false)} disabled={busy}
                className="flex-1 py-2 text-sm rounded-xl bg-[#f97316] text-white font-semibold hover:bg-[#ea6c0a] transition-colors">
                📨 Disparar de verdade
              </button>
            </div>
          )}
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
                  ['Telefone',    detalhe.cliente.telefone],
                  ['Segmento',    nomeSeg(detalhe.cliente.segmento)],
                  ['Pedidos',     detalhe.cliente.total_pedidos],
                  ['Ticket médio',brl(detalhe.cliente.ticket_medio)],
                  ['Total gasto', brl(detalhe.cliente.total_gasto)],
                  ['Intervalo',   `${Number(detalhe.cliente.intervalo_medio_dias || 0).toFixed(0)}d`],
                  ['Recência',    `${detalhe.cliente.recencia_dias ?? '—'}d`],
                  ['Score risco', detalhe.cliente.score_risco],
                  ['Abandono',    `${Number(detalhe.cliente.chance_abandono).toFixed(0)}%`],
                ].map(([l, v]) => (
                  <div key={l} className="bg-[#0d0d0d] rounded-xl border border-[#1e1e1e] p-3">
                    <div className="text-[10px] text-[#444] uppercase tracking-wide mb-1">{l}</div>
                    <div className="text-white font-medium">{v}</div>
                  </div>
                ))}
              </div>

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

              <div>
                <h4 className="text-[#444] text-xs uppercase tracking-wide mb-2">Campanhas enviadas</h4>
                {detalhe.envios?.length === 0 && <p className="text-[#555] text-xs">Nenhuma campanha enviada ainda.</p>}
                {detalhe.envios?.map(e => (
                  <div key={e.id} className="text-xs py-2 border-b border-[#1a1a1a]">
                    <div className="flex justify-between mb-1">
                      <span className="text-[#555]">{new Date(e.enviado_em).toLocaleString('pt-BR')}</span>
                      <span className={e.status === 'comprou' ? 'text-green-400 font-medium' : 'text-[#555]'}>{e.status}</span>
                    </div>
                    <pre className="text-[#888] whitespace-pre-wrap font-sans">{e.mensagem}</pre>
                  </div>
                ))}
              </div>

              <button onClick={() => dispararCliente(detalhe.cliente.id)}
                className="w-full py-2.5 rounded-xl bg-[#f97316] text-white font-semibold hover:bg-[#ea6c0a] transition-colors">
                📨 Disparar campanha personalizada
              </button>
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
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg">{titulo}</h3>
          <button onClick={onClose} className="text-[#444] hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
