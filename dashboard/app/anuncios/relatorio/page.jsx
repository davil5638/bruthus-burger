'use client'
import { useState } from 'react'
import { api } from '../../../lib/api'
import PageHeader from '../../../components/PageHeader'
import { Toast } from '../../../components/Toast'

function fmt(v, decimals = 2) {
  return Number(v || 0).toFixed(decimals)
}

function fmtBRL(v) {
  return `R$ ${fmt(v)}`
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('pt-BR')
}

function statusBadge(status) {
  const map = {
    ACTIVE:   { label: 'Ativa',    cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    PAUSED:   { label: 'Pausada',  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    ARCHIVED: { label: 'Arquivada',cls: 'bg-[#222] text-[#666] border-[#333]' },
    DELETED:  { label: 'Deletada', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  }
  const s = map[status] || { label: status, cls: 'bg-[#222] text-[#666]' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

function avaliarMetrica(metrica, valor) {
  const v = parseFloat(valor)
  if (metrica === 'ctr') {
    if (v >= 2)   return { cor: 'text-green-400',  icon: '✅', label: 'Ótimo' }
    if (v >= 1)   return { cor: 'text-yellow-400', icon: '⚠️', label: 'Ok' }
    return         { cor: 'text-red-400',   icon: '❌', label: 'Baixo' }
  }
  if (metrica === 'cpc') {
    if (v <= 1.5) return { cor: 'text-green-400',  icon: '✅', label: 'Ótimo' }
    if (v <= 3)   return { cor: 'text-yellow-400', icon: '⚠️', label: 'Ok' }
    return         { cor: 'text-red-400',   icon: '❌', label: 'Caro' }
  }
  if (metrica === 'freq') {
    if (v >= 1.5 && v <= 3) return { cor: 'text-green-400', icon: '✅', label: 'Ideal' }
    if (v > 3)   return { cor: 'text-red-400',   icon: '❌', label: 'Saturado' }
    return         { cor: 'text-yellow-400', icon: '⚠️', label: 'Baixa' }
  }
  return null
}

function SummaryCard({ label, value, sub, cor = '#f97316' }) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
      <p className="text-xs text-[#666] mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: cor }}>{value}</p>
      {sub && <p className="text-[11px] text-[#555] mt-0.5">{sub}</p>}
    </div>
  )
}

function CampanhaCard({ camp }) {
  const [aberta, setAberta] = useState(false)
  if (camp.erro || !camp.impressoes) {
    return (
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 opacity-60">
        <div className="flex items-center gap-3">
          {statusBadge(camp.status)}
          <p className="text-sm text-[#777] truncate">{camp.nome}</p>
          {camp.erro && <span className="text-[10px] text-red-400 ml-auto">sem dados</span>}
        </div>
      </div>
    )
  }

  const ctrInfo  = avaliarMetrica('ctr',  camp.ctr)
  const cpcInfo  = avaliarMetrica('cpc',  camp.cpc)
  const freqInfo = avaliarMetrica('freq', camp.frequencia)

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setAberta(!aberta)}
        className="w-full text-left p-4 hover:bg-[#111] transition-colors"
      >
        <div className="flex items-start gap-3 flex-wrap">
          {statusBadge(camp.status)}
          <p className="text-sm text-white font-medium flex-1 min-w-0 truncate">{camp.nome}</p>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="text-sm font-bold text-[#f97316]">{fmtBRL(camp.gasto)}</span>
            <span className="text-[#555] text-sm">{aberta ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Mini métricas */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="text-center">
            <p className="text-[10px] text-[#555]">Impressões</p>
            <p className="text-xs font-bold text-white">{fmtNum(camp.impressoes)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#555]">CTR</p>
            <p className={`text-xs font-bold ${ctrInfo?.cor}`}>{fmt(camp.ctr)}% {ctrInfo?.icon}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#555]">CPC</p>
            <p className={`text-xs font-bold ${cpcInfo?.cor}`}>{fmtBRL(camp.cpc)} {cpcInfo?.icon}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#555]">Freq.</p>
            <p className={`text-xs font-bold ${freqInfo?.cor}`}>{fmt(camp.frequencia)}x {freqInfo?.icon}</p>
          </div>
        </div>
      </button>

      {/* Detalhes expandidos */}
      {aberta && (
        <div className="border-t border-[#1e1e1e] p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Alcance',      value: fmtNum(camp.alcance) },
              { label: 'Cliques',      value: fmtNum(camp.cliques) },
              { label: 'Link Cliques', value: fmtNum(camp.linkCliques) },
              { label: 'CPM',          value: fmtBRL(camp.cpm) },
            ].map(m => (
              <div key={m.label} className="bg-[#151515] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[#555] mb-1">{m.label}</p>
                <p className="text-sm font-bold text-white">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Avaliações */}
          <div className="space-y-1.5">
            {ctrInfo && (
              <p className={`text-xs ${ctrInfo.cor}`}>
                {ctrInfo.icon} <strong>CTR {ctrInfo.label}</strong>
                {parseFloat(camp.ctr) < 1 ? ' — teste novos criativos ou ajuste o público' : parseFloat(camp.ctr) >= 2 ? ' — excelente! considere aumentar o orçamento' : ' — pode melhorar com novos criativos'}
              </p>
            )}
            {cpcInfo && (
              <p className={`text-xs ${cpcInfo.cor}`}>
                {cpcInfo.icon} <strong>CPC {cpcInfo.label}</strong>
                {parseFloat(camp.cpc) > 3 ? ' — público muito amplo ou criativo fraco' : parseFloat(camp.cpc) <= 1.5 ? ' — eficiente, bom retorno' : ' — aceitável para o mercado'}
              </p>
            )}
            {freqInfo && (
              <p className={`text-xs ${freqInfo.cor}`}>
                {freqInfo.icon} <strong>Frequência {freqInfo.label}</strong>
                {parseFloat(camp.frequencia) > 3 ? ' — público saturado, mude o criativo ou amplie o público' : ' — frequência saudável'}
              </p>
            )}
          </div>

          <p className="text-[10px] text-[#444]">
            Objetivo: {camp.objetivo} · Criada: {camp.criada ? new Date(camp.criada).toLocaleDateString('pt-BR') : '—'}
            {camp.orcamentoDiario ? ` · Orçamento: ${fmtBRL(camp.orcamentoDiario)}/dia` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

export default function RelatorioPage() {
  const [dados, setDados]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)
  const [verAnalise, setVerAnalise] = useState(false)

  async function carregar() {
    setLoading(true)
    setDados(null)
    try {
      const d = await api.get('/ads/relatorio')
      setDados(d)
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  function exportarJSON() {
    if (!dados) return
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `relatorio-ads-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const r = dados?.resumo

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader
        emoji="📊"
        title="Relatório de Campanhas"
        description="Métricas completas + análise IA de todas as campanhas Meta Ads"
      />

      {/* Botão gerar */}
      <button
        onClick={carregar}
        disabled={loading}
        className="w-full mb-6 py-3 rounded-xl bg-[#f97316] hover:bg-[#ea6a0a] disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
      >
        {loading ? <><span className="animate-spin">⟳</span> Buscando dados do Meta Ads...</> : '📊 Gerar Relatório Completo'}
      </button>

      {dados && (
        <>
          {/* Resumo geral */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <SummaryCard label="Total Investido"  value={`R$ ${fmt(r.totalGasto)}`} sub={`${r.totalCampanhas} campanhas`} />
            <SummaryCard label="Impressões"        value={fmtNum(r.totalImpressoes)} sub="exibições totais" cor="#a78bfa" />
            <SummaryCard label="Cliques"           value={fmtNum(r.totalCliques)}    sub="cliques totais" cor="#34d399" />
            <SummaryCard label="Alcance"           value={fmtNum(r.totalAlcance)}    sub="pessoas únicas" cor="#60a5fa" />
            <SummaryCard label="CTR Médio"         value={`${fmt(r.ctrMedio)}%`}     sub="benchmark: >1.5%" cor={parseFloat(r.ctrMedio) >= 1.5 ? '#34d399' : '#f87171'} />
            <SummaryCard label="CPC Médio"         value={`R$ ${fmt(r.cpcMedio)}`}   sub="benchmark: <R$1.50" cor={parseFloat(r.cpcMedio) <= 1.5 ? '#34d399' : '#f87171'} />
          </div>

          {/* Campanhas */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Campanhas ({dados.campanhas.length})</p>
            <div className="space-y-2">
              {dados.campanhas.map(c => <CampanhaCard key={c.id} camp={c} />)}
            </div>
          </div>

          {/* Análise IA */}
          {dados.analise && (
            <div className="rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 p-5 mb-6">
              <button
                onClick={() => setVerAnalise(!verAnalise)}
                className="w-full flex items-center justify-between"
              >
                <p className="text-sm font-bold text-[#f97316]">🤖 Análise IA — Recomendações</p>
                <span className="text-[#f97316]">{verAnalise ? '▲' : '▼'}</span>
              </button>
              {verAnalise && (
                <div className="mt-4 text-xs text-[#aaa] leading-relaxed whitespace-pre-wrap">
                  {dados.analise}
                </div>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3">
            <button
              onClick={exportarJSON}
              className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all"
            >
              💾 Exportar JSON
            </button>
            <button
              onClick={carregar}
              className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all"
            >
              🔄 Atualizar dados
            </button>
          </div>

          <p className="text-[10px] text-[#444] text-center mt-4">
            Gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}
          </p>
        </>
      )}
    </div>
  )
}
