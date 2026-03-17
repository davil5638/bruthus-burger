'use client'
import { useState, useRef } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'duchjjeaw'
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'bruthus_unsigned'
const CUPOM_SEXTA = 'SEXTAOFF10'

const AGENDAMENTOS = [
  {
    dia: 'quinta', label: 'Quinta-feira', hora: '18h',
    emoji: '🍔', tipo: 'Quinta do Hambúrguer — promoção fixa',
    cron: '0 18 * * 4', cor: 'border-orange-500/30 bg-orange-500/5',
    obs: 'Publica toda quinta',
  },
  {
    dia: 'sexta', label: 'Sexta-feira', hora: '18h',
    emoji: '🔥', tipo: `Cupom ${CUPOM_SEXTA} — 10% OFF`,
    cron: '0 18 * * 5', cor: 'border-red-500/30 bg-red-500/5',
    obs: 'Publica toda sexta', badge: CUPOM_SEXTA,
  },
  {
    dia: 'sabado', label: 'Sábado', hora: '18h',
    emoji: '🎉', tipo: 'Promoção rotativa (Batata · Smash · Refri)',
    cron: '0 18 * * 6', cor: 'border-purple-500/30 bg-purple-500/5',
    obs: 'Publica todo sábado', badge: '1× por semana',
  },
  {
    dia: 'domingo', label: 'Domingo', hora: '17h',
    emoji: '❤️', tipo: 'Família & Casal — post aconchegante',
    cron: '0 17 * * 0', cor: 'border-blue-500/30 bg-blue-500/5',
    obs: 'Publica todo domingo',
  },
]

const STORIES = [
  {
    id: 'teaser',
    label: 'Story das 16h',
    hora: '16:00',
    emoji: '⏰',
    descricao: 'Avisa que hoje tem Bruthus às 18h30',
    texto: '"HOJE TEM BRUTHUS! · Das 18h30 — Delivery e Retirada"',
    cor: 'border-yellow-500/30 bg-yellow-500/5',
    corBadge: 'text-yellow-400',
  },
  {
    id: 'abertura',
    label: 'Story das 18h30',
    hora: '18:30',
    emoji: '🚪',
    descricao: 'Avisa que já estão entregando + link do pedido',
    texto: '"ESTAMOS ABERTOS! · Já estamos entregando · [link do pedido]"',
    cor: 'border-green-500/30 bg-green-500/5',
    corBadge: 'text-green-400',
  },
]

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const hoje = new Date().getDay()

// Faz upload para Cloudinary sem SDK (fetch direto)
async function uploadCloudinary(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', 'bruthus/stories')

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) throw new Error('Falha no upload para Cloudinary')
  const data = await res.json()
  return data // .public_id, .secure_url, etc.
}

function StoryCard({ story, onConfigured }) {
  const [uploading, setUploading]   = useState(false)
  const [testando, setTestando]     = useState(false)
  const [publicId, setPublicId]     = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [toast, setToast]           = useState(null)
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const data = await uploadCloudinary(file)
      setPublicId(data.public_id)

      // Pede preview ao backend com overlay de texto
      const prev = await api.get(`/scheduler/story-preview/${story.id}?publicId=${data.public_id}`)
      setPreviewUrl(prev.url)

      // Salva no servidor
      await api.post('/scheduler/story-config', { tipo: story.id, publicId: data.public_id })
      setToast({ message: `Imagem do ${story.label} configurada! ✅`, type: 'success' })
      onConfigured?.(story.id, data.public_id)
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  async function handleTestar() {
    setTestando(true)
    try {
      await api.post('/scheduler/testar-story', { tipo: story.id })
      setToast({ message: `Story "${story.label}" publicado para teste! 📱`, type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setTestando(false) }
  }

  return (
    <div className={`rounded-xl border ${story.cor} p-5`}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-start gap-4">
        <div className="text-3xl shrink-0">{story.emoji}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-white text-sm">{story.label}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] ${story.corBadge}`}>{story.hora}</span>
            <span className="text-[10px] text-[#555] font-mono">Qui-Dom</span>
          </div>
          <p className="text-xs text-[#777] mb-1">{story.descricao}</p>
          <p className="text-[11px] text-[#444] italic">{story.texto}</p>

          {/* Preview */}
          {previewUrl && (
            <div className="mt-3">
              <p className="text-[10px] text-[#555] mb-1">Preview com texto overlay:</p>
              <img
                src={previewUrl}
                alt="Preview do story"
                className="w-24 h-auto rounded-lg border border-[#333] object-cover"
              />
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2 shrink-0">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white px-3 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {uploading ? '⏳ Enviando...' : '📷 Imagem de fundo'}
          </button>
          <Button
            onClick={handleTestar}
            loading={testando}
            variant="secondary"
            size="sm"
            disabled={!publicId}
          >
            ▶️ Testar agora
          </Button>
        </div>
      </div>

      {publicId && (
        <div className="mt-3 p-2 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e]">
          <p className="text-[10px] text-[#555] font-mono truncate">public_id: {publicId}</p>
        </div>
      )}
    </div>
  )
}

export default function AgendadorPage() {
  const [loadingDia, setLoadingDia] = useState(null)
  const [toast, setToast]           = useState(null)

  async function testar(dia) {
    setLoadingDia(dia)
    try {
      await api.post('/scheduler/testar', { dia })
      setToast({ message: `Teste "${dia}" executado! Veja o console do servidor.`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingDia(null) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader
        emoji="📅"
        title="Agendador Automático"
        description="Stories de Qui a Dom às 16h e 18h30 · 1 post de feed por semana"
      />

      {/* Status */}
      <div className="mb-6 p-4 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-white">Agendador Ativo</p>
            <p className="text-xs text-[#555]">node-cron · Timezone: America/Fortaleza · Qui a Dom</p>
          </div>
        </div>
        <span className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Calendário visual */}
      <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Semana Atual</p>
        </div>
        <div className="grid grid-cols-7 divide-x divide-[#1e1e1e]">
          {diasSemana.map((d, i) => {
            const temPost = [0, 4, 5, 6].includes(i)
            const isHoje = i === hoje
            return (
              <div key={d} className={`p-3 text-center ${isHoje ? 'bg-[#f97316]/10' : ''} ${!temPost ? 'opacity-30' : ''}`}>
                <div className={`text-[11px] font-semibold mb-1 ${isHoje ? 'text-[#f97316]' : 'text-[#555]'}`}>{d}</div>
                {temPost ? (
                  <div className="space-y-0.5">
                    <div className="text-[9px] text-yellow-400 font-bold">📱 16h</div>
                    <div className="text-[9px] text-green-400 font-bold">🚪 18h30</div>
                    <div className="text-[9px] text-[#f97316] font-bold">🍔 feed*</div>
                  </div>
                ) : (
                  <div className="text-xs text-[#333] mt-1">—</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-2 border-t border-[#1e1e1e] flex items-center gap-4">
          <span className="text-[10px] text-[#444]">📱 Stories toda semana · 🍔 feed* 1× por semana (rotativo)</span>
        </div>
      </div>

      {/* ─── STORIES AUTOMÁTICOS ─── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">📱</span>
          <h2 className="text-sm font-bold text-white">Stories Automáticos — Qui a Dom</h2>
          <span className="text-[10px] text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded-full ml-auto">Cloudinary overlay</span>
        </div>

        <div className="rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] p-3 mb-4 text-xs text-[#666]">
          💡 Suba uma imagem de fundo (foto do burger, fundo escuro, etc.) e o sistema adiciona o texto automaticamente via Cloudinary antes de postar.
        </div>

        <div className="space-y-3">
          {STORIES.map(story => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      </div>

      {/* ─── POST DE FEED ─── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🍔</span>
          <h2 className="text-sm font-bold text-white">Post de Feed — 1× por semana</h2>
          <span className="text-[10px] text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded-full ml-auto">Rotativo</span>
        </div>

        <div className="space-y-3">
          {AGENDAMENTOS.map(a => (
            <div key={a.dia} className={`rounded-xl border ${a.cor} p-5 flex items-center gap-4`}>
              <div className="text-3xl shrink-0">{a.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-bold text-white text-sm">{a.label}</span>
                  <span className="text-xs bg-[#1a1a1a] text-[#f97316] font-bold px-2 py-0.5 rounded-full">{a.hora}</span>
                  {a.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#888]">{a.badge}</span>
                  )}
                </div>
                <p className="text-xs text-[#777]">{a.tipo}</p>
                <p className="text-[10px] text-[#444] mt-0.5 font-mono">{a.cron}</p>
                <p className="text-[10px] text-[#555] mt-0.5 italic">{a.obs}</p>
              </div>
              <Button onClick={() => testar(a.dia)} loading={loadingDia === a.dia} variant="secondary" size="sm" className="shrink-0">
                ▶️ Testar
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Nota de rodapé */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 text-xs text-[#555] space-y-1">
        <p>⚠️ O agendador só roda enquanto o servidor estiver ativo no Render.</p>
        <p>💡 O Render gratuito dorme após 15min de inatividade — use <span className="text-[#f97316]">cron-job.org</span> para pingar <code>/status</code> a cada 10min.</p>
      </div>
    </div>
  )
}
