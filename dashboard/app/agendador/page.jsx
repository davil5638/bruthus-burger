'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const AGENDAMENTOS = [
  { dia: 'segunda',  label: 'Segunda-feira', hora: '18h', emoji: '🍔', tipo: 'Burger Clássico',        cron: '0 18 * * 1', cor: 'border-orange-500/30 bg-orange-500/5'  },
  { dia: 'quarta',   label: 'Quarta-feira',  hora: '18h', emoji: '🍟', tipo: 'Batata / Combo',         cron: '0 18 * * 3', cor: 'border-yellow-500/30 bg-yellow-500/5'  },
  { dia: 'quinta',   label: 'Quinta-feira',  hora: '18h', emoji: '🎉', tipo: 'Quinta do Hambúrguer',   cron: '0 18 * * 4', cor: 'border-purple-500/30 bg-purple-500/5'  },
  { dia: 'sexta',    label: 'Sexta-feira',   hora: '19h', emoji: '🔥', tipo: 'Smash Burger',           cron: '0 19 * * 5', cor: 'border-red-500/30 bg-red-500/5'        },
  { dia: 'domingo',  label: 'Domingo',       hora: '17h', emoji: '👨‍👩‍👧‍👦', tipo: 'Combo Família',    cron: '0 17 * * 0', cor: 'border-blue-500/30 bg-blue-500/5'      },
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
      setToast({ message: `Teste de "${dia}" executado! Verifique o console do servidor.`, type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoadingDia(null) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📅" title="Agendador Automático" description="Posts programados para a semana — roda automaticamente quando o servidor está ativo" />

      {/* Status do servidor */}
      <div className="mb-6 p-4 rounded-xl bg-[#111] border border-[#1e1e1e] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-white">Agendador Ativo</p>
            <p className="text-xs text-[#555]">node-cron rodando • Timezone: America/Fortaleza</p>
          </div>
        </div>
        <span className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-lg">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} — {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Mini calendário visual */}
      <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Semana Atual</p>
        </div>
        <div className="grid grid-cols-7 divide-x divide-[#1e1e1e]">
          {diasSemana.map((d, i) => {
            const agendado = AGENDAMENTOS.find(a =>
              (a.dia === 'domingo'  && i === 0) ||
              (a.dia === 'segunda' && i === 1) ||
              (a.dia === 'quarta'  && i === 3) ||
              (a.dia === 'quinta'  && i === 4) ||
              (a.dia === 'sexta'   && i === 5)
            )
            const isHoje = i === hoje
            return (
              <div key={d} className={`p-3 text-center ${isHoje ? 'bg-[#f97316]/10' : ''}`}>
                <div className={`text-[11px] font-semibold mb-1 ${isHoje ? 'text-[#f97316]' : 'text-[#555]'}`}>{d}</div>
                {agendado ? (
                  <>
                    <div className="text-sm">{agendado.emoji}</div>
                    <div className="text-[9px] text-[#f97316] font-bold mt-0.5">{agendado.hora}</div>
                  </>
                ) : (
                  <div className="text-lg text-[#222]">·</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Cards de agendamento */}
      <div className="space-y-3 mb-8">
        {AGENDAMENTOS.map(a => (
          <div key={a.dia} className={`rounded-xl border ${a.cor} p-5 flex items-center gap-4`}>
            <div className="text-3xl">{a.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-sm">{a.label}</span>
                <span className="text-xs bg-[#1a1a1a] text-[#f97316] font-bold px-2 py-0.5 rounded-full">{a.hora}</span>
              </div>
              <p className="text-xs text-[#666] mt-0.5">{a.tipo}</p>
              <p className="text-[10px] text-[#444] mt-1 font-mono">{a.cron}</p>
            </div>
            <Button onClick={() => testar(a.dia)} loading={loadingDia === a.dia} variant="secondary" size="sm">
              ▶️ Testar
            </Button>
          </div>
        ))}
      </div>

      {/* Configuração de imagens */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-6">
        <h3 className="text-sm font-bold text-white mb-1">🖼️ Configurar Imagens por Dia</h3>
        <p className="text-xs text-[#666] mb-4">Adicione as variáveis abaixo no arquivo <code className="bg-[#1a1a1a] px-1 rounded text-[#f97316]">.env</code> para que cada dia use a imagem certa:</p>

        <div className="rounded-lg bg-[#0f0f0f] border border-[#1e1e1e] p-4 font-mono text-xs space-y-1">
          {AGENDAMENTOS.map(a => (
            <div key={a.dia} className="flex gap-2">
              <span className="text-[#f97316]">IMG_{a.dia.toUpperCase()}</span>
              <span className="text-[#555]">=</span>
              <span className="text-[#888]">https://url-da-imagem-de-{a.dia}.jpg</span>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          <strong>💡 Dica:</strong> Depois de alterar o .env, reinicie o servidor (<code className="bg-[#0f0f0f] px-1 rounded">npm start</code>) para as novas imagens entrarem em vigor.
        </div>
      </div>

      {/* Relatório extra */}
      <div className="mt-4 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
        <h3 className="text-sm font-bold text-white mb-1">📊 Relatório Semanal Automático</h3>
        <p className="text-xs text-[#666]">
          Todo <strong className="text-white">Segunda às 9h</strong>, o sistema gera automaticamente um relatório de performance dos anúncios Meta Ads dos últimos 7 dias e exibe no console do servidor.
        </p>
      </div>
    </div>
  )
}
