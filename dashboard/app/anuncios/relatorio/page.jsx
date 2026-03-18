'use client'
import { useState } from 'react'
import { api } from '../../../lib/api'
import PageHeader from '../../../components/PageHeader'
import { Toast } from '../../../components/Toast'

function fmt(v, decimals = 2) { return Number(v || 0).toFixed(decimals) }
function fmtBRL(v) { return `R$ ${fmt(v)}` }
function fmtNum(v) { return Number(v || 0).toLocaleString('pt-BR') }

// ── Glossário das métricas em linguagem simples ──
const GLOSSARIO = {
  impressoes: {
    nome: '👁️ Quantas vezes foi exibido',
    explicacao: 'Número de vezes que seu anúncio apareceu na tela de alguém no Instagram ou Facebook. Não significa que a pessoa clicou — só que viu.',
  },
  alcance: {
    nome: '👥 Pessoas diferentes que viram',
    explicacao: 'Quantas pessoas únicas viram seu anúncio. Se a mesma pessoa viu 3 vezes, conta como 1 aqui.',
  },
  frequencia: {
    nome: '🔁 Vezes que cada pessoa viu',
    explicacao: 'Média de vezes que cada pessoa viu seu anúncio. O ideal é entre 1,5 e 3 vezes. Abaixo disso é pouco. Acima de 3, as pessoas já ficam saturadas e param de prestar atenção.',
    bom: 'Entre 1,5 e 3 vezes',
    ruim_alto: 'Acima de 3 → troque a foto/vídeo do anúncio',
    ruim_baixo: 'Abaixo de 1,5 → anúncio rodou pouco tempo',
  },
  cliques: {
    nome: '🖱️ Total de cliques',
    explicacao: 'Quantas vezes alguém clicou em qualquer parte do anúncio (foto, botão, link, nome da página, etc).',
  },
  linkCliques: {
    nome: '🔗 Cliques no link',
    explicacao: 'Só os cliques que levaram a pessoa até o seu site ou cardápio. É o número mais importante — mostra quantas pessoas realmente se interessaram em comprar.',
  },
  ctr: {
    nome: '📈 Taxa de cliques (CTR)',
    explicacao: 'De cada 100 pessoas que viram o anúncio, quantas clicaram. Ex: CTR de 2% = a cada 100 visualizações, 2 pessoas clicaram.',
    bom: 'Acima de 1,5% é bom. Acima de 2% é ótimo.',
    ruim: 'Abaixo de 1% significa que a imagem ou o texto não estão chamando atenção.',
  },
  cpc: {
    nome: '💸 Custo por clique (CPC)',
    explicacao: 'Quanto você pagou em média para cada pessoa que clicou no anúncio.',
    bom: 'Abaixo de R$1,50 é ótimo para hamburguerias.',
    ruim: 'Acima de R$3,00 está caro — mude a imagem ou o público.',
  },
  cpm: {
    nome: '📢 Custo por 1.000 exibições (CPM)',
    explicacao: 'Quanto custou para o anúncio ser exibido 1.000 vezes. Serve para comparar campanhas. Quanto menor, mais barato está sendo alcançar pessoas.',
  },
  gasto: {
    nome: '💰 Total gasto',
    explicacao: 'Valor total investido nesta campanha desde que foi criada.',
  },
}

function Tooltip({ texto }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setAberto(!aberto) }}
        className="ml-1 text-[#555] hover:text-[#f97316] text-[10px] leading-none"
      >ℹ️</button>
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
    ACTIVE:   { label: '🟢 Ativa',     cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    PAUSED:   { label: '⏸️ Pausada',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    ARCHIVED: { label: '📦 Arquivada', cls: 'bg-[#222] text-[#666] border-[#333]' },
    DELETED:  { label: '🗑️ Deletada',  cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
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
  if (ctr >= 2)   pontos += 2
  else if (ctr >= 1) pontos += 1
  if (cpc <= 1.5) pontos += 2
  else if (cpc <= 3) pontos += 1
  if (freq >= 1.5 && freq <= 3) pontos += 1

  if (pontos >= 4) return { nota: '🟢 Boa', cor: 'text-green-400', resumo: 'Campanha performando bem. Pessoas estão clicando com custo baixo.' }
  if (pontos >= 2) return { nota: '🟡 Regular', cor: 'text-yellow-400', resumo: 'Campanha aceitável mas pode melhorar. Veja as métricas abaixo.' }
  return { nota: '🔴 Fraca', cor: 'text-red-400', resumo: 'Campanha com performance ruim. Recomendamos ajustar imagem, texto ou público.' }
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
    if (v >= 2)   avaliacao = { icon: '✅', cor: 'text-green-400', texto: `${fmt(v)}% — Ótimo! A cada 100 pessoas que veem, ${Math.round(v)} clicam.` }
    else if (v >= 1) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmt(v)}% — Regular. O ideal é acima de 1,5%. Tente uma foto mais chamativa.` }
    else avaliacao = { icon: '❌', cor: 'text-red-400', texto: `${fmt(v)}% — Baixo. Poucas pessoas estão clicando. Mude a imagem ou o texto do anúncio.` }
  } else if (metrica === 'cpc') {
    if (v === 0) return null
    if (v <= 1.5) avaliacao = { icon: '✅', cor: 'text-green-400', texto: `${fmtBRL(v)} por clique — Ótimo! Está barato para atrair clientes.` }
    else if (v <= 3) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmtBRL(v)} por clique — Aceitável, mas pode melhorar. Tente segmentar melhor o público.` }
    else avaliacao = { icon: '❌', cor: 'text-red-400', texto: `${fmtBRL(v)} por clique — Caro! Está pagando muito por cada visita. Mude a imagem ou reduza o público.` }
  } else if (metrica === 'frequencia') {
    if (v >= 1.5 && v <= 3) avaliacao = { icon: '✅', cor: 'text-green-400', texto: `${fmt(v)}x — Ideal. Cada pessoa viu o anúncio umas ${Math.round(v)} vezes, o suficiente para lembrar.` }
    else if (v > 3) avaliacao = { icon: '⚠️', cor: 'text-yellow-400', texto: `${fmt(v)}x — Público cansado. As pessoas já viram demais. Troque a foto ou vídeo do anúncio.` }
    else if (v > 0) avaliacao = { icon: 'ℹ️', cor: 'text-[#888]', texto: `${fmt(v)}x — Frequência baixa. O anúncio rodou pouco tempo.` }
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

function CampanhaCard({ camp }) {
  const [aberta, setAberta] = useState(false)

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
    <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] overflow-hidden">
      <button
        onClick={() => setAberta(!aberta)}
        className="w-full text-left p-4 hover:bg-[#111] transition-colors"
      >
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

        {/* Mini resumo */}
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

          {/* Resumo da avaliação */}
          <div className={`p-3 rounded-lg border ${
            avaliacao.nota.includes('Boa') ? 'bg-green-500/10 border-green-500/20' :
            avaliacao.nota.includes('Regular') ? 'bg-yellow-500/10 border-yellow-500/20' :
            'bg-red-500/10 border-red-500/20'
          }`}>
            <p className={`text-sm font-bold ${avaliacao.cor}`}>{avaliacao.nota}</p>
            <p className="text-xs text-[#aaa] mt-1">{avaliacao.resumo}</p>
          </div>

          {/* Todas as métricas com explicação */}
          <div>
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">O que cada número significa</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricaItem label="Exibições"     valor={fmtNum(camp.impressoes)}  glossKey="impressoes" />
              <MetricaItem label="Pessoas"        valor={fmtNum(camp.alcance)}     glossKey="alcance" />
              <MetricaItem label="Cliques totais" valor={fmtNum(camp.cliques)}     glossKey="cliques" />
              <MetricaItem label="Cliques no link" valor={fmtNum(camp.linkCliques)} glossKey="linkCliques" destaque />
              <MetricaItem label="% que clicou"   valor={`${fmt(camp.ctr)}%`}      glossKey="ctr" destaque />
              <MetricaItem label="Custo/clique"   valor={camp.cpc > 0 ? fmtBRL(camp.cpc) : '—'} glossKey="cpc" destaque />
              <MetricaItem label="Frequência"     valor={`${fmt(camp.frequencia)}x`} glossKey="frequencia" />
              <MetricaItem label="Custo/1000 exib." valor={fmtBRL(camp.cpm)}       glossKey="cpm" />
            </div>
          </div>

          {/* Avaliações detalhadas */}
          <div>
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-2">Avaliação detalhada</p>
            <div className="space-y-2">
              <AvaliacaoMetrica metrica="ctr"        valor={camp.ctr} />
              <AvaliacaoMetrica metrica="cpc"        valor={camp.cpc} />
              <AvaliacaoMetrica metrica="frequencia" valor={camp.frequencia} />
            </div>
          </div>

          <p className="text-[10px] text-[#444]">
            Criada em: {camp.criada ? new Date(camp.criada).toLocaleDateString('pt-BR') : '—'}
            {camp.orcamentoDiario ? ` · Orçamento: ${fmtBRL(camp.orcamentoDiario)}/dia` : ''}
          </p>
        </div>
      )}
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
  const [loading, setLoading]       = useState(false)
  const [toast, setToast]           = useState(null)
  const [verAnalise, setVerAnalise] = useState(false)
  const [verGlossario, setVerGlossario] = useState(false)

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
        description="Veja como seus anúncios estão performando — em linguagem simples"
      />

      {/* Botão gerar */}
      <button
        onClick={carregar}
        disabled={loading}
        className="w-full mb-4 py-3 rounded-xl bg-[#f97316] hover:bg-[#ea6a0a] disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
      >
        {loading
          ? <><span className="animate-spin">⟳</span> Buscando dados do Meta Ads...</>
          : '📊 Gerar Relatório Completo'}
      </button>

      {/* Glossário rápido */}
      <button
        onClick={() => setVerGlossario(!verGlossario)}
        className="w-full mb-6 py-2 rounded-xl border border-[#222] text-[#666] hover:text-[#aaa] text-xs transition-all"
      >
        {verGlossario ? '▲ Fechar glossário' : '📖 O que significa cada termo? (clique para ver)'}
      </button>

      {verGlossario && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] p-4 space-y-3">
          <p className="text-xs font-bold text-white mb-3">📖 Guia rápido — o que cada métrica significa</p>
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

      {dados && (
        <>
          {/* Resumo geral */}
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">Resumo geral — todas as campanhas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <SummaryCard
              label="Total Investido"
              explicacao="Soma de tudo que você gastou em anúncios desde o início."
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
              explicacao="Quantas vezes alguém clicou e foi até o seu cardápio/site."
              value={fmtNum(r.totalCliques)}
              sub="visitas geradas"
              cor="#34d399"
            />
            <SummaryCard
              label="% que clicou (CTR)"
              explicacao="De cada 100 pessoas que viram o anúncio, quantas clicaram. Acima de 1,5% é bom."
              value={`${fmt(r.ctrMedio)}%`}
              sub={parseFloat(r.ctrMedio) >= 1.5 ? '✅ acima do ideal' : '⚠️ abaixo do ideal (1,5%)'}
              cor={parseFloat(r.ctrMedio) >= 1.5 ? '#34d399' : '#f87171'}
            />
            <SummaryCard
              label="Custo por clique (CPC)"
              explicacao="Quanto você pagou em média para cada pessoa que clicou. Abaixo de R$1,50 é ótimo."
              value={`R$ ${fmt(r.cpcMedio)}`}
              sub={parseFloat(r.cpcMedio) <= 1.5 ? '✅ custo baixo, ótimo!' : '⚠️ acima de R$1,50'}
              cor={parseFloat(r.cpcMedio) <= 1.5 ? '#34d399' : '#f87171'}
            />
            <SummaryCard
              label="Campanhas ativas"
              explicacao="Campanhas que estão rodando agora e gastando orçamento."
              value={r.campanhasAtivas}
              sub={`de ${r.totalCampanhas} no total`}
              cor="#a78bfa"
            />
          </div>

          {/* Lista de campanhas */}
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">
            Suas campanhas ({dados.campanhas.length}) — clique para ver detalhes
          </p>
          <div className="space-y-2 mb-6">
            {dados.campanhas.map(c => <CampanhaCard key={c.id} camp={c} />)}
          </div>

          {/* Análise IA */}
          {dados.analise && (
            <div className="rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 p-5 mb-6">
              <button
                onClick={() => setVerAnalise(!verAnalise)}
                className="w-full flex items-center justify-between"
              >
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
            <button onClick={exportarJSON} className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all">
              💾 Salvar relatório
            </button>
            <button onClick={carregar} className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#888] hover:text-white hover:border-[#555] text-sm transition-all">
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
