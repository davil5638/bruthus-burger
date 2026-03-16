'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CUPOM_SEXTA = 'SEXTAOFF10'
const ORDER_LINK  = 'https://bruthus-burger.ola.click/products'

const TIPOS = [
  { id: 'ABERTURA',      emoji: '🚪', label: 'Abertura do Dia',       desc: 'Avisa que abriu hoje',           dia: 'Qui–Dom',  cor: '#f97316' },
  { id: 'QUINTA_BURGER', emoji: '🍔', label: 'Quinta do Hambúrguer',  desc: 'Promo fixa de quinta',           dia: 'Quinta',   cor: '#92400e' },
  { id: 'CUPOM_SEXTA',   emoji: '🔥', label: 'Cupom da Sexta',        desc: `${CUPOM_SEXTA} — 10% OFF`,      dia: 'Sexta',    cor: '#dc2626' },
  { id: 'SABADO_PROMO',  emoji: '🎉', label: 'Promoção de Sábado',    desc: 'Batata, Smash ou Refri grátis', dia: 'Sábado',   cor: '#7c3aed' },
  { id: 'PRODUTO',       emoji: '📸', label: 'Close do Produto',       desc: 'Burger apetitoso em destaque',  dia: 'Qualquer', cor: '#1c1917' },
  { id: 'ENQUETE',       emoji: '📊', label: 'Enquete Interativa',     desc: 'Engaja com pergunta',           dia: 'Qualquer', cor: '#0f172a' },
  { id: 'BASTIDORES',    emoji: '🍳', label: 'Bastidores',             desc: 'Cozinha e preparo artesanal',  dia: 'Qualquer', cor: '#1c1917' },
  { id: 'CTA_PEDIDO',    emoji: '📲', label: 'CTA Direto p/ Pedido',  desc: 'Story 100% foco no link',       dia: 'Qualquer', cor: '#f97316' },
]

const DIAS = ['quinta', 'sexta', 'sabado', 'domingo']

export default function StoriesPage() {
  const [tipo, setTipo]     = useState('PRODUTO')
  const [dia, setDia]       = useState('quinta')
  const [loading, setLoading] = useState(false)
  const [story, setStory]   = useState(null)
  const [copied, setCopied] = useState(false)
  const [toast, setToast]   = useState(null)

  const tipoAtivo = TIPOS.find(t => t.id === tipo)

  async function gerar() {
    setLoading(true); setStory(null)
    try {
      const data = await api.post('/stories', { tipo, dia })
      setStory(data.resultado)
      setToast({ message: 'Story gerado! Pronto para copiar no Mlabs.', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  function textoParaCopiar(c) {
    if (!c) return ''
    return [
      `📱 STORY — ${tipoAtivo?.label}`,
      ``,
      `TEXTO PRINCIPAL:`,
      c.texto_principal,
      ``,
      `TEXTO SECUNDÁRIO:`,
      c.texto_secundario,
      ``,
      `BOTÃO/CTA:`,
      c.cta,
      c.enquete ? `\nENQUETE: ${c.enquete}\n✅ ${c.opcao_sim}  ❌ ${c.opcao_nao}` : '',
      ``,
      `🔗 LINK: ${ORDER_LINK}`,
      `🎵 MÚSICA: ${c.sugestao_musica}`,
      `💡 VISUAL: ${c.dica_visual}`,
    ].filter(Boolean).join('\n')
  }

  async function copiar() {
    if (!story) return
    await navigator.clipboard.writeText(textoParaCopiar(story.conteudo))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📱" title="Gerador de Stories" description="Conteúdo pronto para copiar e colar no Mlabs — sem WhatsApp, 100% link de pedido" />

      {/* Info Mlabs */}
      <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm font-semibold text-blue-300">Como usar com o Mlabs</p>
          <p className="text-xs text-blue-400/70 mt-1">
            Gere o conteúdo aqui → clique em "Copiar" → cole no Mlabs → adicione a imagem → agende. Leva menos de 2 minutos!
          </p>
        </div>
      </div>

      {/* Tipo de story */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Tipo de Story</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TIPOS.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                tipo === t.id ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              <div className="text-lg mb-1">{t.emoji}</div>
              <div className="text-xs font-semibold leading-tight">{t.label}</div>
              <div className="text-[10px] opacity-50 mt-0.5">{t.dia}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Dia */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Dia de Publicação</label>
        <div className="flex gap-2">
          {DIAS.map(d => (
            <button key={d} onClick={() => setDia(d)}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium capitalize transition-all ${
                dia === d ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] bg-[#111] text-[#777] hover:border-[#333] hover:text-white'
              }`}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={gerar} loading={loading} size="lg" className="w-full mb-6">
        📱 Gerar Conteúdo do Story
      </Button>

      {/* Resultado */}
      {story && story.conteudo && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#222] bg-[#161616]">
            <div className="flex items-center gap-2">
              <span>{tipoAtivo?.emoji}</span>
              <span className="font-semibold text-white text-sm">{tipoAtivo?.label}</span>
            </div>
            <button onClick={copiar}
              className="text-xs px-3 py-1.5 rounded-md bg-[#222] hover:bg-[#f97316] text-[#aaa] hover:text-white transition-all font-medium">
              {copied ? '✅ Copiado!' : '📋 Copiar tudo'}
            </button>
          </div>

          {/* Preview visual do story */}
          <div className="p-5 flex gap-5">
            {/* Mockup de story */}
            <div className="shrink-0 w-28 h-48 rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${tipoAtivo?.cor || '#f97316'}, #000)` }}>
              <div className="absolute top-2 left-0 right-0 flex justify-center gap-1">
                {[1,2,3].map(i => <div key={i} className="h-0.5 flex-1 bg-white/40 rounded mx-0.5" />)}
              </div>
              <span className="text-2xl">{tipoAtivo?.emoji}</span>
              <p className="text-white text-[10px] font-bold leading-tight text-center">
                {story.conteudo.texto_principal}
              </p>
              <p className="text-white/70 text-[8px] leading-tight text-center">
                {story.conteudo.texto_secundario}
              </p>
              <div className="absolute bottom-3 left-2 right-2">
                <div className="bg-white/20 backdrop-blur rounded-full py-1 px-2">
                  <p className="text-white text-[8px] font-bold text-center truncate">
                    {story.conteudo.cta}
                  </p>
                </div>
              </div>
            </div>

            {/* Detalhes */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Texto Principal</p>
                <p className="text-white font-bold text-sm bg-[#1a1a1a] px-3 py-2 rounded-lg">
                  {story.conteudo.texto_principal}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Texto Secundário</p>
                <p className="text-[#aaa] text-sm bg-[#1a1a1a] px-3 py-2 rounded-lg">
                  {story.conteudo.texto_secundario}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Botão / CTA</p>
                <p className="text-[#f97316] font-semibold text-sm bg-[#f97316]/10 px-3 py-2 rounded-lg border border-[#f97316]/20">
                  {story.conteudo.cta}
                </p>
              </div>
              {story.conteudo.enquete && (
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">📊 Enquete</p>
                  <div className="bg-[#1a1a1a] px-3 py-2 rounded-lg">
                    <p className="text-white text-xs font-semibold mb-1">{story.conteudo.enquete}</p>
                    <div className="flex gap-2">
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">✅ {story.conteudo.opcao_sim}</span>
                      <span className="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full">❌ {story.conteudo.opcao_nao}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dicas */}
          <div className="px-5 pb-5 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[#161616]">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">🎵 Música</p>
              <p className="text-xs text-[#aaa]">{story.conteudo.sugestao_musica}</p>
            </div>
            <div className="p-3 rounded-lg bg-[#161616]">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">💡 Visual</p>
              <p className="text-xs text-[#aaa]">{story.conteudo.dica_visual}</p>
            </div>
          </div>

          {/* Guia Mlabs */}
          <div className="px-5 pb-5">
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <p className="text-xs font-bold text-blue-300 mb-2">📋 Passos no Mlabs</p>
              <ol className="space-y-1">
                {['Clique em "Copiar tudo" acima', 'Abra o Mlabs → Nova Publicação → Story', 'Cole o texto nos campos indicados', 'Adicione a imagem/vídeo do burger', 'Configure o link de pedido no sticker', 'Agende para o horário certo e publique!'].map((p, i) => (
                  <li key={i} className="text-[11px] text-blue-400/70 flex gap-2">
                    <span className="text-blue-400 shrink-0">{i + 1}.</span>{p}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
