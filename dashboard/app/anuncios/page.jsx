'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const ORCAMENTOS = [
  { valor: 1000, label: 'R$10/dia', desc: 'Alcance inicial' },
  { valor: 2000, label: 'R$20/dia', desc: 'Recomendado'     },
  { valor: 3000, label: 'R$30/dia', desc: 'Maior alcance'   },
  { valor: 5000, label: 'R$50/dia', desc: 'Agressivo'       },
]

export default function AnunciosPage() {
  const [imageUrl, setImageUrl]   = useState('')
  const [titulo, setTitulo]       = useState('🍔 Peça seu Bruthus Burger Agora!')
  const [corpo, setCorpo]         = useState('Smash artesanal suculento esperando por você. Entrega rápida na sua região!')
  const [orcamento, setOrcamento] = useState(1000)
  const [loading, setLoading]     = useState(false)
  const [loadingRel, setLoadingRel] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [relatorio, setRelatorio] = useState(null)
  const [dias, setDias]           = useState(7)
  const [toast, setToast]         = useState(null)

  async function criarCampanha() {
    if (!imageUrl.trim()) { setToast({ message: 'Informe a URL da imagem!', type: 'error' }); return }
    setLoading(true); setResultado(null)
    try {
      const data = await api.post('/ads', { imageUrl: imageUrl.trim(), titulo, corpo, orcamentoDiario: orcamento })
      setResultado(data.resultado)
      setToast({ message: 'Campanha criada! Ative no Gerenciador de Anúncios.', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  async function verRelatorio() {
    setLoadingRel(true); setRelatorio(null)
    try {
      const data = await api.get(`/ads/relatorio?dias=${dias}`)
      setRelatorio(data.dados)
      setToast({ message: 'Relatório carregado!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingRel(false) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📣" title="Meta Ads" description="Crie campanhas de anúncio automaticamente — segmentação 5km, 18-45 anos, foco em pedidos" />

      {/* Info da segmentação */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { emoji: '📍', label: 'Raio', value: '5km do restaurante'  },
          { emoji: '👥', label: 'Idade', value: '18 a 45 anos'       },
          { emoji: '🎯', label: 'Objetivo', value: 'Cliques no link' },
        ].map(i => (
          <div key={i.label} className="p-3 rounded-xl bg-[#111] border border-[#1e1e1e] text-center">
            <div className="text-xl mb-1">{i.emoji}</div>
            <div className="text-[10px] text-[#555] uppercase tracking-wider">{i.label}</div>
            <div className="text-xs text-white font-semibold mt-0.5">{i.value}</div>
          </div>
        ))}
      </div>

      {/* Form criação */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-6 space-y-4 mb-6">
        <h3 className="text-sm font-bold text-white">Criar Nova Campanha</h3>

        <div>
          <label className="block text-xs text-[#888] mb-1.5">URL da Imagem do Anúncio *</label>
          <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/seu-perfil/banner.jpg"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#f97316] transition-colors" />
        </div>

        <div>
          <label className="block text-xs text-[#888] mb-1.5">Título do Anúncio</label>
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f97316] transition-colors" />
        </div>

        <div>
          <label className="block text-xs text-[#888] mb-1.5">Corpo do Anúncio</label>
          <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={3}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-[#f97316] transition-colors" />
        </div>

        <div>
          <label className="block text-xs text-[#888] mb-2">Orçamento Diário</label>
          <div className="grid grid-cols-4 gap-2">
            {ORCAMENTOS.map(o => (
              <button key={o.valor} onClick={() => setOrcamento(o.valor)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  orcamento === o.valor ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-white'
                }`}>
                <div className="text-sm font-bold">{o.label}</div>
                <div className="text-[10px] opacity-60">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={criarCampanha} loading={loading} size="lg" className="w-full">
          📣 Criar Campanha (Pausada para revisão)
        </Button>
      </div>

      {/* Resultado campanha */}
      {resultado && (
        <div className="mb-6 rounded-xl border border-green-600/30 bg-green-600/10 p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">✅</span>
            <span className="font-bold text-green-300">Campanha criada — status: PAUSADA</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['📣 Campanha ID', resultado.campanhaId],
              ['🎯 Ad Set ID',   resultado.adSetId],
              ['🎨 Criativo ID', resultado.creativoId],
              ['📱 Anúncio ID',  resultado.anuncioId],
              ['💰 Orçamento',   resultado.orcamentoDiario],
            ].map(([k, v]) => (
              <div key={k} className="p-2 rounded-lg bg-[#0f0f0f]">
                <p className="text-[#555]">{k}</p>
                <p className="text-white font-mono text-[11px] truncate">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-yellow-300">⚠️ Ative a campanha em <strong>business.facebook.com → Gerenciador de Anúncios</strong> após revisão.</p>
          </div>
        </div>
      )}

      {/* Relatório */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-6">
        <h3 className="text-sm font-bold text-white mb-4">📊 Relatório de Performance</h3>
        <div className="flex items-center gap-3 mb-4">
          <select value={dias} onChange={e => setDias(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white">
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          <Button onClick={verRelatorio} loading={loadingRel} variant="secondary">
            📊 Ver Relatório
          </Button>
        </div>

        {relatorio && (
          <div className="space-y-3 animate-slide-up">
            {relatorio.length === 0 ? (
              <p className="text-sm text-[#555] text-center py-4">Nenhum dado encontrado para o período.</p>
            ) : relatorio.map((camp, i) => (
              <div key={i} className="p-4 rounded-xl bg-[#161616] border border-[#222]">
                <p className="text-sm font-semibold text-white mb-3">{camp.campaign_name}</p>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[
                    ['👁️', 'Impressões', parseInt(camp.impressions || 0).toLocaleString('pt-BR')],
                    ['🖱️', 'Cliques',    parseInt(camp.clicks || 0).toLocaleString('pt-BR')],
                    ['📈', 'CTR',        `${parseFloat(camp.ctr || 0).toFixed(2)}%`],
                    ['💰', 'Gasto',      `R$${parseFloat(camp.spend || 0).toFixed(2)}`],
                  ].map(([e, l, v]) => (
                    <div key={l} className="p-2 rounded-lg bg-[#0f0f0f]">
                      <div className="text-lg">{e}</div>
                      <div className="text-[10px] text-[#555] mt-0.5">{l}</div>
                      <div className="text-sm font-bold text-white">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
