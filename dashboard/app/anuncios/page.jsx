'use client'
import { useState, useRef } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CLOUD_NAME   = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME   || 'duchjjeaw'
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'bruthus_unsigned'

const ORCAMENTOS = [
  { valor: 1000, label: 'R$10/dia',  desc: 'Alcance inicial' },
  { valor: 2000, label: 'R$20/dia',  desc: 'Recomendado'     },
  { valor: 3000, label: 'R$30/dia',  desc: 'Maior alcance'   },
  { valor: 5000, label: 'R$50/dia',  desc: 'Agressivo'       },
]

const TIPOS_IA = [
  { id: 'SMASH',   label: '🍔 Smash'   },
  { id: 'COMBO',   label: '🍟 Combo'   },
  { id: 'FAMILIA', label: '❤️ Família' },
  { id: 'QUINTA',  label: '🎉 Quinta'  },
  { id: 'SEXTA',   label: '🔥 Sexta'   },
]

async function uploadCloudinary(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', 'bruthus/ads')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Falha no upload da imagem')
  return res.json()
}

export default function AnunciosPage() {
  // Imagem
  const [imageUrl, setImageUrl]     = useState('')
  const [imagePreview, setPreview]  = useState(null)
  const [uploading, setUploading]   = useState(false)

  // Texto
  const [titulo, setTitulo]   = useState('')
  const [corpo, setCorpo]     = useState('')
  const [tipoIA, setTipoIA]   = useState('SMASH')
  const [gerando, setGerando] = useState(false)

  // Campanha
  const [orcamento, setOrcamento]   = useState(2000)
  const [loading, setLoading]       = useState(false)
  const [resultado, setResultado]   = useState(null)

  // Relatório
  const [relatorio, setRelatorio]   = useState(null)
  const [loadingRel, setLoadingRel] = useState(false)
  const [dias, setDias]             = useState(7)

  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  // ─── Upload de imagem ───
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
    if (file) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [file] } }) }
  }

  // ─── Gerar texto com IA ───
  async function gerarTexto() {
    setGerando(true)
    try {
      const data = await api.post('/ads/gerar-texto', { tipo: tipoIA })
      setTitulo(data.titulo || '')
      setCorpo(data.corpo || '')
      setToast({ message: 'Texto gerado com IA! 🤖', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setGerando(false) }
  }

  // ─── Criar campanha ───
  async function criarCampanha() {
    if (!imageUrl) { setToast({ message: 'Envie a imagem do anúncio primeiro!', type: 'error' }); return }
    if (!titulo || !corpo) { setToast({ message: 'Preencha o título e o corpo do anúncio.', type: 'error' }); return }
    setLoading(true); setResultado(null)
    try {
      const data = await api.post('/ads', {
        imageUrl,
        titulo,
        corpo,
        orcamentoDiario: orcamento,
        registrarFinanceiro: true,
      })
      setResultado(data.resultado)
      setToast({ message: '🎉 Campanha criada e registrada no financeiro!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  // ─── Relatório ───
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

      <PageHeader emoji="📣" title="Tráfego Pago" description="Crie campanhas no Meta Ads em 3 passos — segmentação 3km, 19h–23h, Qui a Dom" />

      {/* Info segmentação */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { e: '📍', l: 'Raio',      v: '3km'         },
          { e: '🕖', l: 'Horário',   v: '19h–23h'     },
          { e: '📅', l: 'Dias',      v: 'Qui a Dom'   },
          { e: '🎯', l: 'Objetivo',  v: 'Cliques link'},
        ].map(i => (
          <div key={i.l} className="p-3 rounded-xl bg-[#111] border border-[#1e1e1e] text-center">
            <div className="text-xl mb-1">{i.e}</div>
            <div className="text-[10px] text-[#555] uppercase tracking-wider">{i.l}</div>
            <div className="text-xs text-white font-semibold mt-0.5">{i.v}</div>
          </div>
        ))}
      </div>

      {/* ─── PASSO 1: Imagem ─── */}
      <div className={`rounded-xl border p-5 mb-4 transition-all ${step >= 1 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111]'}`}>
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
              <button onClick={() => fileRef.current?.click()}
                className="mt-2 text-xs text-[#f97316] hover:underline">Trocar imagem</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-[#2a2a2a] hover:border-[#f97316]/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
          >
            {uploading ? (
              <p className="text-sm text-[#f97316]">⏳ Enviando para Cloudinary...</p>
            ) : (
              <>
                <p className="text-2xl mb-2">📷</p>
                <p className="text-sm text-[#888]">Clique ou arraste a imagem aqui</p>
                <p className="text-[11px] text-[#555] mt-1">JPG, PNG · 1080×1080px recomendado</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── PASSO 2: Texto ─── */}
      <div className={`rounded-xl border p-5 mb-4 transition-all ${step >= 2 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111] opacity-60'}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${titulo && corpo ? 'bg-[#f97316] text-black' : 'bg-[#222] text-[#666]'}`}>2</span>
          <span className="text-sm font-bold text-white">Texto do anúncio</span>
          {titulo && corpo && <span className="text-[10px] text-[#f97316] ml-auto">✅ Pronto</span>}
        </div>

        {/* Gerador IA */}
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
          <Button onClick={gerarTexto} loading={gerando} variant="secondary" size="sm" className="shrink-0">
            ✨ Gerar
          </Button>
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
              placeholder="Smash artesanal suculento esperando por você. Entrega rápida na sua região!"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white resize-none placeholder-[#555] focus:outline-none focus:border-[#f97316] transition-colors" />
          </div>
        </div>

        {/* Preview do anúncio */}
        {(titulo || corpo) && imagePreview && (
          <div className="mt-4 p-3 rounded-xl bg-[#0f0f0f] border border-[#222]">
            <p className="text-[10px] text-[#555] mb-2 uppercase tracking-wider">Preview do anúncio</p>
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

      {/* ─── PASSO 3: Orçamento e Criar ─── */}
      <div className={`rounded-xl border p-5 mb-6 transition-all ${step >= 3 ? 'border-[#f97316]/40 bg-[#f97316]/5' : 'border-[#1e1e1e] bg-[#111] opacity-60'}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${resultado ? 'bg-[#f97316] text-black' : 'bg-[#222] text-[#666]'}`}>3</span>
          <span className="text-sm font-bold text-white">Orçamento e publicar</span>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-5">
          {ORCAMENTOS.map(o => (
            <button key={o.valor} onClick={() => setOrcamento(o.valor)}
              className={`p-3 rounded-xl border text-center transition-all ${
                orcamento === o.valor ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-white'}`}>
              <div className="text-sm font-bold">{o.label}</div>
              <div className="text-[10px] opacity-60">{o.desc}</div>
            </button>
          ))}
        </div>

        <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] mb-4 text-xs text-[#666]">
          💡 A campanha é criada <strong className="text-[#888]">pausada</strong> — você ativa manualmente no Gerenciador de Anúncios da Meta após revisar. O gasto é registrado automaticamente no financeiro.
        </div>

        <Button onClick={criarCampanha} loading={loading} size="lg" className="w-full" disabled={step < 3}>
          📣 Criar Campanha · {ORCAMENTOS.find(o => o.valor === orcamento)?.label}
        </Button>
      </div>

      {/* ─── Resultado ─── */}
      {resultado && (
        <div className="mb-6 rounded-xl border border-green-600/30 bg-green-600/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">✅</span>
            <div>
              <p className="font-bold text-green-300 text-sm">Campanha criada — status: PAUSADA</p>
              {resultado.registradoFinanceiro && (
                <p className="text-[11px] text-[#666] mt-0.5">💰 Gasto registrado no financeiro</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            {[
              ['📣 Campanha ID', resultado.campanhaId],
              ['🎯 Ad Set ID',   resultado.adSetId],
              ['🎨 Criativo ID', resultado.creativoId],
              ['📱 Anúncio ID',  resultado.anuncioId],
              ['💰 Orçamento',   resultado.orcamentoDiario],
              ['🔗 Destino',     resultado.linkDestino],
            ].map(([k, v]) => (
              <div key={k} className="p-2 rounded-lg bg-[#0f0f0f]">
                <p className="text-[#555]">{k}</p>
                <p className="text-white font-mono text-[11px] truncate">{v}</p>
              </div>
            ))}
          </div>

          <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#1877F2]/20 border border-[#1877F2]/30 text-[#1877F2] text-sm font-semibold hover:bg-[#1877F2]/30 transition-colors">
            🔗 Ativar no Gerenciador de Anúncios da Meta
          </a>
        </div>
      )}

      {/* ─── Relatório ─── */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">📊 Performance dos Anúncios</h3>
          <div className="flex items-center gap-2">
            <select value={dias} onChange={e => setDias(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white">
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
            <Button onClick={verRelatorio} loading={loadingRel} variant="secondary" size="sm">
              Atualizar
            </Button>
          </div>
        </div>

        {!relatorio ? (
          <div className="text-center py-8 text-[#444]">
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm">Clique em Atualizar para ver a performance</p>
          </div>
        ) : relatorio.length === 0 ? (
          <p className="text-sm text-[#555] text-center py-6">Nenhum dado encontrado para o período.</p>
        ) : (
          <div className="space-y-3">
            {relatorio.map((camp, i) => {
              const gasto = parseFloat(camp.spend || 0)
              const cliques = parseInt(camp.clicks || 0)
              const cpc = cliques > 0 ? (gasto / cliques).toFixed(2) : '—'
              return (
                <div key={i} className="p-4 rounded-xl bg-[#161616] border border-[#222]">
                  <p className="text-xs font-semibold text-white mb-3 truncate">{camp.campaign_name}</p>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      ['👁️', 'Impressões', parseInt(camp.impressions || 0).toLocaleString('pt-BR')],
                      ['🖱️', 'Cliques',    cliques.toLocaleString('pt-BR')],
                      ['📈', 'CTR',        `${parseFloat(camp.ctr || 0).toFixed(2)}%`],
                      ['💰', 'Gasto',      `R$${gasto.toFixed(2)}`],
                      ['💵', 'CPC',        `R$${cpc}`],
                    ].map(([e, l, v]) => (
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
    </div>
  )
}
