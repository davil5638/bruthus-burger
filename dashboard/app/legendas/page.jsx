'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import ResultBox from '../../components/ResultBox'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

// Bruthus abre Qui–Dom
const TIPOS = [
  { value: 'SMASH',       label: '🍔 Smash Burger',     desc: 'Burger artesanal 80g prensado'    },
  { value: 'NORMAL',      label: '🍔 Normal 150g',      desc: 'Hamburguer artesanal 150g'        },
  { value: 'COMBO',       label: '🍟 Combo Completo',   desc: 'Burger + batata + bebida'         },
  { value: 'SEXTA_CUPOM', label: '🔥 Sexta c/ Cupom',  desc: 'SEXTAOFF10 — 10% OFF no link'     },
  { value: 'FAMILIA',     label: '👨‍👩‍👧‍👦 Combo Família',  desc: 'Reunião de domingo'               },
  { value: 'BATATA',      label: '🍟 Batata Frita',     desc: 'Batata crocante (sábado especial)' },
  { value: 'DOMINGO',     label: '❤️ Domingo',          desc: 'Post aconchegante família/casal'  },
]

const GATILHOS = [
  { value: null,            label: '🎲 Aleatório (IA escolhe)' },
  { value: 'escassez',      label: '⏳ Escassez — poucas unidades' },
  { value: 'urgencia',      label: '🔥 Urgência — só hoje' },
  { value: 'fome',          label: '😋 Fome — descrição sensorial' },
  { value: 'social proof',  label: '⭐ Prova Social — o mais pedido' },
  { value: 'novidade',      label: '✨ Novidade — lançamento exclusivo' },
]

export default function LegendasPage() {
  const [tipo, setTipo]           = useState('SMASH')
  const [gatilho, setGatilho]     = useState(null)
  const [qtd, setQtd]             = useState(3)
  const [loading, setLoading]     = useState(false)
  const [loadingLivre, setLoadingLivre] = useState(false)
  const [loadingLote, setLoadingLote] = useState(false)
  const [result, setResult]       = useState(null)
  const [resultLivre, setResultLivre] = useState(null)
  const [resultLote, setResultLote] = useState(null)
  const [instrucaoLivre, setInstrucaoLivre] = useState('')
  const [toast, setToast]         = useState(null)

  async function gerar() {
    setLoading(true); setResult(null)
    try {
      const data = await api.post('/caption', { tipo, gatilho })
      setResult(data.legenda)
      setToast({ message: 'Legenda gerada com sucesso!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  async function gerarLivre() {
    if (!instrucaoLivre.trim()) return
    setLoadingLivre(true); setResultLivre(null)
    try {
      const data = await api.post('/caption', { instrucaoLivre })
      setResultLivre(data.legenda)
      setToast({ message: 'Legenda gerada com sucesso!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingLivre(false) }
  }

  async function gerarLote() {
    setLoadingLote(true); setResultLote(null)
    try {
      const data = await api.post('/caption/batch', { quantidade: qtd })
      const texto = data.legendas.map((l, i) => `━━ Legenda ${i + 1} (${l.tipo}) ━━\n\n${l.caption}`).join('\n\n\n')
      setResultLote(texto)
      setToast({ message: `${data.total} legendas geradas!`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingLote(false) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="✍️" title="Gerador de Legendas" description="Crie legendas com IA focadas em conversão — todo CTA aponta para o link de pedido" />

      {/* Tipo de post */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Tipo de Post</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {TIPOS.map(t => (
            <button key={t.value} onClick={() => setTipo(t.value)}
              className={`p-3 rounded-xl border text-left transition-all ${
                tipo === t.value
                  ? 'border-[#f97316] bg-[#f97316]/10 text-white'
                  : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-[11px] mt-0.5 opacity-60">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Gatilho */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Gatilho Psicológico</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {GATILHOS.map(g => (
            <button key={g.value ?? 'random'} onClick={() => setGatilho(g.value)}
              className={`p-3 rounded-xl border text-left text-sm transition-all ${
                gatilho === g.value
                  ? 'border-[#f97316] bg-[#f97316]/10 text-white'
                  : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Botão principal */}
      <Button onClick={gerar} loading={loading} size="lg" className="w-full mb-2">
        🤖 Gerar Legenda com IA
      </Button>

      <ResultBox content={result} label="Legenda Gerada" />

      {/* Divider */}
      <div className="my-8 border-t border-[#1e1e1e]" />

      {/* Instrução livre */}
      <div className="mb-8 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
        <h3 className="text-sm font-bold text-white mb-1">✍️ Descreva o que você quer</h3>
        <p className="text-xs text-[#666] mb-4">
          Escreva em texto livre o que a legenda deve conter — produto, promoção, ocasião, tom, o que quiser. A IA vai criar baseada exatamente no que você pediu.
        </p>
        <textarea
          value={instrucaoLivre}
          onChange={e => setInstrucaoLivre(e.target.value)}
          placeholder='Ex: "Quero uma legenda de sexta-feira anunciando o smash burger com cupom de desconto, tom urgente e apetitoso"'
          rows={4}
          className="w-full bg-[#0f0f0f] border border-[#333] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] resize-none focus:outline-none focus:border-[#f97316] leading-relaxed mb-3"
        />
        <Button
          onClick={gerarLivre}
          loading={loadingLivre}
          disabled={!instrucaoLivre.trim()}
          size="lg"
          className="w-full"
        >
          🤖 Gerar com minha descrição
        </Button>
        <ResultBox content={resultLivre} label="Legenda Gerada (Livre)" />
      </div>

      {/* Divider lote */}
      <div className="my-2 border-t border-[#1e1e1e]" />

      {/* Lote */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
        <h3 className="text-sm font-bold text-white mb-1">📦 Gerar em Lote</h3>
        <p className="text-xs text-[#666] mb-4">Gera múltiplas legendas de uma vez para ter um estoque de conteúdo</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#888]">Quantidade:</label>
            <select value={qtd} onChange={e => setQtd(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white">
              {[3,5,6,10].map(n => <option key={n} value={n}>{n} legendas</option>)}
            </select>
          </div>
          <Button onClick={gerarLote} loading={loadingLote} variant="secondary">
            🚀 Gerar Lote
          </Button>
        </div>
        <ResultBox content={resultLote} label={`${qtd} Legendas Geradas`} />
      </div>
    </div>
  )
}
