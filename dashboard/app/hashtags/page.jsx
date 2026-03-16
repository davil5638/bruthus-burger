'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const TIPOS = [
  { value: 'produto', label: '🍔 Produto',   desc: 'Para posts de hamburguer' },
  { value: 'promo',   label: '🎉 Promoção',  desc: 'Para posts de oferta'     },
  { value: 'reels',   label: '🎬 Reels',     desc: 'Para vídeos e reels'      },
]

export default function HashtagsPage() {
  const [tipo, setTipo]       = useState('produto')
  const [loading, setLoading] = useState(false)
  const [tags, setTags]       = useState(null)
  const [copied, setCopied]   = useState(false)
  const [toast, setToast]     = useState(null)

  async function gerar() {
    setLoading(true); setTags(null); setCopied(false)
    try {
      const data = await api.get(`/hashtags?tipo=${tipo}`)
      setTags(data.hashtags)
      setToast({ message: `${data.total} hashtags geradas!`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  async function copiar() {
    await navigator.clipboard.writeText(tags)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tagList = tags ? tags.split(' ') : []

  return (
    <div className="max-w-2xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="#" title="Gerador de Hashtags" description="Hashtags rotativas para evitar shadowban — adequadas para Instagram em Fortaleza/CE" />

      {/* Tipo */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Tipo de Conteúdo</label>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(t => (
            <button key={t.value} onClick={() => setTipo(t.value)}
              className={`p-4 rounded-xl border text-left transition-all ${
                tipo === t.value ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-[11px] opacity-60 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
        💡 As hashtags são <strong>rotativas</strong> — mudam a cada dia para evitar shadowban. Use sempre o gerador antes de postar!
      </div>

      <Button onClick={gerar} loading={loading} size="lg" className="w-full mb-6">
        # Gerar Hashtags
      </Button>

      {/* Resultado */}
      {tags && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] bg-[#161616]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">Hashtags Geradas</span>
              <span className="bg-[#f97316]/20 text-[#f97316] text-xs font-bold px-2 py-0.5 rounded-full">
                {tagList.length} tags
              </span>
            </div>
            <button onClick={copiar}
              className="text-xs px-3 py-1.5 rounded-md bg-[#222] hover:bg-[#f97316] text-[#aaa] hover:text-white transition-all font-medium">
              {copied ? '✅ Copiado!' : '📋 Copiar'}
            </button>
          </div>

          {/* Tags como chips */}
          <div className="p-4 flex flex-wrap gap-2">
            {tagList.map((tag, i) => (
              <button key={i} onClick={() => navigator.clipboard.writeText(tag)}
                className="text-xs px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:border-[#f97316] hover:text-[#f97316] transition-all">
                {tag}
              </button>
            ))}
          </div>

          {/* Texto completo */}
          <div className="px-4 pb-4">
            <p className="text-[10px] text-[#555] mb-2">Texto completo para copiar:</p>
            <div className="p-3 rounded-lg bg-[#0f0f0f] border border-[#222]">
              <p className="text-xs text-[#777] leading-relaxed break-all">{tags}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
