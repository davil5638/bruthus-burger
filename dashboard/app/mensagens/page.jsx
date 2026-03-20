'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const DIAS = [
  {
    id: 'quinta',
    label: 'Quinta',
    emoji: '🎉',
    promocao: 'Combo Quinta do Hambúrguer',
    cor: 'border-purple-500/30 bg-purple-500/5',
    corAtiva: 'border-purple-500 bg-purple-500/15',
    corBadge: 'text-purple-400',
    corPromo: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  },
  {
    id: 'sexta',
    label: 'Sexta',
    emoji: '🔥',
    promocao: 'Cupom SEXTAOFF10 — 10% OFF',
    cor: 'border-orange-500/30 bg-orange-500/5',
    corAtiva: 'border-orange-500 bg-orange-500/15',
    corBadge: 'text-orange-400',
    corPromo: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  },
  {
    id: 'sabado',
    label: 'Sábado',
    emoji: '🍔',
    promocao: null,
    cor: 'border-yellow-500/30 bg-yellow-500/5',
    corAtiva: 'border-yellow-500 bg-yellow-500/15',
    corBadge: 'text-yellow-400',
    corPromo: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  },
  {
    id: 'domingo',
    label: 'Domingo',
    emoji: '😍',
    promocao: null,
    cor: 'border-green-500/30 bg-green-500/5',
    corAtiva: 'border-green-500 bg-green-500/15',
    corBadge: 'text-green-400',
    corPromo: 'bg-green-500/10 text-green-300 border-green-500/20',
  },
]

function MensagemCard({ mensagem, index, cor }) {
  const [copiado, setCopiado] = useState(false)
  const [texto, setTexto] = useState(mensagem.texto)
  const [editando, setEditando] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className={`rounded-xl border ${cor} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#555] font-mono uppercase tracking-wider">
          Opção {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditando(v => !v)}
            className="text-[11px] text-[#666] hover:text-white transition-colors px-2 py-0.5 rounded bg-[#1a1a1a]"
          >
            {editando ? '✓ Fechar' : '✏️ Editar'}
          </button>
          <button
            onClick={copiar}
            className={`text-[11px] font-semibold px-3 py-1 rounded-lg border transition-all ${
              copiado
                ? 'bg-green-500/20 border-green-500/40 text-green-400'
                : 'bg-[#1a1a1a] border-[#333] text-white hover:bg-[#222]'
            }`}
          >
            {copiado ? '✅ Copiado!' : '📋 Copiar'}
          </button>
        </div>
      </div>

      {editando ? (
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={6}
          className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-[#f97316] leading-relaxed font-mono"
        />
      ) : (
        <p className="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">
          {texto}
        </p>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-[#444]">
          {texto.length} caracteres · {texto.split('\n').filter(Boolean).length} linhas
        </span>
        {editando && (
          <button
            onClick={() => setTexto(mensagem.texto)}
            className="text-[10px] text-[#555] hover:text-[#f97316] transition-colors"
          >
            ↩ Restaurar original
          </button>
        )}
      </div>
    </div>
  )
}

export default function MensagensPage() {
  const [diaAtivo, setDiaAtivo]       = useState('quinta')
  const [comPromocao, setComPromocao] = useState(true)
  const [quantidade, setQuantidade]   = useState(3)
  const [gerando, setGerando]         = useState(false)
  const [mensagens, setMensagens]     = useState([])
  const [diaMensagens, setDiaMensagens] = useState(null)
  const [toast, setToast]             = useState(null)
  const [instrucaoLivre, setInstrucaoLivre] = useState('')
  const [gerandoLivre, setGerandoLivre] = useState(false)
  const [mensagensLivres, setMensagensLivres] = useState([])

  const diaConfig   = DIAS.find(d => d.id === diaAtivo)
  const temPromocao = !!diaConfig?.promocao

  // Ao trocar de dia, reseta o toggle para "com promoção" se o dia tiver promo
  function selecionarDia(id) {
    setDiaAtivo(id)
    setMensagens([])
    setDiaMensagens(null)
    const dia = DIAS.find(d => d.id === id)
    if (!dia?.promocao) setComPromocao(false)
    else setComPromocao(true)
  }

  async function gerarMensagens() {
    setGerando(true)
    setMensagens([])
    try {
      const data = await api.post('/mensagens/gerar', {
        dia: diaAtivo,
        quantidade,
        comPromocao: temPromocao ? comPromocao : false,
      })
      setMensagens(data.mensagens || [])
      setDiaMensagens(diaAtivo)
      setToast({ message: `${data.mensagens?.length} mensagens geradas para ${data.dia}! ✅`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally {
      setGerando(false)
    }
  }

  async function gerarMensagensLivres() {
    if (!instrucaoLivre.trim()) return
    setGerandoLivre(true)
    setMensagensLivres([])
    try {
      const data = await api.post('/mensagens/gerar', {
        quantidade,
        instrucaoLivre,
      })
      setMensagensLivres(data.mensagens || [])
      setToast({ message: `${data.mensagens?.length} mensagens geradas! ✅`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally {
      setGerandoLivre(false)
    }
  }

  const diaConfigMensagens = DIAS.find(d => d.id === diaMensagens)

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader
        emoji="💬"
        title="Lista de Transmissão"
        description="Mensagens prontas para o WhatsApp — geradas por IA para cada dia da semana"
      />

      {/* Como funciona */}
      <div className="mb-6 p-4 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e] text-xs text-[#666] space-y-1.5">
        <p className="text-[#888] font-semibold mb-1">Como usar:</p>
        <p>1. Escolha o dia da semana e quantas opções gerar</p>
        <p>2. Clique em <strong className="text-[#aaa]">Gerar mensagens</strong> — a IA cria textos diferentes para o dia</p>
        <p>3. Edite se quiser, depois clique em <strong className="text-[#aaa]">Copiar</strong> e cole na lista de transmissão do WhatsApp</p>
      </div>

      {/* Seletor de dia */}
      <div className="mb-4">
        <p className="text-xs text-[#555] mb-2 uppercase tracking-wider font-semibold">Dia da semana</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DIAS.map(d => (
            <button
              key={d.id}
              onClick={() => selecionarDia(d.id)}
              className={`p-3 rounded-xl border text-center transition-all ${
                diaAtivo === d.id ? d.corAtiva : 'border-[#222] bg-[#111] hover:border-[#333]'
              }`}
            >
              <div className="text-xl mb-1">{d.emoji}</div>
              <div className={`text-xs font-bold mb-1 ${diaAtivo === d.id ? d.corBadge : 'text-[#666]'}`}>
                {d.label}
              </div>
              {d.promocao ? (
                <div className={`text-[9px] px-1.5 py-0.5 rounded-full border ${d.corPromo} leading-tight`}>
                  🏷️ promo
                </div>
              ) : (
                <div className="text-[9px] text-[#333]">normal</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle promoção — só aparece em quinta e sexta */}
      {temPromocao && (
        <div className={`mb-4 rounded-xl border overflow-hidden ${comPromocao ? diaConfig.corPromo : 'border-[#222] bg-[#111]'}`}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-bold ${comPromocao ? '' : 'text-[#666]'}`}>
                {comPromocao ? `🏷️ Mensagem promocional` : `💬 Mensagem normal`}
              </p>
              <p className={`text-[11px] mt-0.5 ${comPromocao ? 'opacity-80' : 'text-[#444]'}`}>
                {comPromocao
                  ? diaConfig.promocao
                  : `Sem mencionar promoção — só avisar que está aberto`}
              </p>
            </div>

            {/* Toggle switch */}
            <button
              onClick={() => setComPromocao(v => !v)}
              className={`relative shrink-0 w-12 h-6 rounded-full transition-all duration-200 ${
                comPromocao ? 'bg-[#f97316]' : 'bg-[#333]'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
                comPromocao ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      )}

      {/* Quantidade + botão gerar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl bg-[#111] border border-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666]">Opções:</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setQuantidade(n)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                quantidade === n
                  ? 'bg-[#f97316] text-black'
                  : 'bg-[#1a1a1a] text-[#666] hover:text-white border border-[#333]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <Button
          onClick={gerarMensagens}
          loading={gerando}
          className="flex-1 sm:flex-none"
        >
          {gerando
            ? `✨ Gerando para ${diaConfig?.label}...`
            : `✨ Gerar para ${diaConfig?.label} ${diaConfig?.emoji}`
          }
        </Button>
      </div>

      {/* Resultado */}
      {gerando && (
        <div className="text-center py-12 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-2xl mb-3 animate-pulse">{diaConfig?.emoji}</p>
          <p className="text-sm text-[#555]">Claude está escrevendo as mensagens...</p>
          <p className="text-[11px] text-[#333] mt-1">Isso leva alguns segundos</p>
        </div>
      )}

      {!gerando && mensagens.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{diaConfigMensagens?.emoji}</span>
            <p className="text-sm font-semibold text-white">
              {mensagens.length} mensagens para {diaConfigMensagens?.label}
            </p>
            <span className="ml-auto text-[11px] text-[#555]">Clique em Editar para personalizar</span>
          </div>

          {mensagens.map((m, i) => (
            <MensagemCard
              key={i}
              index={i}
              mensagem={m}
              cor={diaConfigMensagens?.cor || 'border-[#222] bg-[#111]'}
            />
          ))}

          <div className="p-4 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e] text-xs text-[#555] space-y-1">
            <p>💡 <strong className="text-[#777]">Dica:</strong> Gere novamente para ter mais opções diferentes</p>
            <p>📱 Abra o WhatsApp → sua Lista de Transmissão → cole a mensagem copiada</p>
          </div>
        </div>
      )}

      {!gerando && mensagens.length === 0 && (
        <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm text-[#555]">Selecione o dia e clique em Gerar</p>
          <p className="text-[11px] text-[#333] mt-1">
            A IA vai criar {quantidade} mensagem{quantidade > 1 ? 's' : ''} diferentes para você escolher
          </p>
        </div>
      )}

      {/* Divider */}
      <div className="my-8 border-t border-[#1e1e1e]" />

      {/* Instrução livre */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
        <h3 className="text-sm font-bold text-white mb-1">✍️ Descreva o que você quer</h3>
        <p className="text-xs text-[#666] mb-4">
          Escreva em texto livre o tema, promoção ou contexto da mensagem. A IA vai criar {quantidade} opção{quantidade > 1 ? 'ões' : ''} baseadas exatamente no que você pediu.
        </p>
        <textarea
          value={instrucaoLivre}
          onChange={e => setInstrucaoLivre(e.target.value)}
          placeholder='Ex: "Mensagem avisando que hoje tem promoção de aniversário, 20% OFF em tudo, válido só hoje"'
          rows={4}
          className="w-full bg-[#0f0f0f] border border-[#333] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] resize-none focus:outline-none focus:border-[#f97316] leading-relaxed mb-3"
        />
        <Button
          onClick={gerarMensagensLivres}
          loading={gerandoLivre}
          disabled={!instrucaoLivre.trim()}
          className="w-full mb-4"
        >
          {gerandoLivre ? '✨ Gerando...' : '✨ Gerar com minha descrição'}
        </Button>

        {gerandoLivre && (
          <div className="text-center py-8">
            <p className="text-2xl mb-2 animate-pulse">✍️</p>
            <p className="text-sm text-[#555]">Gerando mensagens personalizadas...</p>
          </div>
        )}

        {!gerandoLivre && mensagensLivres.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-[#555] mb-2">{mensagensLivres.length} mensagens geradas — edite e copie</p>
            {mensagensLivres.map((m, i) => (
              <MensagemCard
                key={i}
                index={i}
                mensagem={m}
                cor="border-[#f97316]/20 bg-[#f97316]/5"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
