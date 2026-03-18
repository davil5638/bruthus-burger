'use client'
import { useState, useRef, useEffect } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    || 'duchjjeaw'
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'bruthus_unsigned'

const ORCAMENTOS = [
  { valor: 1000, label: 'R$10/dia', desc: 'Início'      },
  { valor: 2000, label: 'R$20/dia', desc: 'Recomendado' },
  { valor: 3000, label: 'R$30/dia', desc: 'Mais alcance'},
  { valor: 5000, label: 'R$50/dia', desc: 'Agressivo'   },
]

const TIPOS_IA = [
  { id: 'VENDAS',  label: '💰 Vendas'       },
  { id: 'SMASH',   label: '🍔 Smash'        },
  { id: 'NORMAL',  label: '🍔 Normal 150g'  },
  { id: 'COMBO',   label: '🍟 Combo'        },
  { id: 'FAMILIA', label: '❤️ Família'      },
  { id: 'QUINTA',  label: '🎉 Quinta'       },
  { id: 'SEXTA',   label: '🔥 Sexta'        },
]

const STATUS_CONFIG = {
  ACTIVE:   { label: 'Ativa',    cor: 'bg-green-500/20 text-green-400 border-green-500/30'  },
  PAUSED:   { label: 'Pausada',  cor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'},
  DELETED:  { label: 'Excluída', cor: 'bg-red-500/20 text-red-400 border-red-500/30'         },
  ARCHIVED: { label: 'Arquivada',cor: 'bg-[#222] text-[#555] border-[#333]'                 },
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

// ─── Card de campanha ───
function CampanhaCard({ campanha, onAtualizar }) {
  const [loadingAcao, setLoadingAcao] = useState(null)
  const [editandoOrc, setEditandoOrc] = useState(false)
  const [novoOrc, setNovoOrc]         = useState('')
  const [toast, setToast]             = useState(null)

  const statusCfg = STATUS_CONFIG[campanha.status] || STATUS_CONFIG.PAUSED
  const adSet     = campanha.adSets?.[0]
  const orcAtual  = adSet ? `R$${(parseInt(adSet.daily_budget || 0) / 100).toFixed(2)}/dia` : '—'

  async function acao(tipo) {
    setLoadingAcao(tipo)
    try {
      if (tipo === 'pausar')  await api.post(`/ads/${campanha.id}/pausar`)
      if (tipo === 'ativar')  await api.post(`/ads/${campanha.id}/ativar`)
      if (tipo === 'excluir') await api.delete(`/ads/${campanha.id}`)
      setToast({ message: `Campanha ${tipo === 'excluir' ? 'excluída' : tipo + 'da'}!`, type: 'success' })
      onAtualizar()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingAcao(null) }
  }

  async function salvarOrcamento() {
    if (!adSet?.id || !novoOrc) return
    setLoadingAcao('orc')
    try {
      const centavos = Math.round(parseFloat(novoOrc) * 100)
      await api.patch(`/ads/adset/${adSet.id}/orcamento`, { orcamentoDiario: centavos })
      setToast({ message: `Orçamento atualizado: R$${novoOrc}/dia`, type: 'success' })
      setEditandoOrc(false)
      onAtualizar()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingAcao(null) }
  }

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{campanha.name}</p>
          <p className="text-[10px] text-[#555] font-mono mt-0.5">{campanha.id}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${statusCfg.cor}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Orçamento */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#555]">💰 Orçamento:</span>
        {editandoOrc ? (
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-[#888]">R$</span>
            <input type="number" value={novoOrc} onChange={e => setNovoOrc(e.target.value)}
              placeholder="20" min="5"
              className="w-20 bg-[#1a1a1a] border border-[#f97316] rounded px-2 py-0.5 text-xs text-white focus:outline-none" />
            <span className="text-xs text-[#555]">/dia</span>
            <button onClick={salvarOrcamento} disabled={loadingAcao === 'orc'}
              className="text-[10px] text-green-400 hover:text-green-300 font-bold px-2">
              {loadingAcao === 'orc' ? '...' : 'Salvar'}
            </button>
            <button onClick={() => setEditandoOrc(false)} className="text-[10px] text-[#555] hover:text-white">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">{orcAtual}</span>
            {adSet && (
              <button onClick={() => { setEditandoOrc(true); setNovoOrc('') }}
                className="text-[10px] text-[#f97316] hover:underline">Alterar</button>
            )}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        {campanha.status === 'ACTIVE' ? (
          <button onClick={() => acao('pausar')} disabled={!!loadingAcao}
            className="flex-1 py-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/20 transition disabled:opacity-50">
            {loadingAcao === 'pausar' ? '...' : '⏸️ Pausar'}
          </button>
        ) : (
          <button onClick={() => acao('ativar')} disabled={!!loadingAcao}
            className="flex-1 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition disabled:opacity-50">
            {loadingAcao === 'ativar' ? '...' : '▶️ Ativar'}
          </button>
        )}
        <button onClick={() => { if (confirm('Excluir esta campanha? Isso é irreversível.')) acao('excluir') }}
          disabled={!!loadingAcao}
          className="py-1.5 px-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-xs hover:bg-red-500/15 transition disabled:opacity-50">
          🗑️
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ───
export default function AnunciosPage() {
  // Imagem
  const [imageUrl, setImageUrl]    = useState('')
  const [imagePreview, setPreview] = useState(null)
  const [uploading, setUploading]  = useState(false)

  // Texto
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo]   = useState('')
  const [tipoIA, setTipoIA] = useState('SMASH')
  const [gerando, setGerando] = useState(false)

  // Campanha
  const [orcamento, setOrcamento] = useState(2000)
  const [loading, setLoading]     = useState(false)
  const [resultado, setResultado] = useState(null)

  // Análise pré-criação
  const [analise, setAnalise]         = useState(null)
  const [analisando, setAnalisando]   = useState(false)

  // Campanhas existentes
  const [campanhas, setCampanhas]       = useState([])
  const [loadingCamp, setLoadingCamp]   = useState(false)
  const [abaAtiva, setAbaAtiva]         = useState('criar') // 'criar' | 'impulsionar' | 'gerenciar'

  // Impulsionar post
  const [posts, setPosts]               = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [postSelecionado, setPostSel]   = useState(null)
  const [orcImpulsionar, setOrcImp]     = useState(1000)
  const [loadingImp, setLoadingImp]     = useState(false)
  const [resultadoImp, setResultadoImp] = useState(null)

  // Relatório
  const [relatorio, setRelatorio]   = useState(null)
  const [loadingRel, setLoadingRel] = useState(false)
  const [dias, setDias]             = useState(7)

  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  async function carregarCampanhas() {
    setLoadingCamp(true)
    try {
      const data = await api.get('/ads/campanhas')
      setCampanhas(data.campanhas || [])
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingCamp(false) }
  }

  useEffect(() => { if (abaAtiva === 'gerenciar') carregarCampanhas() }, [abaAtiva])

  async function carregarPosts() {
    setLoadingPosts(true); setPosts([]); setPostSel(null); setResultadoImp(null)
    try {
      const data = await api.get('/ads/posts-instagram')
      setPosts(data.posts || [])
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingPosts(false) }
  }

  async function impulsionarPost() {
    if (!postSelecionado) { setToast({ message: 'Selecione um post primeiro!', type: 'error' }); return }
    setLoadingImp(true); setResultadoImp(null)
    try {
      const data = await api.post('/ads/impulsionar-post', { mediaId: postSelecionado.id, orcamentoDiario: orcImpulsionar, registrarFinanceiro: true })
      setResultadoImp(data.resultado)
      setToast({ message: '🎉 Post impulsionado com sucesso!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingImp(false) }
  }

  useEffect(() => { if (abaAtiva === 'impulsionar') carregarPosts() }, [abaAtiva])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const data = await uploadCloudinary(file)
      setImageUrl(data.secure_url)
      setPreview(data.secure_url)
      setToast({ message: 'Imagem carregada! ✅', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setUploading(false) }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile({ target: { files: [file] } })
  }

  async function gerarTexto() {
    setGerando(true)
    try {
      const data = await api.post('/ads/gerar-texto', { tipo: tipoIA })
      setTitulo(data.titulo || '')
      setCorpo(data.corpo || '')
      setToast({ message: 'Texto gerado! 🤖', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setGerando(false) }
  }

  async function analisarAnuncio() {
    setAnalisando(true); setAnalise(null)
    try {
      const data = await api.post('/ads/analisar', { orcamentoDiario: orcamento, tipo: tipoIA })
      setAnalise(data)
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setAnalisando(false) }
  }

  async function criarCampanha() {
    if (!imageUrl)        { setToast({ message: 'Envie a imagem primeiro!', type: 'error' }); return }
    if (!titulo || !corpo){ setToast({ message: 'Preencha título e corpo.', type: 'error' }); return }
    setLoading(true); setResultado(null)
    try {
      const data = await api.post('/ads', { imageUrl, titulo, corpo, orcamentoDiario: orcamento, registrarFinanceiro: true })
      setResultado(data.resultado)
      setToast({ message: '🎉 Campanha criada e registrada no financeiro!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  async function verRelatorio() {
    setLoadingRel(true); setRelatorio(null)
    try {
      const data = await api.get(`/ads/relatorio?dias=${dias}`)
      setRelatorio(data.dados)
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingRel(false) }
  }

  const step = imageUrl ? (titulo && corpo ? 3 : 2) : 1

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📣" title="Tráfego Pago" description="Meta Ads — 3km · 19h–23h · Qui a Dom" />

      {/* Saldo + info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* Adicionar saldo */}
        <a
          href="https://business.facebook.com/billing/payment_methods"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-xl border border-[#1877F2]/30 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 transition-colors group"
        >
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-sm font-bold text-[#1877F2] group-hover:underline">Adicionar Saldo</p>
            <p className="text-[10px] text-[#555]">Abre o Meta Business Manager</p>
          </div>
          <span className="ml-auto text-[#1877F2] text-sm">↗</span>
        </a>

        {/* Gerenciador */}
        <a
          href="https://business.facebook.com/adsmanager"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-xl border border-[#1e1e1e] bg-[#111] hover:border-[#333] transition-colors group"
        >
          <span className="text-2xl">📊</span>
          <div>
            <p className="text-sm font-bold text-white group-hover:underline">Gerenciador Meta</p>
            <p className="text-[10px] text-[#555]">Ver tudo no Meta Ads</p>
          </div>
          <span className="ml-auto text-[#555] text-sm">↗</span>
        </a>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-6 p-1 bg-[#0f0f0f] rounded-xl border border-[#1e1e1e]">
        {[
          { id: 'criar',        label: '➕ Nova'        },
          { id: 'impulsionar',  label: '📸 Impulsionar' },
          { id: 'gerenciar',    label: '⚙️ Gerenciar'   },
          { id: 'relatorio',    label: '📊 Performance' },
        ].map(a => (
          <button key={a.id} onClick={() => setAbaAtiva(a.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              abaAtiva === a.id ? 'bg-[#f97316] text-black' : 'text-[#666] hover:text-white'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ─── ABA: CRIAR ─── */}
      {abaAtiva === 'criar' && (
        <div className="space-y-4">
          {/* Info segmentação */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['📍','Raio','3km'],['🕖','Horário','19h–23h'],['📅','Dias','Qui-Dom'],['🎯','Objetivo','Cliques']].map(([e,l,v]) => (
              <div key={l} className="p-3 rounded-xl bg-[#111] border border-[#1e1e1e] text-center">
                <div className="text-lg mb-1">{e}</div>
                <div className="text-[10px] text-[#555] uppercase tracking-wider">{l}</div>
                <div className="text-xs text-white font-semibold mt-0.5">{v}</div>
              </div>
            ))}
          </div>

          {/* Passo 1 — Imagem */}
          <div className={`rounded-xl border p-5 transition-all ${step >= 1 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111]'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${imageUrl ? 'bg-[#f97316] text-black' : 'bg-[#222] text-[#666]'}`}>1</span>
              <span className="text-sm font-bold text-white">Imagem do anúncio</span>
              {imageUrl && <span className="text-[10px] text-[#f97316] ml-auto">✅ Pronto</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            {imagePreview ? (
              <div className="flex items-center gap-4">
                <img src={imagePreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover border border-[#333]" />
                <div className="flex-1">
                  <p className="text-xs text-green-400 mb-1">✅ Imagem enviada</p>
                  <p className="text-[11px] text-[#555] font-mono truncate">{imageUrl}</p>
                  <button onClick={() => fileRef.current?.click()} className="mt-2 text-xs text-[#f97316] hover:underline">Trocar imagem</button>
                </div>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()} onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-[#2a2a2a] hover:border-[#f97316]/50 rounded-xl p-8 text-center cursor-pointer transition-colors">
                {uploading ? <p className="text-sm text-[#f97316]">⏳ Enviando...</p> : (
                  <>
                    <p className="text-2xl mb-2">📷</p>
                    <p className="text-sm text-[#888]">Clique ou arraste a imagem aqui</p>
                    <p className="text-[11px] text-[#555] mt-1">JPG, PNG · 1080×1080px recomendado</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Passo 2 — Texto */}
          <div className={`rounded-xl border p-5 transition-all ${step >= 2 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111] opacity-60'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${titulo && corpo ? 'bg-[#f97316] text-black' : 'bg-[#222] text-[#666]'}`}>2</span>
              <span className="text-sm font-bold text-white">Texto do anúncio</span>
              {titulo && corpo && <span className="text-[10px] text-[#f97316] ml-auto">✅ Pronto</span>}
            </div>

            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e]">
              <span className="text-xs text-[#666] shrink-0">🤖 Gerar com IA:</span>
              <div className="flex gap-1 flex-wrap flex-1">
                {TIPOS_IA.map(t => (
                  <button key={t.id} onClick={() => setTipoIA(t.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-all ${tipoIA === t.id ? 'bg-[#f97316] text-black font-bold' : 'bg-[#1a1a1a] text-[#666] hover:text-white'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Button onClick={gerarTexto} loading={gerando} variant="secondary" size="sm" className="shrink-0">✨ Gerar</Button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-[#888]">Título</label>
                  <span className={`text-[10px] ${titulo.length > 40 ? 'text-red-400' : 'text-[#555]'}`}>{titulo.length}/40</span>
                </div>
                <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={40}
                  placeholder="🍔 Peça seu Bruthus Burger Agora!"
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#f97316] transition-colors" />
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-[#888]">Corpo</label>
                  <span className={`text-[10px] ${corpo.length > 125 ? 'text-red-400' : 'text-[#555]'}`}>{corpo.length}/125</span>
                </div>
                <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={3} maxLength={125}
                  placeholder="Smash artesanal suculento esperando por você. Entrega rápida!"
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white resize-none placeholder-[#555] focus:outline-none focus:border-[#f97316] transition-colors" />
              </div>
            </div>

            {titulo && corpo && imagePreview && (
              <div className="mt-4 p-3 rounded-xl bg-[#0f0f0f] border border-[#222]">
                <p className="text-[10px] text-[#555] mb-2 uppercase tracking-wider">Preview</p>
                <div className="flex gap-3 items-start">
                  <img src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white leading-snug">{titulo}</p>
                    <p className="text-[11px] text-[#777] mt-1 leading-relaxed">{corpo}</p>
                    <p className="text-[10px] text-[#f97316] mt-1 font-semibold">Peça Agora →</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Passo 3 — Orçamento + Análise */}
          <div className={`rounded-xl border p-5 transition-all ${step >= 3 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111] opacity-60'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${resultado ? 'bg-[#f97316] text-black' : 'bg-[#222] text-[#666]'}`}>3</span>
              <span className="text-sm font-bold text-white">Orçamento</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {ORCAMENTOS.map(o => (
                <button key={o.valor} onClick={() => { setOrcamento(o.valor); setAnalise(null) }}
                  className={`p-3 rounded-xl border text-center transition-all ${orcamento === o.valor ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-white'}`}>
                  <div className="text-sm font-bold">{o.label}</div>
                  <div className="text-[10px] opacity-60">{o.desc}</div>
                </button>
              ))}
            </div>

            {/* Botão Analisar */}
            {!analise && (
              <Button onClick={analisarAnuncio} loading={analisando} variant="secondary" size="lg" className="w-full mb-3" disabled={step < 3}>
                {analisando ? '⏳ Analisando com IA...' : '🔍 Analisar antes de criar'}
              </Button>
            )}

            {/* Card de análise */}
            {analise && (() => {
              const a = analise.analise
              const corMap = { SIM: { border: 'border-green-500/40', bg: 'bg-green-500/5', badge: 'bg-green-500/20 text-green-300 border-green-500/30', icon: '🟢' }, TALVEZ: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: '🟡' }, NAO: { border: 'border-red-500/40', bg: 'bg-red-500/5', badge: 'bg-red-500/20 text-red-300 border-red-500/30', icon: '🔴' } }
              const cor = corMap[a?.recomendacao] || corMap.TALVEZ
              return (
                <div className={`rounded-xl border ${cor.border} ${cor.bg} p-4 mb-3`}>
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cor.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-white">Análise da IA</p>
                        <p className="text-[11px] text-[#777]">{a?.resumo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full border ${cor.badge}`}>
                        {a?.recomendacao === 'SIM' ? '✅ Vale a pena' : a?.recomendacao === 'TALVEZ' ? '⚠️ Com cuidado' : '❌ Não recomendado'}
                      </span>
                      <span className="text-lg font-bold text-white">{a?.nota}/10</span>
                    </div>
                  </div>

                  {/* Motivos */}
                  {a?.motivos?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Por quê:</p>
                      <ul className="space-y-1">
                        {a.motivos.map((m, i) => (
                          <li key={i} className="text-[11px] text-[#aaa] flex gap-1.5"><span className="text-[#555] shrink-0">•</span>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Alertas */}
                  {a?.alertas?.length > 0 && (
                    <div className="mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">⚠️ Atenção:</p>
                      {a.alertas.map((al, i) => (
                        <p key={i} className="text-[11px] text-red-300">{al}</p>
                      ))}
                    </div>
                  )}

                  {/* Dicas */}
                  {a?.dicas?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">💡 Dicas:</p>
                      <ul className="space-y-1">
                        {a.dicas.map((d, i) => (
                          <li key={i} className="text-[11px] text-[#aaa] flex gap-1.5"><span className="text-[#f97316] shrink-0">→</span>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Histórico */}
                  {analise.historico && !analise.historico.semHistorico && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      <span className="text-[10px] bg-[#1a1a1a] text-[#555] px-2 py-1 rounded">💰 Gasto total: R${analise.historico.totalGasto}</span>
                      <span className="text-[10px] bg-[#1a1a1a] text-[#555] px-2 py-1 rounded">📈 CTR médio: {analise.historico.ctrMedio}%</span>
                      <span className="text-[10px] bg-[#1a1a1a] text-[#555] px-2 py-1 rounded">💵 CPC médio: R${analise.historico.cpcMedio}</span>
                    </div>
                  )}

                  <button onClick={() => setAnalise(null)} className="mt-3 text-[10px] text-[#555] hover:text-[#888]">↺ Nova análise</button>
                </div>
              )
            })()}

            <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] mb-4 text-xs text-[#666]">
              💡 Campanha criada <strong className="text-[#888]">pausada</strong> — ative no Gerenciador após revisão. Gasto registrado no financeiro automaticamente.
            </div>

            {analise ? (
              <Button onClick={criarCampanha} loading={loading} size="lg" className="w-full" disabled={step < 3}>
                {analise.analise?.recomendacao === 'NAO'
                  ? '⚠️ Criar mesmo assim'
                  : `📣 Criar Campanha · ${ORCAMENTOS.find(o => o.valor === orcamento)?.label}`}
              </Button>
            ) : (
              <button disabled className="w-full py-3 rounded-xl border border-[#222] bg-[#111] text-[#444] text-sm font-semibold cursor-not-allowed">
                🔒 Analise primeiro para liberar a criação
              </button>
            )}
          </div>

          {/* Resultado */}
          {resultado && (
            <div className="rounded-xl border border-green-600/30 bg-green-600/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-bold text-green-300 text-sm">Campanha criada — PAUSADA</p>
                  {resultado.registradoFinanceiro && <p className="text-[11px] text-[#666]">💰 Gasto registrado no financeiro</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                {[['📣 Campanha', resultado.campanhaId],['🎯 Ad Set', resultado.adSetId],['🎨 Criativo', resultado.creativoId],['📱 Anúncio', resultado.anuncioId]].map(([k,v]) => (
                  <div key={k} className="p-2 rounded-lg bg-[#0f0f0f]">
                    <p className="text-[#555]">{k}</p>
                    <p className="text-white font-mono text-[11px] truncate">{v}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setAbaAtiva('gerenciar')}
                className="w-full py-2 rounded-xl bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] text-xs font-semibold hover:bg-[#f97316]/20 transition">
                ⚙️ Gerenciar campanhas →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── ABA: IMPULSIONAR POST ─── */}
      {abaAtiva === 'impulsionar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#555]">Selecione um post do seu Instagram para transformar em anúncio</p>
            <Button onClick={carregarPosts} loading={loadingPosts} variant="secondary" size="sm">🔄</Button>
          </div>

          {loadingPosts ? (
            <div className="text-center py-12 text-[#444]">
              <p className="text-2xl mb-2 animate-pulse">⏳</p>
              <p className="text-sm">Carregando posts...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-[#1e1e1e] bg-[#111]">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm text-[#555]">Nenhum post encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {posts.map(p => (
                <button key={p.id} onClick={() => setPostSel(postSelecionado?.id === p.id ? null : p)}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    postSelecionado?.id === p.id ? 'border-[#f97316] ring-2 ring-[#f97316]/30' : 'border-[#222] hover:border-[#444]'
                  }`}>
                  <img src={p.media_url || p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  {postSelecionado?.id === p.id && (
                    <div className="absolute inset-0 bg-[#f97316]/20 flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {postSelecionado && (
            <div className="rounded-xl border border-[#f97316]/30 bg-[#f97316]/5 p-4 space-y-4">
              <div className="flex gap-3 items-start">
                <img src={postSelecionado.media_url || postSelecionado.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white mb-1">Post selecionado</p>
                  <p className="text-[11px] text-[#666] line-clamp-2">{postSelecionado.caption || 'Sem legenda'}</p>
                  <p className="text-[10px] text-[#444] mt-1">{new Date(postSelecionado.timestamp).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-[#888] mb-2">Orçamento diário</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ORCAMENTOS.map(o => (
                    <button key={o.valor} onClick={() => setOrcImp(o.valor)}
                      className={`p-3 rounded-xl border text-center transition-all ${orcImpulsionar === o.valor ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-white'}`}>
                      <div className="text-sm font-bold">{o.label}</div>
                      <div className="text-[10px] opacity-60">{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {resultadoImp ? (
                <div className="rounded-xl border border-green-600/30 bg-green-600/5 p-4">
                  <p className="font-bold text-green-300 text-sm mb-2">✅ Campanha criada — PAUSADA</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[['📣 Campanha', resultadoImp.campanhaId], ['📱 Anúncio', resultadoImp.anuncioId]].map(([k, v]) => (
                      <div key={k} className="p-2 rounded-lg bg-[#0f0f0f]">
                        <p className="text-[#555]">{k}</p>
                        <p className="text-white font-mono text-[11px] truncate">{v}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setAbaAtiva('gerenciar')} className="mt-3 w-full py-2 rounded-xl bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] text-xs font-semibold hover:bg-[#f97316]/20 transition">
                    ⚙️ Gerenciar campanhas →
                  </button>
                </div>
              ) : (
                <Button onClick={impulsionarPost} loading={loadingImp} size="lg" className="w-full">
                  📣 Impulsionar Post · {ORCAMENTOS.find(o => o.valor === orcImpulsionar)?.label}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── ABA: GERENCIAR ─── */}
      {abaAtiva === 'gerenciar' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#555]">Todas as campanhas da sua conta Meta Ads</p>
            <Button onClick={carregarCampanhas} loading={loadingCamp} variant="secondary" size="sm">
              🔄 Atualizar
            </Button>
          </div>

          {loadingCamp ? (
            <div className="text-center py-12 text-[#444]">
              <p className="text-2xl mb-2 animate-pulse">⏳</p>
              <p className="text-sm">Carregando campanhas...</p>
            </div>
          ) : campanhas.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-[#1e1e1e] bg-[#111]">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm text-[#555]">Nenhuma campanha encontrada</p>
              <button onClick={() => setAbaAtiva('criar')} className="mt-3 text-xs text-[#f97316] hover:underline">
                Criar primeira campanha →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campanhas.map(c => (
                <CampanhaCard key={c.id} campanha={c} onAtualizar={carregarCampanhas} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ABA: RELATÓRIO ─── */}
      {abaAtiva === 'relatorio' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <select value={dias} onChange={e => setDias(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white">
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
            <Button onClick={verRelatorio} loading={loadingRel} variant="secondary">📊 Carregar</Button>
          </div>

          {!relatorio ? (
            <div className="text-center py-12 rounded-xl border border-[#1e1e1e] bg-[#111] text-[#444]">
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm">Clique em Carregar para ver a performance</p>
            </div>
          ) : relatorio.length === 0 ? (
            <p className="text-sm text-[#555] text-center py-8">Nenhum dado para o período.</p>
          ) : (
            <div className="space-y-3">
              {relatorio.map((camp, i) => {
                const gasto   = parseFloat(camp.spend || 0)
                const cliques = parseInt(camp.clicks || 0)
                const cpc     = cliques > 0 ? (gasto / cliques).toFixed(2) : '—'
                return (
                  <div key={i} className="p-4 rounded-xl bg-[#111] border border-[#222]">
                    <p className="text-xs font-semibold text-white mb-3 truncate">{camp.campaign_name}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      {[['👁️','Impressões',parseInt(camp.impressions||0).toLocaleString('pt-BR')],['🖱️','Cliques',cliques.toLocaleString('pt-BR')],['📈','CTR',`${parseFloat(camp.ctr||0).toFixed(2)}%`],['💰','Gasto',`R$${gasto.toFixed(2)}`],['💵','CPC',`R$${cpc}`]].map(([e,l,v]) => (
                        <div key={l} className="p-2 rounded-lg bg-[#0f0f0f]">
                          <div className="text-base">{e}</div>
                          <div className="text-[9px] text-[#555] mt-0.5">{l}</div>
                          <div className="text-xs font-bold text-white">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
