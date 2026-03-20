'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '../../../lib/api'
import PageHeader from '../../../components/PageHeader'
import { Toast } from '../../../components/Toast'

function fmt(v, decimals = 2) { return Number(v || 0).toFixed(decimals) }
function fmtBRL(v) { return `R$ ${fmt(v)}` }
function fmtNum(v) { return Number(v || 0).toLocaleString('pt-BR') }

const PERIODOS = [
  { value: 7,  label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
]

const GLOSSARIO = {
  impressoes:  { nome: '👁️ Quantas vezes foi exibido',        explicacao: 'Número de vezes que seu anúncio apareceu na tela de alguém. Não significa que a pessoa clicou — só que viu.' },
  alcance:     { nome: '👥 Pessoas diferentes que viram',     explicacao: 'Quantas pessoas únicas viram seu anúncio. Se a mesma pessoa viu 3 vezes, conta como 1 aqui.' },
  frequencia:  { nome: '🔁 Vezes que cada pessoa viu',        explicacao: 'Média de vezes que cada pessoa viu seu anúncio. O ideal é entre 1,5 e 3 vezes.', bom: 'Entre 1,5 e 3 vezes', ruim_alto: 'Acima de 3 → troque a criativo do anúncio', ruim_baixo: 'Abaixo de 1,5 → anúncio rodou pouco tempo' },
  cliques:     { nome: '🖱️ Total de cliques',                 explicacao: 'Quantas vezes alguém clicou em qualquer parte do anúncio.' },
  linkCliques: { nome: '🔗 Cliques no link',                  explicacao: 'Só os cliques que levaram a pessoa até o seu site. É o número mais importante.' },
  ctr:         { nome: '📈 Taxa de cliques (CTR)',             explicacao: 'De cada 100 pessoas que viram, quantas clicaram.', bom: 'Acima de 1,5% é bom. Acima de 2% é ótimo.', ruim: 'Abaixo de 1% — imagem ou texto não chamam atenção.' },
  cpc:         { nome: '💸 Custo por clique (CPC)',            explicacao: 'Quanto você pagou em média para cada pessoa que clicou.', bom: 'Abaixo de R$1,50 é ótimo.', ruim: 'Acima de R$3,00 — mude imagem ou público.' },
  cpm:         { nome: '📢 Custo por 1.000 exibições (CPM)',  explicacao: 'Quanto custou para o anúncio ser exibido 1.000 vezes.' },
  gasto:       { nome: '💰 Total gasto',                      explicacao: 'Valor total investido nesta campanha.' },
}

function Tooltip({ texto }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="relative inline-block">
      <button onClick={e => { e.stopPropagation(); setAberto(!aberto) }} className="ml-1 text-[#555] hover:text-[#f97316] text-[10px] leading-none">ℹ️</button>
      {aberto && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#1a1a1a] border border-[#333] rounded-lg p-3 text-[11px] text-[#aaa] leading-relaxed z-50 shadow-xl">
          {texto}
          <button onClick={e => { e.stopPropagation(); setAberto(false) }} className="block mt-2 text-[#f97316] text-[10px]">fechar</button>
        </div>
      )}
    </span>
  )
}

function statusBadge(status) {
  const map = {
    ACTIVE:   { label: '🟢 Ativa',      cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    PAUSED:   { label: '⏸️ Pausada',    cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    ARCHIVED: { label: '📦 Arquivada',  cls: 'bg-[#222] text-[#666] border-[#333]' },
    DELETED:  { label: '🗑️ Deletada',   cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  }
  const s = map[status] || { label: status, cls: 'bg-[#222] text-[#666]' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

function avaliarCampanha(camp) {
  const ctr  = parseFloat(camp.ctr)
  const cpc  = parseFloat(camp.cpc)
  const freq = parseFloat(camp.frequencia)
  const gasto = parseFloat(camp.gasto)
  if (gasto === 0) return { nota: '—', cor: 'text-[#555]', resumo: 'Sem gastos registrados ainda.' }
  let pontos = 0
  if (ctr >= 2) pontos += 2; else if (ctr >= 1) pontos += 1
  if (cpc <= 1.5) pontos += 2; else if (cpc <= 3) pontos += 1
  if (freq >= 1.5 && freq <= 3) pontos += 1
  if (pontos >= 4) return { nota: '🟢 Boa',     cor: 'text-green-400',  resumo: 'Campanha performando bem. Pessoas estão clicando com custo baixo.' }
  if (pontos >= 2) return { nota: '🟡 Regular', cor: 'text-yellow-400', resumo: 'Campanha aceitável mas pode melhorar.' }
  return              { nota: '🔴 Fraca',   cor: 'text-red-400',    resumo: 'Campanha com performance ruim. Ajuste imagem, texto ou público.' }
}

function MetricaItem({ label, valor, glossKey, destaque = false }) {
  const g = GLOSSARIO[glossKey]
  return (
    <div className={`bg-[#151515] rounded-lg p-3 text-center ${destaque ? 'ring-1 ring-[#f97316]/30' : ''}`}>
      <p className="text-[10px] text-[#555] mb-1 flex items-center justify-center gap-0.5">
        {g?.nome || label}
        {g && <Tooltip texto={g.explicacao} />}
      </p>
      <p className={`text-sm font-bold ${destaque ? 'text-[#f97316]' : 'text-white'}`}>{valor}</p>
    </div>
  )
}

function AvaliacaoMetrica({ metrica, valor }) {
  const v = parseFloat(valor)
  const g = GLOSSARIO[metrica]
  let avaliacao = null
  if (metrica === 'ctr') {
    if (v >= 2)   avaliacao = { icon: '✅', cor: 'text-green-400',  texto: `${fmt(v)}% — Ótimo! A cada 100 pessoas, ${Math.round(v)} clicam.` }
    else if (v >= 1) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmt(v)}% — Regular. Ideal acima de 1,5%. Tente uma foto mais chamativa.` }
    else avaliacao = { icon: '❌', cor: 'text-red-400', texto: `${fmt(v)}% — Baixo. Mude a imagem ou o texto.` }
  } else if (metrica === 'cpc') {
    if (v === 0) return null
    if (v <= 1.5) avaliacao = { icon: '✅', cor: 'text-green-400',  texto: `${fmtBRL(v)} por clique — Ótimo!` }
    else if (v <= 3) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmtBRL(v)} por clique — Aceitável, pode melhorar.` }
    else avaliacao = { icon: '❌', cor: 'text-red-400', texto: `${fmtBRL(v)} por clique — Caro! Mude a imagem ou reduza o público.` }
  } else if (metrica === 'frequencia') {
    if (v >= 1.5 && v <= 3) avaliacao = { icon: '✅', cor: 'text-green-400', texto: `${fmt(v)}x — Ideal.` }
    else if (v > 3) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmt(v)}x — Público cansado. Troque o criativo.` }
    else if (v > 0) avaliacao = { icon: 'ℹ️', cor: 'text-[#888]', texto: `${fmt(v)}x — Frequência baixa.` }
  }
  if (!avaliacao) return null
  return (
    <div className={`flex items-start gap-2 text-xs ${avaliacao.cor} bg-[#111] rounded-lg p-2.5`}>
      <span className="shrink-0">{avaliacao.icon}</span>
      <div>
        <p className="font-semibold">{g?.nome || metrica}</p>
        <p className="text-[#aaa] mt-0.5">{avaliacao.texto}</p>
      </div>
    </div>
  )
}

// ── Modal de Relatório Final ──
function RelatorioFinalModal({ camp, onClose }) {
  const printRef = useRef(null)
  const avaliacao = avaliarCampanha(camp)
  const dataInicio = camp.iniciou ? new Date(camp.iniciou).toLocaleDateString('pt-BR') : '—'
  const dataFim    = camp.encerrou ? new Date(camp.encerrou).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')
  const dataCriada = camp.criada ? new Date(camp.criada).toLocaleDateString('pt-BR') : '—'

  function imprimir() {
    const conteudo = printRef.current?.innerHTML
    const janela = window.open('', '_blank')
    janela.document.write(`
      <html><head><title>Relatório Final — ${camp.nome}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #555; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
        .card .label { font-size: 11px; color: #888; margin-bottom: 4px; }
        .card .valor { font-size: 18px; font-weight: bold; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: bold; border: 1px solid #ddd; }
        .avaliacao { padding: 12px; border-radius: 8px; margin: 12px 0; }
        p { font-size: 13px; line-height: 1.6; }
        .footer { margin-top: 32px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
      </style></head>
      <body>${conteudo}</body></html>
    `)
    janela.document.close()
    janela.print()
  }

  function exportarCSV() {
    const linhas = [
      ['Campanha', camp.nome],
      ['Status', camp.status],
      ['Criada em', dataCriada],
      ['Período', `${dataInicio} até ${dataFim}`],
      ['', ''],
      ['Métrica', 'Valor'],
      ['Total gasto (R$)', fmt(camp.gasto)],
      ['Impressões', camp.impressoes],
      ['Alcance', camp.alcance],
      ['Frequência', fmt(camp.frequencia)],
      ['Cliques totais', camp.cliques],
      ['Cliques no link', camp.linkCliques],
      ['CTR (%)', fmt(camp.ctr)],
      ['CPC (R$)', fmt(camp.cpc)],
      ['CPM (R$)', fmt(camp.cpm)],
      ['Avaliação', avaliacao.nota.replace(/[🟢🟡🔴]/g, '').trim()],
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${camp.nome.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1e1e1e] sticky top-0 bg-[#0f0f0f] z-10">
          <div>
            <p className="text-xs text-[#f97316] font-semibold uppercase tracking-wider mb-0.5">📄 Relatório Final</p>
            <h2 className="text-sm font-bold text-white truncate max-w-xs">{camp.nome}</h2>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Conteúdo imprimível */}
        <div className="p-5 space-y-5" ref={printRef}>

          {/* Info básica — versão print */}
          <div style={{ display: 'none' }}>
            <h1>Relatório Final — {camp.nome}</h1>
            <p>Bruthus Burger | Gerado em {new Date().toLocaleString('pt-BR')}</p>
          </div>

          {/* Status + período */}
          <div className="flex flex-wrap items-center gap-3">
            {statusBadge(camp.status)}
            <span className="text-xs text-[#666]">Criada em {dataCriada}</span>
            {camp.orcamentoDiario > 0 && (
              <span className="text-xs text-[#666]">Orçamento: {fmtBRL(camp.orcamentoDiario)}/dia</span>
            )}
          </div>

          {/* Avaliação geral */}
          <div className={`p-4 rounded-xl border ${
            avaliacao.nota.includes('Boa') ? 'bg-green-500/10 border-green-500/20' :
            avaliacao.nota.includes('Regular') ? 'bg-yellow-500/10 border-yellow-500/20' :
            avaliacao.nota.includes('—') ? 'bg-[#1a1a1a] border-[#333]' :
            'bg-red-500/10 border-red-500/20'
          }`}>
            <p className={`text-base font-bold ${avaliacao.cor}`}>{avaliacao.nota}</p>
            <p className="text-xs text-[#aaa] mt-1">{avaliacao.resumo}</p>
          </div>

          {/* Métricas principais */}
          <div>
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">Resultados da campanha</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricaItem label="Total gasto"      valor={fmtBRL(camp.gasto)}              glossKey="gasto" destaque />
              <MetricaItem label="Pessoas alcançadas" valor={fmtNum(camp.alcance)}           glossKey="alcance" />
              <MetricaItem label="Cliques no link"  valor={fmtNum(camp.linkCliques)}         glossKey="linkCliques" destaque />
              <MetricaItem label="Impressões"        valor={fmtNum(camp.impressoes)}          glossKey="impressoes" />
              <MetricaItem label="% que clicou"      valor={`${fmt(camp.ctr)}%`}             glossKey="ctr" destaque />
              <MetricaItem label="Custo/clique"      valor={camp.cpc > 0 ? fmtBRL(camp.cpc) : '—'} glossKey="cpc" destaque />
              <MetricaItem label="Frequência"        valor={`${fmt(camp.frequencia)}x`}      glossKey="frequencia" />
              <MetricaItem label="Custo/1000 exib."  valor={fmtBRL(camp.cpm)}                glossKey="cpm" />
            </div>
          </div>

          {/* Avaliação detalhada */}
          {camp.gasto > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">Análise detalhada</p>
              <div className="space-y-2">
                <AvaliacaoMetrica metrica="ctr"        valor={camp.ctr} />
                <AvaliacaoMetrica metrica="cpc"        valor={camp.cpc} />
                <AvaliacaoMetrica metrica="frequencia" valor={camp.frequencia} />
              </div>
            </div>
          )}

          {/* Custo por resultado */}
          {camp.gasto > 0 && camp.linkCliques > 0 && (
            <div className="p-4 rounded-xl bg-[#111] border border-[#1e1e1e]">
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-3">Resumo de custo</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#555]">Custo por visita ao cardápio</p>
                  <p className="text-lg font-bold text-[#f97316]">{fmtBRL(camp.gasto / camp.linkCliques)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555]">Custo por pessoa alcançada</p>
                  <p className="text-lg font-bold text-white">{camp.alcance > 0 ? fmtBRL(camp.gasto / camp.alcance) : '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Rodapé no print */}
          <p className="text-[10px] text-[#444]">
            Relatório gerado em {new Date().toLocaleString('pt-BR')} · Bruthus Burger
          </p>
        </div>

        {/* Ações */}
        <div className="flex gap-2 p-4 border-t border-[#1e1e1e]">
          <button onClick={exportarCSV} className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-xs font-semibold transition-all">
            📊 Exportar CSV
          </button>
          <button onClick={imprimir} className="flex-1 py-2.5 rounded-xl bg-[#f97316] hover:bg-[#ea6a0a] text-white text-xs font-semibold transition-all">
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>
      </div>
    </div>
  )
}

function CampanhaCard({ camp }) {
  const [aberta, setAberta]               = useState(false)
  const [verRelatorioFinal, setVerRelatorioFinal] = useState(false)
  const encerrada = camp.status !== 'ACTIVE'

  if (camp.erro || !camp.impressoes) {
    return (
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 opacity-60">
        <div className="flex items-center gap-3">
          {statusBadge(camp.status)}
          <p className="text-sm text-[#777] truncate">{camp.nome}</p>
          <span className="text-[10px] text-[#555] ml-auto">sem dados de performance</span>
        </div>
      </div>
    )
  }

  const avaliacao = avaliarCampanha(camp)

  return (
    <>
      {verRelatorioFinal && (
        <RelatorioFinalModal camp={camp} onClose={() => setVerRelatorioFinal(false)} />
      )}

      <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] overflow-hidden">
        <button onClick={() => setAberta(!aberta)} className="w-full text-left p-4 hover:bg-[#111] transition-colors">
          <div className="flex items-start gap-3 flex-wrap">
            {statusBadge(camp.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{camp.nome}</p>
              <p className={`text-xs mt-0.5 font-bold ${avaliacao.cor}`}>{avaliacao.nota}</p>
            </div>
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <div className="text-right">
                <p className="text-sm font-bold text-[#f97316]">{fmtBRL(camp.gasto)}</p>
                <p className="text-[10px] text-[#555]">investido</p>
              </div>
              <span className="text-[#555]">{aberta ? '▲' : '▼'}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="text-center">
              <p className="text-[10px] text-[#555]">Pessoas que viram</p>
              <p className="text-xs font-bold text-white">{fmtNum(camp.alcance)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#555]">Cliques no link</p>
              <p className="text-xs font-bold text-white">{fmtNum(camp.linkCliques)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#555]">% que clicou</p>
              <p className={`text-xs font-bold ${parseFloat(camp.ctr) >= 1.5 ? 'text-green-400' : parseFloat(camp.ctr) >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>{fmt(camp.ctr)}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#555]">Custo/clique</p>
              <p className={`text-xs font-bold ${parseFloat(camp.cpc) <= 1.5 ? 'text-green-400' : parseFloat(camp.cpc) <= 3 ? 'text-yellow-400' : 'text-red-400'}`}>{camp.cpc > 0 ? fmtBRL(camp.cpc) : '—'}</p>
            </div>
          </div>
        </button>

        {aberta && (
          <div className="border-t border-[#1e1e1e] p-4 space-y-4">
            <div className={`p-3 rounded-lg border ${
              avaliacao.nota.includes('Boa') ? 'bg-green-500/10 border-green-500/20' :
              avaliacao.nota.includes('Regular') ? 'bg-yellow-500/10 border-yellow-500/20' :
              'bg-red-500/10 border-red-500/20'
            }`}>
              <p className={`text-sm font-bold ${avaliacao.cor}`}>{avaliacao.nota}</p>
              <p className="text-xs text-[#aaa] mt-1">{avaliacao.resumo}</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">Todas as métricas</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricaItem label="Exibições"       valor={fmtNum(camp.impressoes)}              glossKey="impressoes" />
                <MetricaItem label="Pessoas"          valor={fmtNum(camp.alcance)}                 glossKey="alcance" />
                <MetricaItem label="Cliques totais"   valor={fmtNum(camp.cliques)}                 glossKey="cliques" />
                <MetricaItem label="Cliques no link"  valor={fmtNum(camp.linkCliques)}              glossKey="linkCliques" destaque />
                <MetricaItem label="% que clicou"     valor={`${fmt(camp.ctr)}%`}                  glossKey="ctr" destaque />
                <MetricaItem label="Custo/clique"     valor={camp.cpc > 0 ? fmtBRL(camp.cpc) : '—'} glossKey="cpc" destaque />
                <MetricaItem label="Frequência"       valor={`${fmt(camp.frequencia)}x`}            glossKey="frequencia" />
                <MetricaItem label="Custo/1000 exib." valor={fmtBRL(camp.cpm)}                      glossKey="cpm" />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">Avaliação detalhada</p>
              <div className="space-y-2">
                <AvaliacaoMetrica metrica="ctr"        valor={camp.ctr} />
                <AvaliacaoMetrica metrica="cpc"        valor={camp.cpc} />
                <AvaliacaoMetrica metrica="frequencia" valor={camp.frequencia} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#444]">
                Criada em: {camp.criada ? new Date(camp.criada).toLocaleDateString('pt-BR') : '—'}
                {camp.orcamentoDiario ? ` · ${fmtBRL(camp.orcamentoDiario)}/dia` : ''}
              </p>
              <button
                onClick={() => setVerRelatorioFinal(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/20 transition-all"
              >
                📄 Relatório Final
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function EstimativaInvestimento({ campanhas }) {
  const [cliquesDesejados, setCliquesDesejados] = useState('100')
  const comDados = campanhas.filter(c => !c.erro && c.cpc > 0 && c.linkCliques > 0)
  if (comDados.length === 0) return null
  const cpcMedio = comDados.reduce((s, c) => s + c.cpc, 0) / comDados.length
  const cliques = parseInt(cliquesDesejados) || 0
  const budgetEst = cliques * cpcMedio
  const diasEst3 = (budgetEst / 3).toFixed(2)
  const diasEst5 = (budgetEst / 5).toFixed(2)
  const diasEst7 = (budgetEst / 7).toFixed(2)
  return (
    <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
      <p className="text-xs font-bold text-white mb-1">💡 Estimativa de Investimento</p>
      <p className="text-[11px] text-[#555] mb-4">Baseado no seu CPC médio histórico de {fmtBRL(cpcMedio)}</p>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-[#666] shrink-0">Cliques que quero gerar:</label>
        <input type="number" value={cliquesDesejados} onChange={e => setCliquesDesejados(e.target.value)} min="10"
          className="w-24 bg-[#0f0f0f] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f97316]" />
      </div>
      {cliques > 0 && (
        <>
          <div className="p-3 rounded-lg bg-[#0a0a0a] border border-[#f97316]/20 mb-3 text-center">
            <p className="text-[10px] text-[#555] mb-1">Orçamento total estimado</p>
            <p className="text-2xl font-black text-[#f97316]">{fmtBRL(budgetEst)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['3 dias', diasEst3], ['5 dias', diasEst5], ['7 dias', diasEst7]].map(([label, val]) => (
              <div key={label} className="p-2 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] text-center">
                <p className="text-xs font-bold text-white">{fmtBRL(parseFloat(val))}/dia</p>
                <p className="text-[10px] text-[#555] mt-0.5">em {label}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function GraficoCampanhas({ campanhas }) {
  const comDados = campanhas.filter(c => !c.erro && c.impressoes > 0)
  if (comDados.length < 2) return null
  const maxGasto = Math.max(...comDados.map(c => c.gasto), 1)
  const maxCTR   = Math.max(...comDados.map(c => c.ctr), 1)
  return (
    <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-white">📊 Comparativo Visual das Campanhas</p>
        <div className="flex items-center gap-3 text-[10px] text-[#555]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#f97316]" /> Gasto</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" /> CTR</span>
        </div>
      </div>
      <div className="space-y-3">
        {comDados.map((c, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-[#888] truncate max-w-[60%]">{c.nome}</p>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-[#f97316]">{fmtBRL(c.gasto)}</span>
                <span className={c.ctr >= 1.5 ? 'text-green-400' : c.ctr >= 1 ? 'text-yellow-400' : 'text-red-400'}>{fmt(c.ctr)}% CTR</span>
              </div>
            </div>
            <div className="flex gap-1 h-3">
              <div className="bg-[#f97316]/70 rounded-sm transition-all" style={{ width: `${(c.gasto / maxGasto) * 100}%`, minWidth: c.gasto > 0 ? '4px' : '0' }} />
            </div>
            <div className="flex gap-1 h-2 mt-0.5">
              <div className={`rounded-sm transition-all ${c.ctr >= 1.5 ? 'bg-green-500/70' : c.ctr >= 1 ? 'bg-yellow-500/70' : 'bg-red-500/70'}`} style={{ width: `${(c.ctr / maxCTR) * 100}%`, minWidth: c.ctr > 0 ? '4px' : '0' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ label, explicacao, value, sub, cor = '#f97316' }) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
      <p className="text-xs text-[#666] mb-1 flex items-center gap-1">
        {label}
        <Tooltip texto={explicacao} />
      </p>
      <p className="text-2xl font-bold" style={{ color: cor }}>{value}</p>
      {sub && <p className="text-[11px] text-[#555] mt-0.5">{sub}</p>}
    </div>
  )
}

export default function RelatorioPage() {
  const [dados, setDados]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [periodo, setPeriodo]       = useState(30)
  const [toast, setToast]           = useState(null)
  const [verAnalise, setVerAnalise] = useState(false)
  const [verGlossario, setVerGlossario] = useState(false)

  async function carregar(dias = periodo) {
    setLoading(true)
    setDados(null)
    try {
      const d = await api.get(`/ads/relatorio?dias=${dias}`)
      setDados(d)
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  // Auto-load ao abrir a página
  useEffect(() => { carregar(periodo) }, [])

  function trocarPeriodo(dias) {
    setPeriodo(dias)
    carregar(dias)
  }

  function exportarCSV() {
    if (!dados) return
    const linhas = [
      ['Campanha', 'Status', 'Gasto (R$)', 'Impressões', 'Alcance', 'Cliques link', 'CTR (%)', 'CPC (R$)', 'CPM (R$)', 'Frequência', 'Avaliação'],
      ...dados.campanhas.filter(c => !c.erro).map(c => {
        const av = avaliarCampanha(c)
        return [
          c.nome, c.status, fmt(c.gasto), c.impressoes || 0, c.alcance || 0,
          c.linkCliques || 0, fmt(c.ctr), fmt(c.cpc), fmt(c.cpm), fmt(c.frequencia),
          av.nota.replace(/[🟢🟡🔴—]/g, '').trim(),
        ]
      })
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-ads-${new Date().toISOString().slice(0,10)}.csv`
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
        description="Análise completa dos seus anúncios do Meta Ads — em linguagem simples"
      />

      {/* Seletor de período */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-[#555]">Período:</span>
        {PERIODOS.map(p => (
          <button
            key={p.value}
            onClick={() => trocarPeriodo(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              periodo === p.value
                ? 'bg-[#f97316] text-white'
                : 'bg-[#1a1a1a] text-[#666] border border-[#333] hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => carregar(periodo)}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a1a1a] border border-[#333] text-[#666] hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? '⟳ Atualizando...' : '🔄 Atualizar'}
        </button>
      </div>

      {/* Glossário */}
      <button
        onClick={() => setVerGlossario(!verGlossario)}
        className="w-full mb-5 py-2 rounded-xl border border-[#222] text-[#666] hover:text-[#aaa] text-xs transition-all"
      >
        {verGlossario ? '▲ Fechar glossário' : '📖 O que significa cada termo?'}
      </button>

      {verGlossario && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 space-y-3">
          <p className="text-xs font-bold text-white mb-3">📖 Guia rápido</p>
          {Object.entries(GLOSSARIO).map(([key, g]) => (
            <div key={key} className="border-b border-[#1a1a1a] pb-3 last:border-0">
              <p className="text-xs font-semibold text-[#f97316]">{g.nome}</p>
              <p className="text-[11px] text-[#888] mt-0.5">{g.explicacao}</p>
              {g.bom && <p className="text-[11px] text-green-500 mt-1">✅ Bom: {g.bom}</p>}
              {g.ruim && <p className="text-[11px] text-red-400">❌ Ruim: {g.ruim}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-3xl mb-3 animate-pulse">📊</p>
          <p className="text-sm text-[#555]">Buscando dados do Meta Ads...</p>
          <p className="text-[11px] text-[#333] mt-1">Isso pode levar alguns segundos</p>
        </div>
      )}

      {!loading && dados && (
        <>
          {/* Resumo geral */}
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">
            Resumo geral — últimos {periodo} dias
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <SummaryCard
              label="Total Investido"
              explicacao="Soma de tudo que você gastou em anúncios no período."
              value={`R$ ${fmt(r.totalGasto)}`}
              sub={`em ${r.totalCampanhas} campanhas`}
            />
            <SummaryCard
              label="Pessoas alcançadas"
              explicacao="Quantas pessoas diferentes viram pelo menos um dos seus anúncios."
              value={fmtNum(r.totalAlcance)}
              sub="pessoas únicas"
              cor="#60a5fa"
            />
            <SummaryCard
              label="Cliques no link"
              explicacao="Quantas vezes alguém clicou e foi até o seu cardápio."
              value={fmtNum(r.totalCliques)}
              sub="visitas geradas"
              cor="#34d399"
            />
            <SummaryCard
              label="CTR médio"
              explicacao="De cada 100 pessoas que viram, quantas clicaram. Acima de 1,5% é bom."
              value={`${fmt(r.ctrMedio)}%`}
              sub={parseFloat(r.ctrMedio) >= 1.5 ? '✅ acima do ideal' : '⚠️ abaixo de 1,5%'}
              cor={parseFloat(r.ctrMedio) >= 1.5 ? '#34d399' : '#f87171'}
            />
            <SummaryCard
              label="CPC médio"
              explicacao="Quanto você pagou em média por clique. Abaixo de R$1,50 é ótimo."
              value={`R$ ${fmt(r.cpcMedio)}`}
              sub={parseFloat(r.cpcMedio) <= 1.5 ? '✅ custo baixo!' : '⚠️ acima de R$1,50'}
              cor={parseFloat(r.cpcMedio) <= 1.5 ? '#34d399' : '#f87171'}
            />
            <SummaryCard
              label="Campanhas ativas"
              explicacao="Campanhas rodando agora."
              value={r.campanhasAtivas}
              sub={`de ${r.totalCampanhas} no total`}
              cor="#a78bfa"
            />
          </div>

          {/* Melhor e Pior */}
          {(() => {
            const comDados = dados.campanhas.filter(c => !c.erro && c.gasto > 0)
            if (comDados.length < 2) return null
            const melhorCTR  = [...comDados].sort((a, b) => b.ctr - a.ctr)[0]
            const piorCPC    = [...comDados].sort((a, b) => b.cpc - a.cpc)[0]
            return (
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                  <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-2">🏆 Melhor CTR</p>
                  <p className="text-sm font-bold text-white truncate">{melhorCTR.nome}</p>
                  <p className="text-xl font-black text-green-400 mt-1">{fmt(melhorCTR.ctr)}%</p>
                  <p className="text-[10px] text-[#555] mt-1">Gasto: {fmtBRL(melhorCTR.gasto)}</p>
                </div>
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                  <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">💀 Maior CPC</p>
                  <p className="text-sm font-bold text-white truncate">{piorCPC.nome}</p>
                  <p className="text-xl font-black text-red-400 mt-1">{fmtBRL(piorCPC.cpc)}</p>
                  <p className="text-[10px] text-[#555] mt-1">Gasto: {fmtBRL(piorCPC.gasto)}</p>
                </div>
              </div>
            )
          })()}

          {/* Benchmark personalizado */}
          {(() => {
            const comDados = dados.campanhas.filter(c => !c.erro && c.gasto > 0 && c.impressoes > 500)
            if (comDados.length < 2) return null
            const suaCTR = (comDados.reduce((s, c) => s + c.ctr, 0) / comDados.length)
            const suaCPC = (comDados.reduce((s, c) => s + c.cpc, 0) / comDados.length)
            const IDEAL_CTR = 1.5
            const IDEAL_CPC = 1.5
            return (
              <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
                <p className="text-xs font-bold text-white mb-3">🎯 Seu Benchmark vs Ideal</p>
                <div className="space-y-3">
                  {[
                    { label: 'CTR médio', sua: suaCTR, ideal: IDEAL_CTR, fmt: v => `${v.toFixed(2)}%`, maior: true },
                    { label: 'CPC médio', sua: suaCPC, ideal: IDEAL_CPC, fmt: v => `R$${v.toFixed(2)}`, maior: false },
                  ].map(m => {
                    const melhor = m.maior ? m.sua >= m.ideal : m.sua <= m.ideal
                    const pct = m.maior
                      ? Math.min((m.sua / (m.ideal * 1.5)) * 100, 100)
                      : Math.min((m.ideal / Math.max(m.sua, 0.01)) * 100 * (m.ideal / (m.ideal * 1.5)), 100)
                    return (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#666]">{m.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-[#555]">Ideal: {m.fmt(m.ideal)}</span>
                            <span className={`text-xs font-bold ${melhor ? 'text-green-400' : 'text-yellow-400'}`}>
                              {melhor ? '✅' : '⚠️'} Sua média: {m.fmt(m.sua)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${melhor ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${Math.max(Math.min(m.maior ? (m.sua/m.ideal)*100 : (m.ideal/Math.max(m.sua,0.01))*100, 100), 5)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-[10px] text-[#444]">Baseado em {comDados.length} campanhas com dados suficientes</p>
                </div>
              </div>
            )
          })()}

          <EstimativaInvestimento campanhas={dados.campanhas} />

          {/* Lista de campanhas */}
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">
            Suas campanhas ({dados.campanhas.length}) — clique para ver detalhes
          </p>
          <div className="space-y-2 mb-6">
            {dados.campanhas.map(c => <CampanhaCard key={c.id} camp={c} />)}
          </div>

          <GraficoCampanhas campanhas={dados.campanhas} />

          {/* Análise IA */}
          {dados.analise && (
            <div className="rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 p-5 mb-6">
              <button onClick={() => setVerAnalise(!verAnalise)} className="w-full flex items-center justify-between">
                <p className="text-sm font-bold text-[#f97316]">🤖 Análise da IA — O que fazer agora</p>
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
            <button onClick={exportarCSV} className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all">
              📊 Exportar CSV
            </button>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `relatorio-ads-${new Date().toISOString().slice(0,10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all"
            >
              💾 Exportar JSON
            </button>
          </div>

          <p className="text-[10px] text-[#444] text-center mt-4">
            Atualizado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}
          </p>
        </>
      )}

      {!loading && !dados && (
        <div className="text-center py-16 rounded-xl border border-[#1e1e1e] bg-[#111]">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm text-[#555]">Não foi possível carregar os dados</p>
          <p className="text-[11px] text-[#333] mt-1">Verifique se o META_ACCESS_TOKEN está atualizado no Render</p>
          <button onClick={() => carregar(periodo)} className="mt-4 px-4 py-2 rounded-lg bg-[#f97316] text-white text-xs font-semibold">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
