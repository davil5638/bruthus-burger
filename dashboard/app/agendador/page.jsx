'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const CUPOM_SEXTA = 'SEXTAOFF10'

const AGENDAMENTOS = [
  {
    dia: 'quinta', label: 'Quinta-feira', hora: '18h',
    emoji: '🍔', tipo: 'Quinta do Hambúrguer — promoção fixa',
    cron: '0 18 * * 4',
    cor: 'border-orange-500/30 bg-orange-500/5',
    envVar: 'IMG_QUINTA',
    obs: 'Publica toda quinta',
  },
  {
    dia: 'sexta', label: 'Sexta-feira', hora: '18h',
    emoji: '🔥', tipo: `Cupom ${CUPOM_SEXTA} — 10% OFF`,
    cron: '0 18 * * 5',
    cor: 'border-red-500/30 bg-red-500/5',
    envVar: 'IMG_SEXTA',
    obs: 'Publica toda sexta',
    badge: CUPOM_SEXTA,
  },
  {
    dia: 'sabado', label: 'Sábado', hora: '18h',
    emoji: '🎉', tipo: 'Promoção rotativa (Batata · Smash · Refri)',
    cron: '0 18 * * 6',
    cor: 'border-purple-500/30 bg-purple-500/5',
    envVar: 'IMG_SABADO',
    obs: 'Só publica na 1ª e 3ª semana do mês',
    badge: '2× por mês',
  },
  {
    dia: 'domingo', label: 'Domingo', hora: '17h',
    emoji: '❤️', tipo: 'Família & Casal — post aconchegante',
    cron: '0 17 * * 0',
    cor: 'border-blue-500/30 bg-blue-500/5',
    envVar: 'IMG_DOMINGO',
    obs: 'Publica todo domingo',
  },
]

const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const hoje = new Date().getDay()

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

      <PageHeader emoji="📅" title="Agendador Automático" description="Posts programados de Quinta a Domingo — roda enquanto o servidor estiver ativo" />

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

      {/* Calendário visual semanal */}
      <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Semana Atual</p>
        </div>
        <div className="grid grid-cols-7 divide-x divide-[#1e1e1e]">
          {diasSemana.map((d, i) => {
            const agendado = AGENDAMENTOS.find(a =>
              (a.dia === 'domingo' && i === 0) ||
              (a.dia === 'quinta'  && i === 4) ||
              (a.dia === 'sexta'   && i === 5) ||
              (a.dia === 'sabado'  && i === 6)
            )
            const isHoje = i === hoje
            const fechado = !agendado
            return (
              <div key={d} className={`p-3 text-center ${isHoje ? 'bg-[#f97316]/10' : ''} ${fechado ? 'opacity-30' : ''}`}>
                <div className={`text-[11px] font-semibold mb-1 ${isHoje ? 'text-[#f97316]' : 'text-[#555]'}`}>{d}</div>
                {agendado ? (
                  <>
                    <div className="text-sm">{agendado.emoji}</div>
                    <div className="text-[9px] text-[#f97316] font-bold mt-0.5">{agendado.hora}</div>
                  </>
                ) : (
                  <div className="text-xs text-[#333] mt-1">—</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-2 border-t border-[#1e1e1e]">
          <p className="text-[10px] text-[#444]">Seg · Ter · Qua: fechado · Seg · Ter · Qua não há posts automáticos</p>
        </div>
      </div>

      {/* Cards de cada dia */}
      <div className="space-y-3 mb-8">
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

      {/* Configurar imagens */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-6 mb-4">
        <h3 className="text-sm font-bold text-white mb-1">🖼️ Configurar Imagens por Dia</h3>
        <p className="text-xs text-[#666] mb-4">
          Adicione as variáveis abaixo no <code className="bg-[#1a1a1a] px-1 rounded text-[#f97316]">.env</code> — use URLs públicas (Cloudinary, ImgBB, etc.):
        </p>
        <div className="rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] p-4 font-mono text-xs space-y-1.5">
          {AGENDAMENTOS.map(a => (
            <div key={a.dia} className="flex gap-2 items-center">
              <span className="text-[#f97316] shrink-0">{a.envVar}</span>
              <span className="text-[#555]">=</span>
              <span className="text-[#888] truncate">https://res.cloudinary.com/.../foto-{a.dia}.jpg</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sábado rotativo explicado */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
        <h3 className="text-sm font-bold text-white mb-2">🎉 Sábado — Rotação Automática</h3>
        <p className="text-xs text-[#888] mb-3">O sistema detecta automaticamente a semana do mês e usa a promoção certa:</p>
        <div className="space-y-2 text-xs">
          {[
            ['1ª semana', '🍟', 'Batata Grátis no combo'],
            ['2ª semana', '💥', 'Smash Promocional (preço especial)'],
            ['3ª semana', '🥤', 'Refri Grátis no combo'],
            ['4ª semana', '🍟', 'Batata Grátis (repete ciclo)'],
          ].map(([sem, em, desc]) => (
            <div key={sem} className="flex items-center gap-3 p-2 rounded-lg bg-[#0f0f0f]">
              <span className="text-[#555] w-20 shrink-0">{sem}</span>
              <span>{em}</span>
              <span className="text-[#888]">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#555] mt-3">
          Se for a 2ª ou 4ª semana → sem promoção (o sistema pula automaticamente sem publicar nada)
        </p>
      </div>
    </div>
  )
}
