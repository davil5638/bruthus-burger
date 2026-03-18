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
          { id: 'criar',     label: '🚀 Impulsionar' },
          { id: 'gerenciar', label: '⚙️ Gerenciar'   },
          { id: 'relatorio', label: '📊 Performance' },
        ].map(a => (
          <button key={a.id} onClick={() => setAbaAtiva(a.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              abaAtiva === a.id ? 'bg-[#f97316] text-black' : 'text-[#666] hover:text-white'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ─── ABA: IMPULSIONAR (GUIA MANUAL) ─── */}
      {abaAtiva === 'criar' && (
        <div className="space-y-4">
          {/* ─── Gerador de texto IA ─── */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-[#f97316] text-black flex items-center justify-center text-xs font-bold">1</span>
              <span className="text-sm font-bold text-white">Gere o texto do anúncio com IA</span>
            </div>
            <p className="text-[11px] text-[#555] mb-3">Escolha o tipo de post e copie o texto gerado para usar ao impulsionar no Instagram.</p>
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] flex-wrap">
              <span className="text-xs text-[#666] shrink-0">🤖 Tipo:</span>
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
            {(titulo || corpo) && (
              <div className="space-y-2">
                {titulo && (
                  <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#222]">
                    <p className="text-[10px] text-[#555] mb-1">TÍTULO</p>
                    <p className="text-sm font-bold text-white">{titulo}</p>
                  </div>
                )}
                {corpo && (
                  <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#222]">
                    <p className="text-[10px] text-[#555] mb-1">LEGENDA</p>
                    <p className="text-xs text-[#ccc] leading-relaxed">{corpo}</p>
                  </div>
                )}
                <p className="text-[10px] text-[#444]">💡 Copie o texto acima e use ao impulsionar no Instagram</p>
              </div>
            )}
          </div>

          {/* ─── Orçamento recomendado ─── */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-[#f97316] text-black flex items-center justify-center text-xs font-bold">2</span>
              <span className="text-sm font-bold text-white">Escolha o orçamento</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                { label: 'R$10/dia', dias: '3 dias = R$30', alcance: '~800–1.5k pessoas', rec: false },
                { label: 'R$20/dia', dias: '3 dias = R$60', alcance: '~1.5k–3k pessoas', rec: true  },
                { label: 'R$30/dia', dias: '3 dias = R$90', alcance: '~3k–5k pessoas',   rec: false },
                { label: 'R$50/dia', dias: '3 dias = R$150',alcance: '~5k–8k pessoas',   rec: false },
              ].map(o => (
                <div key={o.label} className={`p-3 rounded-xl border text-center relative ${o.rec ? 'border-[#f97316]/60 bg-[#f97316]/5' : 'border-[#222] bg-[#1a1a1a]'}`}>
                  {o.rec && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-[#f97316] text-black px-2 rounded-full font-bold">Recomendado</span>}
                  <div className={`text-sm font-bold ${o.rec ? 'text-[#f97316]' : 'text-white'}`}>{o.label}</div>
                  <div className="text-[10px] text-[#555] mt-1">{o.dias}</div>
                  <div className="text-[10px] text-[#444] mt-0.5">{o.alcance}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#555]">💡 Para uma cidade pequena como Fortaleza, <strong className="text-[#888]">R$20/dia por 3 a 5 dias</strong> é o ideal para sentir o resultado sem gastar muito.</p>
          </div>

          {/* ─── Passo a passo no celular ─── */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-[#f97316] text-black flex items-center justify-center text-xs font-bold">3</span>
              <span className="text-sm font-bold text-white">Impulsione pelo celular</span>
              <span className="text-[10px] bg-[#1a1a1a] text-[#555] px-2 py-0.5 rounded ml-auto">App do Instagram</span>
            </div>
            <div className="space-y-3">
              {[
                { n: '1', icon: '📱', titulo: 'Abra o Instagram', desc: 'Entre no perfil @bruthus_burger' },
                { n: '2', icon: '🖼️', titulo: 'Escolha o melhor post', desc: 'Prefira fotos de burger com boa iluminação — evite posts com muito texto' },
                { n: '3', icon: '👆', titulo: 'Toque em "Impulsionar publicação"', desc: 'Botão azul abaixo da foto, no perfil ou no feed' },
                { n: '4', icon: '🎯', titulo: 'Configure o público', desc: 'Selecione "Criar o seu próprio" → Localização: sua cidade → Raio: 3 a 5 km → Idade: 18–45 anos → Interesse: Comida, Hambúrguer, Delivery' },
                { n: '5', icon: '💰', titulo: 'Defina orçamento e duração', desc: 'R$20/dia · 3 a 5 dias · Destino: Site (cole o link bruthus-burger.ola.click/products)' },
                { n: '6', icon: '✅', titulo: 'Toque em "Impulsionar"', desc: 'Meta revisa em até 24h e o anúncio entra no ar automaticamente' },
              ].map(p => (
                <div key={p.n} className="flex gap-3 items-start p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e]">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs font-bold text-[#f97316]">{p.n}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white">{p.icon} {p.titulo}</p>
                    <p className="text-[11px] text-[#666] mt-0.5 leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Dicas rápidas ─── */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4">
            <p className="text-xs font-semibold text-[#888] mb-3">💡 Dicas para o anúncio performar melhor</p>
            <div className="space-y-1.5">
              {[
                '📸 Use fotos com boa iluminação e o hambúrguer em destaque — sem fundo bagunçado',
                '🕖 Impulsione de Qui a Dom, que são os dias que você abre',
                '🔗 Sempre coloque o link do cardápio como destino — não o Instagram',
                '📊 Deixe rodar pelo menos 3 dias antes de analisar o resultado',
                '🔁 Se performar bem (muitos cliques), repita o mesmo post com mais orçamento',
              ].map((d, i) => (
                <p key={i} className="text-[11px] text-[#666] flex gap-2">{d}</p>
              ))}
            </div>
          </div>

          {/* ─── Botão direto ─── */}
          <a
            href="https://www.instagram.com/bruthus_burger"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-[#f97316] to-[#ea580c] text-black text-sm font-bold hover:opacity-90 transition"
          >
            📲 Abrir @bruthus_burger no Instagram →
          </a>
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
