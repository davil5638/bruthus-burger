'use client'
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const STORIES = [
  {
    id: 'teaser',
    label: 'Story das 16h',
    hora: '16:00',
    emoji: '⏰',
    descricao: 'Avisa que hoje tem Bruthus às 18h30',
    textoOverlay: '"HOJE TEM BRUTHUS! · Das 18h30 — Delivery e Retirada"',
    cor: 'border-yellow-500/30 bg-yellow-500/5',
    corBadge: 'text-yellow-400',
    corPulse: 'bg-yellow-500',
  },
  {
    id: 'abertura',
    label: 'Story das 18h30',
    hora: '18:30',
    emoji: '🚪',
    descricao: 'Avisa que já estão entregando + link do pedido',
    textoOverlay: '"ESTAMOS ABERTOS! · Já estamos entregando · [link]"',
    cor: 'border-green-500/30 bg-green-500/5',
    corBadge: 'text-green-400',
    corPulse: 'bg-green-500',
  },
]

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const hoje = new Date().getDay()
const diasAtivos = [0, 4, 5, 6] // Dom, Qui, Sex, Sáb


function StoryCard({ story, pausado }) {
  const [testando, setTestando] = useState(false)
  const [toast, setToast]       = useState(null)

  async function handleTestar() {
    setTestando(true)
    try {
      await api.post('/scheduler/testar-story', { tipo: story.id })
      setToast({ message: `Story publicado para teste! 📱`, type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setTestando(false) }
  }

  return (
    <div className={`rounded-xl border ${pausado ? 'opacity-50 grayscale' : ''} ${story.cor} p-5 transition-all`}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-start gap-4">
        {/* Ícone + status */}
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className="text-3xl">{story.emoji}</div>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${pausado ? 'bg-[#555]' : story.corPulse + ' animate-pulse'}`} />
            <span className="text-[9px] text-[#555]">{pausado ? 'pausado' : 'automático'}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-white text-sm">{story.label}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] ${story.corBadge}`}>{story.hora}</span>
            <span className="text-[10px] text-[#555] font-mono">Qui · Sex · Sáb · Dom</span>
          </div>
          <p className="text-xs text-[#777] mb-1">{story.descricao}</p>
          <p className="text-[11px] text-[#555] mt-1">📸 Foto sorteada automaticamente da pasta do Cloudinary · ✍️ Texto gerado por IA a cada post</p>
        </div>

        {/* Ações */}
        <div className="shrink-0">
          <Button onClick={handleTestar} loading={testando} variant="secondary" size="sm" disabled={pausado}>
            ▶️ Testar agora
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AgendadorPage() {
  const [pausado, setPausado]       = useState(false)
  const [toggling, setToggling]     = useState(false)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [toast, setToast]           = useState(null)

  // Carrega o status atual do agendador ao abrir a página
  useEffect(() => {
    api.get('/scheduler/status')
      .then(d => { setPausado(d.pausado); setStatusLoaded(true) })
      .catch(() => setStatusLoaded(true))
  }, [])

  async function toggleAgendador() {
    setToggling(true)
    try {
      if (pausado) {
        await api.post('/scheduler/retomar')
        setPausado(false)
        setToast({ message: '▶️ Agendador retomado! Stories voltarão a ser postados automaticamente.', type: 'success' })
      } else {
        await api.post('/scheduler/pausar')
        setPausado(true)
        setToast({ message: '⏸️ Agendador pausado. Nenhum story automático será postado.', type: 'success' })
      }
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setToggling(false) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader
        emoji="📅"
        title="Stories Automáticos"
        description="Publicados automaticamente de Quinta a Domingo — sem precisar fazer nada"
      />

      {/* ─── STATUS + TOGGLE PAUSAR/RETOMAR ─── */}
      <div className={`mb-6 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
        pausado ? 'border-red-500/30 bg-red-500/5' : 'border-[#1e1e1e] bg-[#111]'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full transition-all ${pausado ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
          <div>
            <p className={`text-sm font-semibold ${pausado ? 'text-red-400' : 'text-white'}`}>
              {!statusLoaded ? 'Carregando...' : pausado ? '⏸️ Agendador Pausado' : '▶️ Agendador Ativo'}
            </p>
            <p className="text-xs text-[#555]">
              {pausado
                ? 'Nenhum story será postado até você retomar'
                : 'node-cron · America/Fortaleza · 2 stories/dia'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>

          <button onClick={toggleAgendador} disabled={toggling || !statusLoaded}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2 ${
              pausado
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-400 hover:text-white'
            }`}>
            {toggling
              ? <span className="animate-spin">⟳</span>
              : pausado ? '▶️ Retomar' : '⏸️ Pausar'}
          </button>
        </div>
      </div>

      {pausado && (
        <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <p className="text-xs text-red-400">
            O agendador está pausado. Os stories das <strong>16h e 18h30</strong> não serão postados até você clicar em <strong>"Retomar"</strong>.
          </p>
        </div>
      )}

      {/* Calendário */}
      <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Agenda Semanal</p>
        </div>
        <div className="overflow-x-auto">
        <div className="grid grid-cols-7 divide-x divide-[#1e1e1e] min-w-[320px]">
          {diasSemana.map((d, i) => {
            const ativo  = diasAtivos.includes(i)
            const isHoje = i === hoje
            return (
              <div key={d} className={`p-3 text-center ${isHoje ? 'bg-[#f97316]/10' : ''} ${!ativo ? 'opacity-25' : ''} ${pausado && ativo ? 'opacity-30' : ''}`}>
                <div className={`text-[11px] font-semibold mb-2 ${isHoje ? 'text-[#f97316]' : 'text-[#555]'}`}>{d}</div>
                {ativo ? (
                  <div className="space-y-1">
                    <div className={`text-[9px] font-bold rounded px-1 py-0.5 ${pausado ? 'text-[#555] bg-[#1a1a1a]' : 'text-yellow-400 bg-yellow-500/10'}`}>⏰ 16h</div>
                    <div className={`text-[9px] font-bold rounded px-1 py-0.5 ${pausado ? 'text-[#555] bg-[#1a1a1a]' : 'text-green-400 bg-green-500/10'}`}>🚪 18h30</div>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#333]">—</div>
                )}
              </div>
            )
          })}
        </div>
        </div>
        <div className="px-5 py-2 border-t border-[#1e1e1e]">
          <p className="text-[10px] text-[#444]">Seg · Ter · Qua: fechado — sem stories</p>
        </div>
      </div>

      {/* Como funciona */}
      <div className="mb-6 p-4 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e] text-xs text-[#666] space-y-1.5">
        <p className="text-[#888] font-semibold mb-2">Como funciona:</p>
        <p>1. O sistema sorteia <strong className="text-[#aaa]">uma foto aleatória</strong> da pasta "midias bruthus geral" no Cloudinary</p>
        <p>2. A <strong className="text-[#aaa]">IA gera o texto</strong> automaticamente — diferente a cada post, com cor e estilo variados</p>
        <p>3. O servidor publica nos horários certos — <strong className="text-[#aaa]">você não precisa fazer nada</strong></p>
        <p>4. Para pausar temporariamente, use o botão <strong className="text-[#aaa]">"⏸️ Pausar"</strong> acima</p>
      </div>

      {/* Cards de story */}
      <div className="space-y-4 mb-6">
        {STORIES.map(s => <StoryCard key={s.id} story={s} pausado={pausado} />)}
      </div>

      {/* Aviso Render */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 text-xs text-[#555] space-y-1.5">
        <p>⚠️ O agendador só roda enquanto o servidor estiver ativo no Render.</p>
        <p>
          💡 Para garantir que não dorme, configure um ping gratuito em{' '}
          <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-[#f97316] hover:underline">
            cron-job.org
          </a>
          {' '}apontando para a URL do seu backend + <code className="bg-[#1a1a1a] px-1 rounded">/status</code> a cada 10 minutos.
        </p>
      </div>
    </div>
  )
}
