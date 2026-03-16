'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const FORMATOS = [
  { value: 'MAKING_OF',   label: '🎥 Making Of',      desc: 'Montagem passo a passo'   },
  { value: 'CLOSE_UP',    label: '🔍 Close Up',       desc: 'Detalhes e ingredientes'  },
  { value: 'MORDIDA',     label: '😋 Mordida',        desc: 'Reação + mordida épica'   },
  { value: 'PROMO',       label: '📣 Anúncio',        desc: 'Promoção irresistível'    },
  { value: 'BASTIDORES',  label: '🍳 Bastidores',     desc: 'Cozinha e preparo artesanal' },
  { value: 'UNBOXING',    label: '📦 Unboxing',       desc: 'Pedido chegando em casa'  },
]

const DURACOES = [
  { value: 15, label: '15s', desc: 'Stories rápido' },
  { value: 30, label: '30s', desc: 'Reels padrão'   },
  { value: 60, label: '60s', desc: 'Reels longo'    },
]

export default function ReelsPage() {
  const [formato, setFormato]   = useState('CLOSE_UP')
  const [duracao, setDuracao]   = useState(30)
  const [loading, setLoading]   = useState(false)
  const [roteiro, setRoteiro]   = useState(null)
  const [toast, setToast]       = useState(null)

  async function gerar() {
    setLoading(true); setRoteiro(null)
    try {
      const data = await api.post('/reels', { formato, duracao })
      setRoteiro(data.roteiro)
      setToast({ message: 'Roteiro gerado com sucesso!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="🎬" title="Gerador de Reels" description="Roteiros completos com cenas, ângulos, músicas e CTA de pedido" />

      {/* Formato */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Formato do Reels</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {FORMATOS.map(f => (
            <button key={f.value} onClick={() => setFormato(f.value)}
              className={`p-3 rounded-xl border text-left transition-all ${
                formato === f.value ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              <div className="text-sm font-semibold">{f.label}</div>
              <div className="text-[11px] mt-0.5 opacity-60">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Duração */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Duração</label>
        <div className="flex gap-2">
          {DURACOES.map(d => (
            <button key={d.value} onClick={() => setDuracao(d.value)}
              className={`flex-1 py-3 rounded-xl border text-center transition-all ${
                duracao === d.value ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              <div className="text-lg font-bold">{d.label}</div>
              <div className="text-[11px] opacity-60">{d.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <Button onClick={gerar} loading={loading} size="lg" className="w-full mb-6">
        🎬 Gerar Roteiro
      </Button>

      {/* Resultado formatado */}
      {roteiro && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
          <div className="px-5 py-3 border-b border-[#222] bg-[#161616] flex items-center justify-between">
            <span className="font-semibold text-white">{roteiro.titulo || 'Roteiro Gerado'}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[#f97316]/20 text-[#f97316] px-2 py-0.5 rounded-full">{duracao}s</span>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(roteiro, null, 2))}
                className="text-xs px-3 py-1 rounded-md bg-[#222] hover:bg-[#f97316] text-[#aaa] hover:text-white transition-all">
                📋 Copiar
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {roteiro.hook && (
              <div className="p-3 rounded-lg bg-[#f97316]/10 border border-[#f97316]/20">
                <p className="text-xs text-[#f97316] font-bold uppercase tracking-wider mb-1">🪝 Hook (primeiros 3s)</p>
                <p className="text-sm text-white font-semibold">"{roteiro.hook}"</p>
              </div>
            )}

            {roteiro.cenas && (
              <div>
                <p className="text-xs font-bold text-[#888] uppercase tracking-wider mb-3">📹 Cenas</p>
                <div className="space-y-2">
                  {roteiro.cenas.map((c, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-[#161616] border border-[#222]">
                      <div className="w-7 h-7 rounded-full bg-[#f97316]/20 text-[#f97316] text-xs font-bold flex items-center justify-center shrink-0">
                        {c.numero || i+1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-[#f97316] font-semibold">{c.duracao}s</span>
                          {c.texto_tela && <span className="text-xs bg-[#222] text-[#aaa] px-2 py-0.5 rounded-full truncate">"{c.texto_tela}"</span>}
                        </div>
                        <p className="text-xs text-[#888] leading-snug">📷 {c.filmagem}</p>
                        {c.som && <p className="text-xs text-[#555] mt-0.5">🎵 {c.som}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {roteiro.texto_tela_final && (
              <div className="p-3 rounded-lg bg-green-600/10 border border-green-600/20">
                <p className="text-xs text-green-400 font-bold uppercase tracking-wider mb-1">🎯 CTA Final</p>
                <p className="text-sm text-white">"{roteiro.texto_tela_final}"</p>
              </div>
            )}

            {roteiro.musica_sugerida && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#161616]">
                <span>🎵</span>
                <div>
                  <p className="text-xs text-[#888]">Música sugerida</p>
                  <p className="text-sm text-white">{roteiro.musica_sugerida}</p>
                </div>
              </div>
            )}

            {roteiro.dicas_edicao && (
              <div>
                <p className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">💡 Dicas de Edição</p>
                <ul className="space-y-1">
                  {roteiro.dicas_edicao.map((d, i) => (
                    <li key={i} className="text-xs text-[#888] flex gap-2"><span className="text-[#f97316]">•</span>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {roteiro.legenda_post && (
              <div className="mt-2 p-4 rounded-lg bg-[#0f0f0f] border border-[#222]">
                <p className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">📋 Legenda do Post</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{roteiro.legenda_post}</pre>
              </div>
            )}

            {roteiro.roteiro_raw && (
              <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{roteiro.roteiro_raw}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
