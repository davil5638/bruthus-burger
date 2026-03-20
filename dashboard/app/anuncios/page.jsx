'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    || 'duchjjeaw'
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'bruthus_unsigned'

const ORCAMENTOS = [
  { valor: 1000, label: 'R$10/dia', desc: 'Início'       },
  { valor: 2000, label: 'R$20/dia', desc: 'Recomendado'  },
  { valor: 3000, label: 'R$30/dia', desc: 'Mais alcance' },
  { valor: 5000, label: 'R$50/dia', desc: 'Agressivo'    },
]

const DURACOES = [
  { dias: 3,  label: '3 dias'  },
  { dias: 5,  label: '5 dias'  },
  { dias: 7,  label: '7 dias'  },
  { dias: 15, label: '15 dias' },
]

const TIPOS_IA = [
  { id: 'SMASH',   label: '🍔 Smash'       },
  { id: 'NORMAL',  label: '🍔 Normal 150g' },
  { id: 'COMBO',   label: '🍟 Combo'       },
  { id: 'QUINTA',  label: '🎉 Quinta'      },
  { id: 'SEXTA',   label: '🔥 Sexta'       },
  { id: 'VENDAS',  label: '💰 Vendas'      },
  { id: 'FAMILIA', label: '❤️ Família'     },
]

const STATUS_CONFIG = {
  ACTIVE:   { label: 'Ativa',     cor: 'bg-green-500/20 text-green-400 border-green-500/30'   },
  PAUSED:   { label: 'Pausada',   cor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  DELETED:  { label: 'Excluída',  cor: 'bg-red-500/20 text-red-400 border-red-500/30'          },
  ARCHIVED: { label: 'Arquivada', cor: 'bg-[#222] text-[#555] border-[#333]'                   },
}

const ALCANCE_MAP = {
  1000: { min: 800,  max: 1500 },
  2000: { min: 1500, max: 3000 },
  3000: { min: 3000, max: 5000 },
  5000: { min: 5000, max: 8000 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthError(err) {
  const msg = (err?.message || '').toLowerCase()
  return msg.includes('token') || msg.includes('permission') || msg.includes('capability') || msg.includes('oauth') || msg.includes('autoriza')
}

async function uploadCloudinary(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', 'bruthus/ads')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Falha no upload da imagem')
  return res.json()
}

function fmt(n, prefix = '') {
  if (n == null) return '—'
  return `${prefix}${Number(n).toLocaleString('pt-BR')}`
}

function fmtBrl(n) {
  if (n == null) return '—'
  return `R$${parseFloat(n).toFixed(2)}`
}

// ─── Setup Guide Card ─────────────────────────────────────────────────────────

function SetupGuideCard() {
  return (
    <div className="rounded-xl border-2 border-orange-500/50 bg-orange-500/5 p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl">🔧</span>
        <div>
          <h3 className="text-sm font-bold text-orange-400">Configuração necessária</h3>
          <p className="text-xs text-[#999] mt-1">
            Para usar o Gestor de Tráfego, você precisa de um token Meta com permissão de anúncios.
          </p>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {[
          { n: '1', text: 'Acesse developers.facebook.com/apps' },
          { n: '2', text: 'Selecione seu app → "Adicionar produto" → "Marketing API"' },
          { n: '3', text: 'Vá em Ferramentas → Graph API Explorer' },
          { n: '4', text: 'Gere um token com: ads_management + ads_read' },
          { n: '5', text: 'Atualize META_ACCESS_TOKEN no Render com o novo token' },
        ].map(s => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] font-bold flex items-center justify-center">
              {s.n}
            </span>
            <p className="text-xs text-[#aaa] leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
      <a
        href="https://developers.facebook.com/apps"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-xs font-semibold text-orange-400 hover:text-orange-300 border border-orange-500/30 rounded-lg px-3 py-2 hover:border-orange-400/50 transition-colors"
      >
        ↗ Abrir developers.facebook.com/apps
      </a>
    </div>
  )
}

// ─── Campanha Card ────────────────────────────────────────────────────────────

function CampanhaCard({ campanha, metricas, onAtualizar, onSetupError }) {
  const [loadingAcao, setLoadingAcao] = useState(null)
  const [editandoOrc, setEditandoOrc] = useState(false)
  const [novoOrc, setNovoOrc]         = useState('')
  const [toast, setToast]             = useState(null)

  const statusCfg = STATUS_CONFIG[campanha.status] || STATUS_CONFIG.PAUSED
  const adSet     = campanha.adSets?.[0]

  // Orçamento: tenta adset, depois nível de campanha
  const orcCentavos = parseInt(adSet?.daily_budget || 0) || parseInt(campanha.daily_budget || 0)
  const orcAtual    = orcCentavos > 0 ? `R$${(orcCentavos / 100).toFixed(2)}/dia` : '—'

  // Data de encerramento
  const encerra = campanha.stop_time
    ? new Date(campanha.stop_time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null

  async function acao(tipo) {
    setLoadingAcao(tipo)
    try {
      if (tipo === 'pausar')  await api.post(`/ads/${campanha.id}/pausar`)
      if (tipo === 'ativar')  await api.post(`/ads/${campanha.id}/ativar`)
      if (tipo === 'excluir') await api.delete(`/ads/${campanha.id}`)
      setToast({ message: `Campanha ${tipo === 'excluir' ? 'excluída' : tipo === 'pausar' ? 'pausada' : 'ativada'}!`, type: 'success' })
      onAtualizar()
    } catch (e) {
      if (isAuthError(e)) onSetupError?.()
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingAcao(null) }
  }

  async function salvarOrcamento() {
    if (!novoOrc) return
    setLoadingAcao('orc')
    try {
      const centavos = Math.round(parseFloat(novoOrc) * 100)
      // tenta adset, senão campanha
      if (adSet?.id) {
        await api.patch(`/ads/adset/${adSet.id}/orcamento`, { orcamentoDiario: centavos })
      } else {
        await api.patch(`/ads/${campanha.id}/orcamento`, { orcamentoDiario: centavos })
      }
      setToast({ message: `Orçamento atualizado: R$${novoOrc}/dia`, type: 'success' })
      setEditandoOrc(false)
      onAtualizar()
    } catch (e) {
      if (isAuthError(e)) onSetupError?.()
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingAcao(null) }
  }

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-4 hover:border-[#333] transition-colors">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{campanha.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-[#444] font-mono">{campanha.id}</p>
            {encerra && (
              <span className="text-[10px] text-[#555]">· encerra {encerra}</span>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${statusCfg.cor}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Mini métricas inline */}
      {metricas && (metricas.impressoes > 0 || metricas.gasto > 0) && (
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[
            { label: 'Gasto',      value: `R$${parseFloat(metricas.gasto || 0).toFixed(2)}`,          cor: 'text-[#f97316]' },
            { label: 'Impressões', value: parseInt(metricas.impressoes || 0).toLocaleString('pt-BR'), cor: 'text-white'      },
            { label: 'Cliques',    value: parseInt(metricas.cliques || 0).toLocaleString('pt-BR'),    cor: 'text-white'      },
            { label: 'CTR',        value: `${parseFloat(metricas.ctr || 0).toFixed(2)}%`,             cor: parseFloat(metricas.ctr || 0) >= 1.5 ? 'text-green-400' : parseFloat(metricas.ctr || 0) >= 0.8 ? 'text-yellow-400' : 'text-red-400' },
          ].map(m => (
            <div key={m.label} className="p-2 rounded-lg bg-[#0a0a0a] border border-[#1a1a1a] text-center">
              <div className={`text-xs font-bold ${m.cor}`}>{m.value}</div>
              <div className="text-[9px] text-[#444] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orçamento inline */}
      <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a]">
        <span className="text-xs text-[#555]">💰</span>
        {editandoOrc ? (
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-[#888]">R$</span>
            <input
              type="number" value={novoOrc} onChange={e => setNovoOrc(e.target.value)}
              placeholder="20" min="5"
              className="w-20 bg-[#1a1a1a] border border-[#f97316] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            />
            <span className="text-xs text-[#555]">/dia</span>
            <button onClick={salvarOrcamento} disabled={loadingAcao === 'orc'}
              className="text-[10px] text-green-400 hover:text-green-300 font-bold px-2">
              {loadingAcao === 'orc' ? '...' : 'Salvar'}
            </button>
            <button onClick={() => setEditandoOrc(false)} className="text-[10px] text-[#555] hover:text-white">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-bold text-white">{orcAtual}</span>
            <button onClick={() => { setEditandoOrc(true); setNovoOrc('') }}
              className="text-[10px] text-[#f97316] hover:underline ml-auto">Alterar</button>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        {campanha.status === 'ACTIVE' ? (
          <button onClick={() => acao('pausar')} disabled={!!loadingAcao}
            className="flex-1 py-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/20 transition disabled:opacity-50">
            {loadingAcao === 'pausar' ? '⏳ ...' : '⏸️ Pausar'}
          </button>
        ) : (
          <button onClick={() => acao('ativar')} disabled={!!loadingAcao}
            className="flex-1 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition disabled:opacity-50">
            {loadingAcao === 'ativar' ? '⏳ ...' : '▶️ Ativar'}
          </button>
        )}
        <button
          onClick={() => { if (confirm('Excluir esta campanha? Isso é irreversível.')) acao('excluir') }}
          disabled={!!loadingAcao}
          className="py-1.5 px-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-xs hover:bg-red-500/15 transition disabled:opacity-50"
        >
          {loadingAcao === 'excluir' ? '⏳' : '🗑️'}
        </button>
      </div>
    </div>
  )
}

// ─── Componente de Step Indicator ─────────────────────────────────────────────

function StepIndicator({ step, total, labels }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const done    = n < step
        const current = n === step
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done    ? 'bg-[#f97316] border-[#f97316] text-black' :
                current ? 'bg-[#f97316]/20 border-[#f97316] text-[#f97316]' :
                          'bg-[#111] border-[#333] text-[#555]'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${current ? 'text-[#f97316]' : done ? 'text-[#888]' : 'text-[#444]'}`}>
                {labels[i]}
              </span>
            </div>
            {i < total - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-[#f97316]' : 'bg-[#222]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function AnunciosPage() {
  // ── Estado Global ──
  const [abaAtiva, setAbaAtiva]         = useState('campanhas')
  const [setupPendente, setSetupPend]   = useState(false)
  const [toast, setToast]               = useState(null)

  // ── Campanhas ──
  const [campanhas, setCampanhas]       = useState([])
  const [metricasMap, setMetricasMap]   = useState({})
  const [loadingCamp, setLoadingCamp]   = useState(false)

  // ── Nova Campanha: Steps ──
  const [stepAtual, setStepAtual]       = useState(1) // 1..4

  // Step 1 – Imagem
  const [imageUrl, setImageUrl]         = useState('')
  const [imagePreview, setPreview]      = useState(null)
  const [uploading, setUploading]       = useState(false)
  const [dragOver, setDragOver]         = useState(false)
  const fileRef                         = useRef()

  // Step 2 – Texto
  const [tipoIA, setTipoIA]             = useState('SMASH')
  const [titulo, setTitulo]             = useState('')
  const [corpo, setCorpo]               = useState('')
  const [gerando, setGerando]           = useState(false)

  // Step 3 – Orçamento
  const [orcamento, setOrcamento]       = useState(2000)
  const [duracao, setDuracao]           = useState(5)

  // Step 4 – Criar
  const [criando, setCriando]           = useState(false)
  const [campanhaCriada, setCriada]     = useState(null)

  // ── Performance ──
  const [relatorio, setRelatorio]       = useState(null)
  const [loadingRel, setLoadingRel]     = useState(false)
  const [diasRel, setDiasRel]           = useState(30)
  const [analiseIA, setAnaliseIA]       = useState(null)
  const [expandirIA, setExpandirIA]     = useState(true)

  // ─────────────────────────────────────────────────────────────────────────────

  function triggerSetup() {
    setSetupPend(true)
  }

  const carregarCampanhas = useCallback(async () => {
    setLoadingCamp(true)
    try {
      const [dataCamp, dataRel] = await Promise.allSettled([
        api.get('/ads/campanhas'),
        api.get('/ads/relatorio?dias=90'),
      ])
      if (dataCamp.status === 'fulfilled') {
        setCampanhas(dataCamp.value.campanhas || [])
      }
      if (dataRel.status === 'fulfilled') {
        const map = {}
        for (const c of (dataRel.value.campanhas || [])) map[c.id] = c
        setMetricasMap(map)
      }
    } catch (e) {
      if (isAuthError(e)) triggerSetup()
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingCamp(false) }
  }, [])

  useEffect(() => {
    if (abaAtiva === 'campanhas') carregarCampanhas()
  }, [abaAtiva, carregarCampanhas])

  useEffect(() => {
    if (abaAtiva === 'performance') carregarRelatorio()
  }, [abaAtiva])

  // ── Upload ──
  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    try {
      const data = await uploadCloudinary(file)
      setImageUrl(data.secure_url)
      setPreview(data.secure_url)
      setToast({ message: 'Imagem carregada!', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setUploading(false) }
  }

  function handleFileInput(e) {
    handleFile(e.target.files?.[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  // ── Gerar Texto ──
  async function gerarTexto() {
    setGerando(true)
    try {
      const data = await api.post('/ads/gerar-texto', { tipo: tipoIA })
      setTitulo(data.titulo || '')
      setCorpo(data.corpo || '')
      setToast({ message: 'Texto gerado pela IA!', type: 'success' })
    } catch (err) {
      if (isAuthError(err)) triggerSetup()
      setToast({ message: err.message, type: 'error' })
    } finally { setGerando(false) }
  }

  // ── Criar Campanha ──
  async function criarCampanha() {
    if (!imageUrl)         { setToast({ message: 'Envie a imagem primeiro!', type: 'error' }); return }
    if (!titulo || !corpo) { setToast({ message: 'Preencha título e corpo.', type: 'error' }); return }
    setCriando(true); setCriada(null)
    try {
      const data = await api.post('/ads', {
        imageUrl,
        titulo,
        corpo,
        orcamentoDiario:     orcamento,
        duracaoDias:         duracao,
        registrarFinanceiro: true,
      })
      setCriada(data.resultado)
      setToast({ message: 'Campanha criada com sucesso!', type: 'success' })
    } catch (e) {
      if (isAuthError(e)) triggerSetup()
      setToast({ message: e.message, type: 'error' })
    } finally { setCriando(false) }
  }

  // ── Relatório ──
  async function carregarRelatorio() {
    setLoadingRel(true); setRelatorio(null); setAnaliseIA(null)
    try {
      const data = await api.get(`/ads/relatorio?dias=${diasRel}`)
      setRelatorio(data.dados || [])
      setAnaliseIA(data.analiseIA || null)
    } catch (e) {
      if (isAuthError(e)) triggerSetup()
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingRel(false) }
  }

  function resetarCriacao() {
    setStepAtual(1)
    setImageUrl(''); setPreview(null)
    setTitulo(''); setCorpo(''); setTipoIA('SMASH')
    setOrcamento(2000); setDuracao(5)
    setCriada(null)
  }

  // ── Métricas agregadas ──
  const metricas = (relatorio || []).reduce((acc, c) => ({
    gasto:      acc.gasto      + parseFloat(c.spend        || 0),
    impressoes: acc.impressoes + parseInt(c.impressions     || 0),
    cliques:    acc.cliques    + parseInt(c.clicks          || 0),
    ctr:        acc.ctrCount > 0
      ? (acc.ctrSum + parseFloat(c.ctr || 0)) / (acc.ctrCount + 1)
      : parseFloat(c.ctr || 0),
    ctrSum:     acc.ctrSum  + parseFloat(c.ctr  || 0),
    ctrCount:   acc.ctrCount + 1,
  }), { gasto: 0, impressoes: 0, cliques: 0, ctr: 0, ctrSum: 0, ctrCount: 0 })

  const campAtivas  = campanhas.filter(c => c.status === 'ACTIVE').length
  const campPausadas = campanhas.filter(c => c.status === 'PAUSED').length

  const alcanceEst = ALCANCE_MAP[orcamento] || { min: 0, max: 0 }
  const totalCusto = (orcamento / 100) * duracao

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📣" title="Gestor de Tráfego Pago" description="Meta Ads — Campanhas e Performance">
        <a
          href="https://business.facebook.com/adsmanager"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#666] hover:text-white border border-[#333] rounded-lg px-3 py-2 hover:border-[#555] transition-colors"
        >
          📊 Meta Ads ↗
        </a>
      </PageHeader>

      {/* Setup Guide — exibido quando há erro de permissão */}
      {setupPendente && <SetupGuideCard />}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 p-1 bg-[#0f0f0f] rounded-xl border border-[#1e1e1e]">
        {[
          { id: 'campanhas',  label: '📊 Campanhas'       },
          { id: 'nova',       label: '➕ Nova Campanha'    },
          { id: 'performance',label: '📈 Performance'      },
        ].map(a => (
          <button key={a.id} onClick={() => setAbaAtiva(a.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              abaAtiva === a.id
                ? 'bg-[#f97316] text-black shadow-sm'
                : 'text-[#666] hover:text-white'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          ABA: CAMPANHAS
      ════════════════════════════════════════════════════════ */}
      {abaAtiva === 'campanhas' && (
        <div>
          {/* Header cards de status */}
          {!loadingCamp && campanhas.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Ativas',   value: campAtivas,              cor: 'text-green-400'  },
                { label: 'Pausadas', value: campPausadas,             cor: 'text-yellow-400' },
                { label: 'Total',    value: campanhas.length,         cor: 'text-white'      },
              ].map(m => (
                <div key={m.label} className="p-3 rounded-xl border border-[#1e1e1e] bg-[#111] text-center">
                  <div className={`text-xl font-black ${m.cor}`}>{m.value}</div>
                  <div className="text-[10px] text-[#555] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Header de ações */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#555]">
              {campanhas.length > 0
                ? `${campanhas.length} campanha${campanhas.length > 1 ? 's' : ''} encontrada${campanhas.length > 1 ? 's' : ''}`
                : 'Campanhas da sua conta Meta Ads'}
            </p>
            <Button onClick={carregarCampanhas} loading={loadingCamp} variant="secondary" size="sm">
              🔄 Atualizar
            </Button>
          </div>

          {/* Estados */}
          {loadingCamp ? (
            <div className="text-center py-16 text-[#444]">
              <p className="text-3xl mb-3 animate-pulse">⏳</p>
              <p className="text-sm">Carregando campanhas...</p>
            </div>
          ) : campanhas.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-sm font-semibold text-white mb-1">Nenhuma campanha ativa</p>
              <p className="text-xs text-[#555] mb-4">Crie sua primeira campanha e comece a impactar clientes</p>
              <button
                onClick={() => setAbaAtiva('nova')}
                className="text-xs font-semibold text-[#f97316] hover:underline"
              >
                ➕ Criar primeira campanha →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campanhas.map(c => (
                <CampanhaCard
                  key={c.id}
                  campanha={c}
                  metricas={metricasMap[c.id] || null}
                  onAtualizar={carregarCampanhas}
                  onSetupError={triggerSetup}
                />
              ))}
            </div>
          )}

          {/* Links rápidos */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <a
              href="https://business.facebook.com/billing/payment_methods"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-[#1e1e1e] bg-[#111] hover:border-[#333] transition-colors group"
            >
              <span className="text-xl">💳</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white group-hover:underline truncate">Adicionar Saldo</p>
                <p className="text-[10px] text-[#555]">Meta Business Manager</p>
              </div>
              <span className="ml-auto text-[#555] text-xs shrink-0">↗</span>
            </a>
            <a
              href="https://business.facebook.com/adsmanager"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-[#1e1e1e] bg-[#111] hover:border-[#333] transition-colors group"
            >
              <span className="text-xl">📊</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white group-hover:underline truncate">Gerenciador Meta</p>
                <p className="text-[10px] text-[#555]">Ver tudo no Meta Ads</p>
              </div>
              <span className="ml-auto text-[#555] text-xs shrink-0">↗</span>
            </a>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ABA: NOVA CAMPANHA
      ════════════════════════════════════════════════════════ */}
      {abaAtiva === 'nova' && (
        <div>
          {campanhaCriada ? (
            /* ── Sucesso ── */
            <div className="text-center py-10 rounded-xl border border-green-500/30 bg-green-500/5">
              <p className="text-4xl mb-3">🎉</p>
              <h3 className="text-lg font-bold text-white mb-1">Campanha criada!</h3>
              <p className="text-sm text-[#888] mb-1">ID: <span className="font-mono text-[#aaa]">{campanhaCriada.campanhaId || campanhaCriada.id}</span></p>
              {campanhaCriada.adSetId && (
                <p className="text-xs text-[#555] mb-4">AdSet: <span className="font-mono">{campanhaCriada.adSetId}</span></p>
              )}
              <div className="flex gap-3 justify-center mt-4">
                <Button onClick={() => { setAbaAtiva('campanhas'); resetarCriacao() }} variant="secondary" size="sm">
                  📊 Ver campanhas
                </Button>
                <Button onClick={resetarCriacao} variant="ghost" size="sm">
                  ➕ Nova campanha
                </Button>
              </div>
            </div>
          ) : (
            <>
              <StepIndicator
                step={stepAtual}
                total={4}
                labels={['Imagem', 'Texto', 'Orçamento', 'Criar']}
              />

              {/* ── Step 1: Imagem ── */}
              <div className={`rounded-xl border mb-3 overflow-hidden transition-all ${stepAtual === 1 ? 'border-[#f97316]/40' : 'border-[#1e1e1e]'}`}>
                <button
                  onClick={() => setStepAtual(1)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#111] transition-colors"
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    imageUrl ? 'bg-[#f97316] text-black' : stepAtual === 1 ? 'bg-[#f97316]/20 border-2 border-[#f97316] text-[#f97316]' : 'bg-[#1a1a1a] border border-[#333] text-[#555]'
                  }`}>
                    {imageUrl ? '✓' : '1'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${stepAtual === 1 ? 'text-white' : 'text-[#777]'}`}>
                      Imagem do anúncio
                    </p>
                    {imageUrl && <p className="text-[10px] text-green-400">Imagem carregada ✓</p>}
                  </div>
                  <span className="text-[#555] text-xs">{stepAtual === 1 ? '▲' : '▼'}</span>
                </button>

                {stepAtual === 1 && (
                  <div className="px-4 pb-4">
                    {imagePreview ? (
                      <div className="relative">
                        <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-cover rounded-lg mb-3" />
                        <button
                          onClick={() => { setImageUrl(''); setPreview(null) }}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
                        >
                          ✕
                        </button>
                        <Button onClick={() => setStepAtual(2)} variant="primary" className="w-full">
                          Próximo: Texto →
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                          dragOver
                            ? 'border-[#f97316] bg-[#f97316]/10'
                            : 'border-[#333] hover:border-[#f97316]/50 hover:bg-[#f97316]/5'
                        }`}
                      >
                        {uploading ? (
                          <div>
                            <p className="text-2xl mb-2 animate-pulse">⏳</p>
                            <p className="text-sm text-[#888]">Enviando imagem...</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-3xl mb-2">📸</p>
                            <p className="text-sm font-semibold text-white mb-1">Arraste ou clique para enviar</p>
                            <p className="text-xs text-[#555]">JPG, PNG ou WEBP · Máx. 10MB</p>
                          </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Step 2: Texto ── */}
              <div className={`rounded-xl border mb-3 overflow-hidden transition-all ${stepAtual === 2 ? 'border-[#f97316]/40' : 'border-[#1e1e1e]'}`}>
                <button
                  onClick={() => setStepAtual(2)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#111] transition-colors"
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    (titulo && corpo) ? 'bg-[#f97316] text-black' : stepAtual === 2 ? 'bg-[#f97316]/20 border-2 border-[#f97316] text-[#f97316]' : 'bg-[#1a1a1a] border border-[#333] text-[#555]'
                  }`}>
                    {(titulo && corpo) ? '✓' : '2'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${stepAtual === 2 ? 'text-white' : 'text-[#777]'}`}>
                      Texto com IA
                    </p>
                    {titulo && <p className="text-[10px] text-[#888] truncate">{titulo}</p>}
                  </div>
                  <span className="text-[#555] text-xs">{stepAtual === 2 ? '▲' : '▼'}</span>
                </button>

                {stepAtual === 2 && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* Seletor de tipo */}
                    <div>
                      <p className="text-xs text-[#555] mb-2">Tipo de anúncio</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TIPOS_IA.map(t => (
                          <button key={t.id} onClick={() => setTipoIA(t.id)}
                            className={`text-xs px-3 py-1.5 rounded-full transition-all border ${
                              tipoIA === t.id
                                ? 'bg-[#f97316] border-[#f97316] text-black font-bold'
                                : 'bg-[#1a1a1a] border-[#333] text-[#666] hover:text-white hover:border-[#555]'
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button onClick={gerarTexto} loading={gerando} variant="secondary" className="w-full">
                      ✨ Gerar texto com IA
                    </Button>

                    {/* Campos editáveis */}
                    <div>
                      <label className="text-[10px] text-[#555] uppercase tracking-wide block mb-1">Título</label>
                      <input
                        type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                        placeholder="Ex: O Smash mais perfeito de Fortaleza 🍔"
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#f97316]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#555] uppercase tracking-wide block mb-1">Corpo / Legenda</label>
                      <textarea
                        value={corpo} onChange={e => setCorpo(e.target.value)} rows={4}
                        placeholder="Escreva a legenda do anúncio ou gere com IA..."
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#f97316] resize-none"
                      />
                    </div>

                    {/* Preview do anúncio */}
                    {(titulo || corpo || imagePreview) && (
                      <div className="rounded-xl border border-[#333] bg-[#0f0f0f] p-3">
                        <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Preview do anúncio</p>
                        <div className="rounded-lg overflow-hidden border border-[#222]">
                          {imagePreview && (
                            <img src={imagePreview} alt="" className="w-full max-h-36 object-cover" />
                          )}
                          <div className="p-3 bg-[#1a1a1a]">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[10px]">🍔</div>
                              <div>
                                <p className="text-[10px] font-bold text-white">bruthus_burger</p>
                                <p className="text-[9px] text-[#555]">Anúncio patrocinado</p>
                              </div>
                            </div>
                            {titulo && <p className="text-xs font-bold text-white mb-1">{titulo}</p>}
                            {corpo && <p className="text-[11px] text-[#888] leading-relaxed line-clamp-3">{corpo}</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => setStepAtual(3)}
                      disabled={!titulo || !corpo}
                      variant="primary" className="w-full"
                    >
                      Próximo: Orçamento →
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Step 3: Orçamento ── */}
              <div className={`rounded-xl border mb-3 overflow-hidden transition-all ${stepAtual === 3 ? 'border-[#f97316]/40' : 'border-[#1e1e1e]'}`}>
                <button
                  onClick={() => setStepAtual(3)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#111] transition-colors"
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    stepAtual > 3 ? 'bg-[#f97316] text-black' : stepAtual === 3 ? 'bg-[#f97316]/20 border-2 border-[#f97316] text-[#f97316]' : 'bg-[#1a1a1a] border border-[#333] text-[#555]'
                  }`}>
                    {stepAtual > 3 ? '✓' : '3'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${stepAtual === 3 ? 'text-white' : 'text-[#777]'}`}>
                      Orçamento e duração
                    </p>
                    {stepAtual !== 3 && (
                      <p className="text-[10px] text-[#888]">
                        R${(orcamento / 100).toFixed(0)}/dia · {duracao} dias · Total: R${totalCusto.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <span className="text-[#555] text-xs">{stepAtual === 3 ? '▲' : '▼'}</span>
                </button>

                {stepAtual === 3 && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* Orçamento diário */}
                    <div>
                      <p className="text-xs text-[#555] mb-2">Orçamento diário</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ORCAMENTOS.map(o => (
                          <button
                            key={o.valor}
                            onClick={() => setOrcamento(o.valor)}
                            className={`p-3 rounded-xl border text-center relative transition-all ${
                              orcamento === o.valor
                                ? 'border-[#f97316] bg-[#f97316]/10'
                                : 'border-[#222] bg-[#1a1a1a] hover:border-[#333]'
                            }`}
                          >
                            {o.desc === 'Recomendado' && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-[#f97316] text-black px-2 rounded-full font-bold whitespace-nowrap">
                                Recomendado
                              </span>
                            )}
                            <div className={`text-sm font-bold ${orcamento === o.valor ? 'text-[#f97316]' : 'text-white'}`}>
                              {o.label}
                            </div>
                            <div className="text-[10px] text-[#555] mt-0.5">{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duração */}
                    <div>
                      <p className="text-xs text-[#555] mb-2">Duração</p>
                      <div className="grid grid-cols-4 gap-2">
                        {DURACOES.map(d => (
                          <button
                            key={d.dias}
                            onClick={() => setDuracao(d.dias)}
                            className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                              duracao === d.dias
                                ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                                : 'border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-white'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Estimativas */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Custo total',   value: `R$${totalCusto.toFixed(2)}`,                          cor: 'text-[#f97316]' },
                        { label: 'Alcance est.',  value: `${(alcanceEst.min/1000).toFixed(1)}k–${(alcanceEst.max/1000).toFixed(1)}k`, cor: 'text-white' },
                        { label: 'Duração',       value: `${duracao} dias`,                                     cor: 'text-white' },
                      ].map(m => (
                        <div key={m.label} className="p-3 rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] text-center">
                          <div className={`text-sm font-bold ${m.cor}`}>{m.value}</div>
                          <div className="text-[10px] text-[#555] mt-0.5">{m.label}</div>
                        </div>
                      ))}
                    </div>

                    <Button onClick={() => setStepAtual(4)} variant="primary" className="w-full">
                      Próximo: Criar →
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Step 4: Análise + Criar ── */}
              <div className={`rounded-xl border mb-3 overflow-hidden transition-all ${stepAtual === 4 ? 'border-[#f97316]/40' : 'border-[#1e1e1e]'}`}>
                <button
                  onClick={() => setStepAtual(4)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#111] transition-colors"
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    stepAtual === 4 ? 'bg-[#f97316]/20 border-2 border-[#f97316] text-[#f97316]' : 'bg-[#1a1a1a] border border-[#333] text-[#555]'
                  }`}>
                    4
                  </span>
                  <p className={`text-sm font-semibold ${stepAtual === 4 ? 'text-white' : 'text-[#777]'}`}>
                    Criar campanha
                  </p>
                  <span className="text-[#555] text-xs ml-auto">{stepAtual === 4 ? '▲' : '▼'}</span>
                </button>

                {stepAtual === 4 && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* Resumo da campanha */}
                    <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] space-y-1.5">
                      <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Resumo da campanha</p>
                      {[
                        ['Tipo',          TIPOS_IA.find(t => t.id === tipoIA)?.label || tipoIA],
                        ['Orçamento',     `R$${(orcamento / 100).toFixed(0)}/dia por ${duracao} dias`],
                        ['Total',         `R$${totalCusto.toFixed(2)}`],
                        ['Alcance est.',  `${(alcanceEst.min/1000).toFixed(1)}k–${(alcanceEst.max/1000).toFixed(1)}k pessoas`],
                        ['Título',        titulo || '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span className="text-xs text-[#555]">{k}:</span>
                          <span className="text-xs text-white text-right truncate max-w-[60%]">{v}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={criarCampanha}
                      loading={criando}
                      disabled={!imageUrl || !titulo || !corpo}
                      variant="primary"
                      size="lg"
                      className="w-full"
                    >
                      📣 Criar Campanha
                    </Button>

                    {!imageUrl && (
                      <p className="text-[11px] text-yellow-500 text-center">
                        ⚠️ Volte ao Step 1 e envie a imagem
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ABA: PERFORMANCE
      ════════════════════════════════════════════════════════ */}
      {abaAtiva === 'performance' && (
        <div>
          {/* Filtros */}
          <div className="flex items-center gap-3 mb-5">
            <select
              value={diasRel} onChange={e => setDiasRel(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Máximo (90 dias)</option>
            </select>
            <Button onClick={carregarRelatorio} loading={loadingRel} variant="secondary">
              📊 Carregar dados
            </Button>
          </div>

          {/* Estado vazio */}
          {!relatorio && !loadingRel && (
            <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111] text-[#444]">
              <p className="text-3xl mb-3">📈</p>
              <p className="text-sm font-semibold text-white mb-1">Relatório de performance</p>
              <p className="text-xs text-[#555]">Selecione o período e clique em Carregar dados</p>
            </div>
          )}

          {/* Loading */}
          {loadingRel && (
            <div className="text-center py-16 text-[#444]">
              <p className="text-3xl mb-3 animate-pulse">⏳</p>
              <p className="text-sm">Carregando relatório...</p>
            </div>
          )}

          {/* Dados carregados */}
          {relatorio && !loadingRel && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total gasto',      value: fmtBrl(metricas.gasto),                     emoji: '💰' },
                  { label: 'Impressões',        value: fmt(metricas.impressoes),                    emoji: '👁️' },
                  { label: 'Cliques',           value: fmt(metricas.cliques),                       emoji: '🖱️' },
                  { label: 'CTR médio',         value: `${metricas.ctr.toFixed(2)}%`,               emoji: '📈' },
                  { label: 'CPC médio',         value: metricas.cliques > 0 ? fmtBrl(metricas.gasto / metricas.cliques) : '—', emoji: '💵' },
                  { label: 'Campanhas',         value: relatorio.length.toString(),                 emoji: '📣' },
                ].map(m => (
                  <div key={m.label} className="p-4 rounded-xl border border-[#1e1e1e] bg-[#111] text-center">
                    <div className="text-xl mb-1">{m.emoji}</div>
                    <div className="text-lg font-black text-white">{m.value}</div>
                    <div className="text-[10px] text-[#555] mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Tabela por campanha */}
              {relatorio.length === 0 ? (
                <p className="text-sm text-[#555] text-center py-8">Nenhum dado para o período selecionado.</p>
              ) : (
                <div>
                  <p className="text-xs text-[#555] mb-3 uppercase tracking-wide font-semibold">Por campanha</p>
                  <div className="space-y-3">
                    {relatorio.map((camp, i) => {
                      const gasto   = parseFloat(camp.gasto || camp.spend || 0)
                      const cliques = parseInt(camp.cliques || camp.clicks || 0)
                      const impr    = parseInt(camp.impressoes || camp.impressions || 0)
                      const ctr     = parseFloat(camp.ctr || 0)
                      const cpc     = cliques > 0 ? (gasto / cliques).toFixed(2) : null
                      const alcance = parseInt(camp.alcance || camp.reach || 0)
                      const freq    = parseFloat(camp.frequencia || camp.frequency || 0)

                      // avaliação de CTR
                      const ctrCor  = ctr >= 1.5 ? 'text-green-400' : ctr >= 0.8 ? 'text-yellow-400' : 'text-red-400'
                      const cpcCor  = !cpc ? 'text-white' : parseFloat(cpc) <= 1.5 ? 'text-green-400' : parseFloat(cpc) <= 2.5 ? 'text-yellow-400' : 'text-red-400'

                      // campanha correspondente na lista (para ações)
                      const campObj = campanhas.find(c => c.id === camp.id)

                      return (
                        <div key={i} className="p-4 rounded-xl bg-[#111] border border-[#222] hover:border-[#333] transition-colors">
                          {/* Nome + status + ações */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{camp.nome || camp.campaign_name}</p>
                              {camp.status && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border mt-1 inline-block ${(STATUS_CONFIG[camp.status] || STATUS_CONFIG.PAUSED).cor}`}>
                                  {(STATUS_CONFIG[camp.status] || STATUS_CONFIG.PAUSED).label}
                                </span>
                              )}
                            </div>
                            {/* Ações rápidas */}
                            {campObj && (
                              <div className="flex gap-1.5 shrink-0">
                                {campObj.status === 'ACTIVE' ? (
                                  <button
                                    onClick={async () => { try { await api.post(`/ads/${campObj.id}/pausar`); carregarRelatorio(); carregarCampanhas() } catch(e) { setToast({ message: e.message, type: 'error' }) } }}
                                    className="text-[10px] px-2 py-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                  >⏸️ Pausar</button>
                                ) : campObj.status === 'PAUSED' ? (
                                  <button
                                    onClick={async () => { try { await api.post(`/ads/${campObj.id}/ativar`); carregarRelatorio(); carregarCampanhas() } catch(e) { setToast({ message: e.message, type: 'error' }) } }}
                                    className="text-[10px] px-2 py-1 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                                  >▶️ Ativar</button>
                                ) : null}
                              </div>
                            )}
                          </div>

                          {/* Métricas */}
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                            {[
                              ['👁️', 'Impressões', fmt(impr),              'text-white'  ],
                              ['👥', 'Alcance',    fmt(alcance),            'text-white'  ],
                              ['🔁', 'Frequência', freq > 0 ? freq.toFixed(1) + 'x' : '—', freq >= 1.5 && freq <= 3 ? 'text-green-400' : freq > 3 ? 'text-red-400' : 'text-yellow-400'],
                              ['🖱️', 'Cliques',    fmt(cliques),            'text-white'  ],
                              ['📈', 'CTR',        `${ctr.toFixed(2)}%`,   ctrCor        ],
                              ['💰', 'Gasto',      fmtBrl(gasto),          'text-[#f97316]'],
                            ].map(([emoji, label, value, cor]) => (
                              <div key={label} className="p-2 rounded-lg bg-[#0f0f0f]">
                                <div className="text-sm">{emoji}</div>
                                <div className="text-[9px] text-[#555] mt-0.5">{label}</div>
                                <div className={`text-xs font-bold mt-0.5 ${cor}`}>{value}</div>
                              </div>
                            ))}
                          </div>

                          {/* Benchmarks */}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {ctr > 0 && (
                              <span className={`text-[9px] px-2 py-0.5 rounded-full border ${ctr >= 1.5 ? 'border-green-500/30 bg-green-500/10 text-green-400' : ctr >= 0.8 ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                                CTR {ctr >= 1.5 ? '✓ Bom' : ctr >= 0.8 ? '~ Regular' : '✗ Baixo'} (ideal ≥1.5%)
                              </span>
                            )}
                            {cpc && (
                              <span className={`text-[9px] px-2 py-0.5 rounded-full border ${cpcCor === 'text-green-400' ? 'border-green-500/30 bg-green-500/10 text-green-400' : cpcCor === 'text-yellow-400' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                                CPC {parseFloat(cpc) <= 1.5 ? '✓ Bom' : parseFloat(cpc) <= 2.5 ? '~ Regular' : '✗ Alto'} (ideal ≤R$1,50)
                              </span>
                            )}
                            {freq > 0 && (
                              <span className={`text-[9px] px-2 py-0.5 rounded-full border ${freq >= 1.5 && freq <= 3 ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                                Freq. {freq >= 1.5 && freq <= 3 ? '✓ Ideal' : freq < 1.5 ? '~ Baixa' : '⚠ Alta'} (ideal 1.5–3x)
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Análise IA expansível */}
              {analiseIA && (
                <div className="rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
                  <button
                    onClick={() => setExpandirIA(v => !v)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#1a1a1a] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🤖</span>
                      <span className="text-sm font-semibold text-white">Análise IA</span>
                    </div>
                    <span className="text-[#555] text-xs">{expandirIA ? '▲ Recolher' : '▼ Expandir'}</span>
                  </button>
                  {expandirIA && (
                    <div className="px-4 pb-4">
                      <div className="text-xs text-[#aaa] leading-relaxed whitespace-pre-wrap bg-[#0f0f0f] rounded-lg p-3 border border-[#1e1e1e]">
                        {typeof analiseIA === 'string' ? analiseIA : JSON.stringify(analiseIA, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Export */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    const csv = [
                      'Campanha,Impressões,Cliques,CTR,Gasto,CPC',
                      ...(relatorio || []).map(c => {
                        const g = parseFloat(c.spend || 0)
                        const cl = parseInt(c.clicks || 0)
                        return [
                          `"${c.campaign_name}"`,
                          parseInt(c.impressions || 0),
                          cl,
                          `${parseFloat(c.ctr || 0).toFixed(2)}%`,
                          `R$${g.toFixed(2)}`,
                          cl > 0 ? `R$${(g / cl).toFixed(2)}` : '—',
                        ].join(',')
                      }),
                    ].join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url  = URL.createObjectURL(blob)
                    const a    = document.createElement('a')
                    a.href = url; a.download = `relatorio-ads-${diasRel}dias.csv`; a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex items-center gap-2 text-xs text-[#666] hover:text-white border border-[#333] rounded-lg px-3 py-2 hover:border-[#555] transition-colors"
                >
                  ⬇️ Exportar CSV
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
