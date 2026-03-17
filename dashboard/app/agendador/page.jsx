'use client'
import { useState, useRef } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    || 'duchjjeaw'
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'bruthus_unsigned'

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

async function uploadCloudinary(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', 'bruthus/stories')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Falha no upload para Cloudinary')
  return res.json()
}

function StoryCard({ story }) {
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

      // Pede preview ao backend com texto overlay gerado pelo Cloudinary
      const prev = await api.get(`/scheduler/story-preview/${story.id}?publicId=${data.public_id}`)
      setPreviewUrl(prev.url)

      // Salva no servidor
      await api.post('/scheduler/story-config', { tipo: story.id, publicId: data.public_id })
      setToast({ message: `${story.label} configurado! ✅`, type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setUploading(false) }
  }

  async function handleTestar() {
    if (!publicId) { setToast({ message: 'Configure a imagem de fundo primeiro.', type: 'error' }); return }
    setTestando(true)
    try {
      await api.post('/scheduler/testar-story', { tipo: story.id })
      setToast({ message: `Story publicado para teste! 📱`, type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setTestando(false) }
  }

  return (
    <div className={`rounded-xl border ${story.cor} p-5`}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-start gap-4">
        {/* Ícone + status */}
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className="text-3xl">{story.emoji}</div>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${publicId ? story.corPulse + ' animate-pulse' : 'bg-[#333]'}`} />
            <span className="text-[9px] text-[#555]">{publicId ? 'pronto' : 'aguarda'}</span>
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
          <p className="text-[11px] text-[#444] italic leading-relaxed">{story.textoOverlay}</p>
          <p className="text-[10px] text-[#333] mt-1">O texto é adicionado automaticamente pela Cloudinary em cima da sua foto.</p>

          {/* Preview */}
          {previewUrl && (
            <div className="mt-3">
              <p className="text-[10px] text-[#555] mb-1.5">Preview com texto overlay:</p>
              <img src={previewUrl} alt="Preview" className="w-20 rounded-lg border border-[#333] object-cover" />
            </div>
          )}

          {publicId && (
            <p className="text-[10px] text-[#444] font-mono mt-2 truncate">id: {publicId}</p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2 shrink-0">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-xs bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white px-3 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap">
            {uploading ? '⏳ Enviando...' : '📷 Imagem de fundo'}
          </button>
          <Button onClick={handleTestar} loading={testando} variant="secondary" size="sm" disabled={!publicId}>
            ▶️ Testar agora
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AgendadorPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        emoji="📅"
        title="Stories Automáticos"
        description="Publicados automaticamente de Quinta a Domingo — sem precisar fazer nada"
      />

      {/* Status */}
      <div className="mb-6 p-4 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-white">Agendador Ativo</p>
            <p className="text-xs text-[#555]">node-cron · America/Fortaleza · 2 stories/dia</p>
          </div>
        </div>
        <span className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Calendário */}
      <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Agenda Semanal</p>
        </div>
        <div className="grid grid-cols-7 divide-x divide-[#1e1e1e]">
          {diasSemana.map((d, i) => {
            const ativo  = diasAtivos.includes(i)
            const isHoje = i === hoje
            return (
              <div key={d} className={`p-3 text-center ${isHoje ? 'bg-[#f97316]/10' : ''} ${!ativo ? 'opacity-25' : ''}`}>
                <div className={`text-[11px] font-semibold mb-2 ${isHoje ? 'text-[#f97316]' : 'text-[#555]'}`}>{d}</div>
                {ativo ? (
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-yellow-400 bg-yellow-500/10 rounded px-1 py-0.5">⏰ 16h</div>
                    <div className="text-[9px] font-bold text-green-400 bg-green-500/10 rounded px-1 py-0.5">🚪 18h30</div>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#333]">—</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-2 border-t border-[#1e1e1e]">
          <p className="text-[10px] text-[#444]">Seg · Ter · Qua: fechado — sem stories</p>
        </div>
      </div>

      {/* Como funciona */}
      <div className="mb-6 p-4 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e] text-xs text-[#666] space-y-1.5">
        <p className="text-[#888] font-semibold mb-2">Como funciona:</p>
        <p>1. Você sobe <strong className="text-[#aaa]">1 foto de fundo</strong> para cada story (uma para 16h, outra para 18h30)</p>
        <p>2. O <strong className="text-[#aaa]">Cloudinary adiciona o texto</strong> automaticamente em cima da foto</p>
        <p>3. O servidor publica nos horários certos — <strong className="text-[#aaa]">você não precisa fazer nada</strong></p>
      </div>

      {/* Cards de story */}
      <div className="space-y-4 mb-6">
        {STORIES.map(s => <StoryCard key={s.id} story={s} />)}
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
