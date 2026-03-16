'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import ResultBox from '../../components/ResultBox'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const PROMOCOES = [
  { id: 'QUINTA_BURGER',   emoji: '🍔', nome: 'Quinta do Hambúrguer', itens: '2 Smash + Batata + 2 Refrigerantes', preco: 'R$47,99', dia: 'Quinta',  cor: 'from-orange-600/20', borda: 'border-orange-500/30' },
  { id: 'COMBO_CASAL',     emoji: '❤️', nome: 'Combo Casal',          itens: '2 Burgers + 2 Batatas + 2 Bebidas', preco: 'R$59,99', dia: 'Qualquer', cor: 'from-pink-600/20',   borda: 'border-pink-500/30'   },
  { id: 'SMASH_DIA',       emoji: '🔥', nome: 'Smash do Dia',         itens: 'Smash duplo + Batata média',        preco: 'R$32,99', dia: 'Qualquer', cor: 'from-red-600/20',    borda: 'border-red-500/30'    },
  { id: 'COMBO_FAMILIA',   emoji: '👨‍👩‍👧‍👦', nome: 'Combo Família',       itens: '4 Burgers + 2 Batatas + 4 Refri',   preco: 'R$99,99', dia: 'Domingo', cor: 'from-blue-600/20',   borda: 'border-blue-500/30'   },
  { id: 'SEXTA_SMASH',     emoji: '🍟', nome: 'Sexta do Smash',       itens: 'Smash + Batata + Bebida',           preco: 'R$38,99', dia: 'Sexta',   cor: 'from-yellow-600/20', borda: 'border-yellow-500/30' },
  { id: 'SEGUNDA_ESPECIAL',emoji: '⚡', nome: 'Segunda Especial',     itens: 'Burger clássico + Batata',         preco: 'R$28,99', dia: 'Segunda', cor: 'from-purple-600/20', borda: 'border-purple-500/30' },
]

export default function PromocoesPage() {
  const [loadingId, setLoadingId] = useState(null)
  const [result, setResult]       = useState(null)
  const [activePromo, setActivePromo] = useState(null)
  const [toast, setToast]         = useState(null)

  async function gerar(promo) {
    setLoadingId(promo.id); setResult(null); setActivePromo(promo)
    try {
      const data = await api.post('/promotion', { tipo: promo.id })
      const r = data.resultado
      const texto = [
        `${r.promocao.emoji} ${r.promocao.nome.toUpperCase()} ${r.promocao.emoji}`,
        ``,
        `📦 ITENS: ${r.promocao.descricao}`,
        `💰 PREÇO: ${r.promocao.preco}`,
        ``,
        `━━━━━━ LEGENDA DO POST ━━━━━━`,
        ``,
        r.legenda,
        ``,
        `━━━━━━ COMENTÁRIO FIXADO ━━━━━━`,
        ``,
        r.comentarioFixado,
      ].join('\n')
      setResult(texto)
      setToast({ message: `Promoção "${r.promocao.nome}" gerada!`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingId(null) }
  }

  return (
    <div className="max-w-4xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="🎉" title="Gerador de Promoções" description="Clique em uma promoção para gerar a legenda + comentário fixado automaticamente" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {PROMOCOES.map(p => (
          <button key={p.id} onClick={() => gerar(p)} disabled={!!loadingId}
            className={`text-left rounded-xl border ${p.borda} bg-gradient-to-br ${p.cor} to-transparent p-5
              hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-wait
              ${activePromo?.id === p.id && result ? 'ring-2 ring-[#f97316]' : ''}`}>

            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{p.emoji}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#888]">{p.dia}</span>
            </div>

            <p className="font-bold text-white text-sm mb-1">{p.nome}</p>
            <p className="text-[11px] text-[#666] mb-3 leading-snug">{p.itens}</p>

            <div className="flex items-center justify-between">
              <span className="text-[#f97316] font-bold text-sm">{p.preco}</span>
              {loadingId === p.id ? (
                <span className="text-xs text-[#888] flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                    <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Gerando…
                </span>
              ) : (
                <span className="text-xs text-[#f97316] font-semibold">Gerar →</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {result && activePromo && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
          <div className="px-5 py-3 border-b border-[#222] bg-[#161616] flex items-center justify-between">
            <span className="font-semibold text-white">{activePromo.emoji} {activePromo.nome}</span>
            <button onClick={async () => { await navigator.clipboard.writeText(result) }}
              className="text-xs px-3 py-1 rounded-md bg-[#222] hover:bg-[#f97316] text-[#aaa] hover:text-white transition-all">
              📋 Copiar tudo
            </button>
          </div>
          <pre className="p-5 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{result}</pre>
        </div>
      )}
    </div>
  )
}
