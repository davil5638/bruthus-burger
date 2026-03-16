'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CUPOM_SEXTA = 'SEXTAOFF10'

const GRUPOS = [
  {
    label: '🍔 Quinta-feira — Promoção Fixa',
    cor: 'border-orange-500/20 bg-orange-500/5',
    itens: [
      {
        id: 'QUINTA_BURGER', emoji: '🍔', nome: 'Quinta do Hambúrguer',
        itens: '2 Smash + Batata + 2 Refrigerantes', preco: 'R$47,99',
        tag: 'Toda quinta!', tagCor: 'text-orange-400 bg-orange-500/10',
      },
    ],
  },
  {
    label: '🔥 Sexta-feira — Cupom 10% OFF',
    cor: 'border-red-500/20 bg-red-500/5',
    itens: [
      {
        id: 'SEXTA_CUPOM', emoji: '🔥', nome: 'Sexta com Desconto',
        itens: `Qualquer combo com 10% OFF — cupom ${CUPOM_SEXTA}`, preco: '10% de desconto',
        tag: CUPOM_SEXTA, tagCor: 'text-red-400 bg-red-500/10', cupom: true,
      },
    ],
  },
  {
    label: '🎉 Sábado — Promoção Rotativa (2× por mês)',
    cor: 'border-purple-500/20 bg-purple-500/5',
    sub: '1ª e 3ª semana do mês — alterne entre as opções abaixo',
    itens: [
      {
        id: 'SABADO_BATATA_GRATIS', emoji: '🍟', nome: 'Batata Grátis',
        itens: 'Qualquer burger + Batata GRÁTIS', preco: 'Batata grátis!',
        tag: '1ª semana', tagCor: 'text-purple-400 bg-purple-500/10',
      },
      {
        id: 'SABADO_SMASH_PROMO', emoji: '💥', nome: 'Smash Promocional',
        itens: 'Smash artesanal por preço especial de sábado', preco: 'Preço surpresa!',
        tag: '2ª semana', tagCor: 'text-purple-400 bg-purple-500/10',
      },
      {
        id: 'SABADO_REFRI_GRATIS', emoji: '🥤', nome: 'Refri Grátis',
        itens: 'Qualquer burger + Refrigerante GRÁTIS', preco: 'Refri grátis!',
        tag: '3ª semana', tagCor: 'text-purple-400 bg-purple-500/10',
      },
    ],
  },
  {
    label: '❤️ Domingo — Post Aconchegante',
    cor: 'border-blue-500/20 bg-blue-500/5',
    sub: 'Sem promoção fixa — posts de família e casal para engajar',
    itens: [
      {
        id: 'DOMINGO_FAMILIA', emoji: '👨‍👩‍👧‍👦', nome: 'Domingo em Família',
        itens: '4 Burgers + 2 Batatas grandes + 4 Refrigerantes', preco: 'R$99,99',
        tag: 'Família', tagCor: 'text-blue-400 bg-blue-500/10',
      },
      {
        id: 'DOMINGO_CASAL', emoji: '❤️', nome: 'Combo Casal de Domingo',
        itens: '2 Burgers + 2 Batatas + 2 Bebidas', preco: 'R$59,99',
        tag: 'Casal', tagCor: 'text-blue-400 bg-blue-500/10',
      },
    ],
  },
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
      const linhaExtra = r.promocao.cupom
        ? `\n🏷️ CUPOM: ${r.promocao.cupom} → 10% OFF no pedido`
        : ''
      const texto = [
        `${r.promocao.emoji} ${r.promocao.nome.toUpperCase()} ${r.promocao.emoji}`,
        ``,
        `📦 ITENS: ${r.promocao.descricao}`,
        `💰 BENEFÍCIO: ${r.promocao.preco}`,
        linhaExtra,
        ``,
        `━━━━━━ LEGENDA DO POST ━━━━━━`,
        ``,
        r.legenda,
        ``,
        `━━━━━━ COMENTÁRIO FIXADO ━━━━━━`,
        ``,
        r.comentarioFixado,
      ].filter(l => l !== undefined).join('\n')
      setResult(texto)
      setToast({ message: `"${r.promocao.nome}" gerada com sucesso!`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingId(null) }
  }

  return (
    <div className="max-w-4xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="🎉" title="Gerador de Promoções" description="Bruthus abre Qui–Dom · Clique em qualquer promoção para gerar legenda + comentário fixado" />

      <div className="space-y-6">
        {GRUPOS.map(grupo => (
          <div key={grupo.label} className={`rounded-xl border ${grupo.cor} p-5`}>
            <div className="mb-4">
              <p className="font-bold text-white text-sm">{grupo.label}</p>
              {grupo.sub && <p className="text-xs text-[#666] mt-0.5">{grupo.sub}</p>}
            </div>
            <div className={`grid gap-3 ${grupo.itens.length > 1 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
              {grupo.itens.map(p => (
                <button key={p.id} onClick={() => gerar(p)} disabled={!!loadingId}
                  className={`text-left rounded-xl border border-white/5 bg-[#0f0f0f] p-4 hover:bg-[#1a1a1a] hover:border-[#f97316]/30 transition-all disabled:opacity-50
                    ${activePromo?.id === p.id && result ? 'ring-2 ring-[#f97316] border-[#f97316]/30' : ''}`}>

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xl">{p.emoji}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.tagCor}`}>{p.tag}</span>
                  </div>

                  <p className="font-bold text-white text-sm mb-1">{p.nome}</p>
                  <p className="text-[11px] text-[#666] mb-3 leading-snug">{p.itens}</p>

                  <div className="flex items-center justify-between">
                    <span className="text-[#f97316] font-bold text-xs">{p.preco}</span>
                    {p.cupom && (
                      <span className="text-[10px] bg-[#f97316]/10 text-[#f97316] px-2 py-0.5 rounded font-mono font-bold">
                        {CUPOM_SEXTA}
                      </span>
                    )}
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
          </div>
        ))}
      </div>

      {/* Resultado */}
      {result && activePromo && (
        <div className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
          <div className="px-5 py-3 border-b border-[#222] bg-[#161616] flex items-center justify-between">
            <span className="font-semibold text-white">{activePromo.emoji} {activePromo.nome}</span>
            <button onClick={() => navigator.clipboard.writeText(result)}
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
