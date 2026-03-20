'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

// ── Ciclo Ter→Seg ──────────────────────────────
function getRangoSemana(offset = 0) {
  const hoje = new Date()
  const dia = hoje.getDay()
  const diasDesdeTerca = (dia + 5) % 7
  const terca = new Date(hoje)
  terca.setDate(hoje.getDate() - diasDesdeTerca + offset * 7)
  const seg = new Date(terca)
  seg.setDate(terca.getDate() + 6)
  return {
    dataInicio: terca.toISOString().slice(0, 10),
    dataFim:    seg.toISOString().slice(0, 10),
  }
}

function fmtRango({ dataInicio, dataFim }) {
  const o = { day: '2-digit', month: '2-digit' }
  const ini = new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR', o)
  const fim = new Date(dataFim    + 'T12:00:00').toLocaleDateString('pt-BR', o)
  return `${ini} → ${fim}`
}

function fmtMes(m) {
  const [ano, mes] = m.split('-')
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mes)-1] + '/' + ano.slice(2)
}

const PERIODOS = [
  { valor: 'semana', label: 'Por semana' },
  { valor: 14,       label: '14 dias'   },
  { valor: 30,       label: '30 dias'   },
  { valor: 0,        label: 'Todos'     },
]

const CAT_RECEITA = ['Vendas no local', 'Delivery', 'Ifood', 'Outros']
const CAT_DESPESA = ['Ingredientes / Insumos', 'Embalagens', 'Marketing / Anúncios', 'Funcionários', 'Aluguel', 'Gás / Energia', 'Equipamentos', 'Outros']

function fmt(v)    { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }
function fmtData(d){ return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
function pctDiff(atual, ant) {
  if (!ant || ant === 0) return null
  return ((atual - ant) / ant) * 100
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export default function FinanceiroPage() {
  const [periodo, setPeriodo]           = useState('semana')
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [resumo, setResumo]             = useState(null)
  const [resumoAnt, setResumoAnt]       = useState(null)
  const [entradas, setEntradas]         = useState([])
  const [evolucao, setEvolucao]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [toast, setToast]               = useState(null)

  // Configs (localStorage)
  const [metaSemanal, setMetaSemanal]   = useState(0)
  const [margemMinima, setMargemMinima] = useState(30)
  const [mostraConfigs, setMostraConfigs] = useState(false)
  const [configTemp, setConfigTemp]     = useState({})

  // Formulário novo lançamento
  const [mostraForm, setMostraForm]     = useState(null)
  const [form, setForm]                 = useState({ valor: '', categoria: '', descricao: '', data: new Date().toISOString().slice(0, 10) })
  const [salvando, setSalvando]         = useState(false)

  // Edição
  const [editandoId, setEditandoId]     = useState(null)
  const [formEdit, setFormEdit]         = useState({})
  const [salvandoEdit, setSalvandoEdit] = useState(false)

  // Delete
  const [deletandoId, setDeletandoId]   = useState(null)

  // Importar WhatsApp
  const [mostraWpp, setMostraWpp]       = useState(false)
  const [wppTexto, setWppTexto]         = useState('')
  const [wppValores, setWppValores]     = useState([])
  const [wppCat, setWppCat]             = useState(CAT_DESPESA[0])
  const [wppDesc, setWppDesc]           = useState('')
  const [wppData, setWppData]           = useState(new Date().toISOString().slice(0, 10))
  const [salvandoWpp, setSalvandoWpp]   = useState(false)

  // Resumo WhatsApp
  const [resumoWpp, setResumoWpp]       = useState(null)
  const [enviandoWpp, setEnviandoWpp]   = useState(false)

  // ── Load configs localStorage ──
  useEffect(() => {
    setMetaSemanal(parseFloat(localStorage.getItem('metaSemanal') || '0'))
    setMargemMinima(parseFloat(localStorage.getItem('margemMinima') || '30'))
  }, [])

  // ── Carregar dados ──
  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      let resumoUrl, resumoAntUrl
      if (periodo === 'semana') {
        const { dataInicio, dataFim } = getRangoSemana(semanaOffset)
        const { dataInicio: ai, dataFim: af } = getRangoSemana(semanaOffset - 1)
        resumoUrl    = `/financeiro/resumo?dataInicio=${dataInicio}&dataFim=${dataFim}`
        resumoAntUrl = `/financeiro/resumo?dataInicio=${ai}&dataFim=${af}`
      } else {
        resumoUrl    = `/financeiro/resumo?dias=${periodo}`
        resumoAntUrl = null
      }

      const promises = [api.get(resumoUrl), api.get('/financeiro'), api.get('/financeiro/evolucao')]
      if (resumoAntUrl) promises.push(api.get(resumoAntUrl))

      const [r, e, ev, rAnt] = await Promise.all(promises)
      setResumo(r.resumo)
      setEntradas(e.entradas)
      setEvolucao(ev.evolucao || [])
      setResumoAnt(rAnt?.resumo || null)
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setLoading(false) }
  }, [periodo, semanaOffset])

  useEffect(() => { carregar() }, [carregar])

  // ── CRUD ──
  function abrirForm(tipo) {
    setMostraForm(tipo); setMostraWpp(false)
    setForm({ valor: '', categoria: tipo === 'receita' ? CAT_RECEITA[0] : CAT_DESPESA[0], descricao: '', data: new Date().toISOString().slice(0, 10) })
  }

  async function salvar() {
    if (!form.valor || isNaN(form.valor) || Number(form.valor) <= 0) {
      setToast({ message: 'Informe um valor válido!', type: 'error' }); return
    }
    setSalvando(true)
    try {
      await api.post('/financeiro', { tipo: mostraForm, ...form })
      setToast({ message: `${mostraForm === 'receita' ? 'Receita' : 'Gasto'} adicionado!`, type: 'success' })
      setMostraForm(null); carregar()
    } catch (e) { setToast({ message: e.message, type: 'error' })
    } finally { setSalvando(false) }
  }

  function abrirEdicao(e) {
    setEditandoId(e.id)
    setFormEdit({ valor: e.valor, categoria: e.categoria, descricao: e.descricao, data: e.data })
  }

  async function salvarEdicao() {
    setSalvandoEdit(true)
    try {
      await fetch(`${API_URL}/financeiro/${editandoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formEdit),
      })
      setToast({ message: 'Lançamento atualizado!', type: 'success' })
      setEditandoId(null); carregar()
    } catch (e) { setToast({ message: e.message, type: 'error' })
    } finally { setSalvandoEdit(false) }
  }

  async function deletar(id) {
    setDeletandoId(id)
    try {
      await fetch(`${API_URL}/financeiro/${id}`, { method: 'DELETE' })
      setToast({ message: 'Lançamento removido!', type: 'success' }); carregar()
    } catch (e) { setToast({ message: e.message, type: 'error' })
    } finally { setDeletandoId(null) }
  }

  // ── WhatsApp importer ──
  function parsearWpp(texto) {
    return texto.split('\n').filter(l => l.trim()).reduce((acc, linha) => {
      const partes = linha.split(': ')
      const val = parseFloat(partes[partes.length - 1].trim().replace(',', '.'))
      if (!isNaN(val) && val > 0) acc.push(val)
      return acc
    }, [])
  }

  function handleWppChange(texto) {
    setWppTexto(texto); setWppValores(parsearWpp(texto))
  }

  async function salvarWpp() {
    const total = wppValores.reduce((s, v) => s + v, 0)
    if (total <= 0) { setToast({ message: 'Nenhum valor encontrado!', type: 'error' }); return }
    setSalvandoWpp(true)
    try {
      await api.post('/financeiro', { tipo: 'despesa', valor: total, categoria: wppCat, descricao: wppDesc || `Importado do WhatsApp (${wppValores.length} itens)`, data: wppData })
      setToast({ message: `Gasto de ${fmt(total)} registrado!`, type: 'success' })
      setMostraWpp(false); setWppTexto(''); setWppValores([]); carregar()
    } catch (e) { setToast({ message: e.message, type: 'error' })
    } finally { setSalvandoWpp(false) }
  }

  // ── Exportar CSV ──
  function exportarCSV() {
    const header = 'Data,Tipo,Categoria,Descrição,Valor\n'
    const linhas = entradasPeriodo.map(e =>
      `${e.data},${e.tipo},"${e.categoria}","${e.descricao}",${e.valor}`
    ).join('\n')
    const blob = new Blob([header + linhas], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `financeiro_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Enviar resumo direto pelo servidor ──
  async function enviarResumoAgora() {
    setEnviandoWpp(true)
    try {
      await api.post('/financeiro/enviar-resumo-whatsapp', {})
      setToast({ message: 'Resumo enviado para o seu WhatsApp!', type: 'success' })
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setEnviandoWpp(false) }
  }

  // ── Resumo WhatsApp (copiar) ──
  function gerarResumoWpp() {
    if (!resumo) return
    const emoji = resumo.lucro >= 0 ? '✅' : '⚠️'
    let txt = `🍔 *Bruthus Burger — Resumo Semanal*\n`
    if (periodo === 'semana') txt += `📅 ${fmtRango(getRangoSemana(semanaOffset))}\n\n`
    txt += `📈 Faturamento: ${fmt(resumo.faturamento)}\n`
    txt += `📉 Gastos: ${fmt(resumo.gastos)}\n`
    txt += `${emoji} Lucro: ${fmt(resumo.lucro)}\n`
    txt += `📊 Margem: ${resumo.margem}%\n`
    if (resumo.topDespesas?.length > 0) {
      txt += `\n🔍 Maiores gastos:\n`
      resumo.topDespesas.slice(0,3).forEach((d,i) => { txt += `${i+1}. ${d.categoria}: ${fmt(d.valor)}\n` })
    }
    setResumoWpp(txt)
  }

  // ── Configs ──
  function salvarConfigs() {
    if (configTemp.metaSemanal !== undefined) {
      const v = parseFloat(configTemp.metaSemanal) || 0
      localStorage.setItem('metaSemanal', v); setMetaSemanal(v)
    }
    if (configTemp.margemMinima !== undefined) {
      const v = parseFloat(configTemp.margemMinima) || 30
      localStorage.setItem('margemMinima', v); setMargemMinima(v)
    }
    setMostraConfigs(false)
    setToast({ message: 'Configurações salvas!', type: 'success' })
  }

  // ── Entradas filtradas ──
  const entradasPeriodo = (() => {
    if (periodo === 0) return entradas
    if (periodo === 'semana') {
      const { dataInicio, dataFim } = getRangoSemana(semanaOffset)
      return entradas.filter(e => e.data >= dataInicio && e.data <= dataFim)
    }
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (periodo - 1))
    return entradas.filter(e => new Date(e.data + 'T12:00:00') >= cutoff)
  })()

  const maxGrafico = resumo?.grafico ? Math.max(...resumo.grafico.map(d => Math.max(d.receita, d.despesa)), 1) : 1
  const maxEvolucao = evolucao.length ? Math.max(...evolucao.map(d => Math.max(d.faturamento, d.gastos)), 1) : 1
  const pctFat  = pctDiff(resumo?.faturamento, resumoAnt?.faturamento)
  const pctGast = pctDiff(resumo?.gastos, resumoAnt?.gastos)
  const pctLucro= pctDiff(resumo?.lucro, resumoAnt?.lucro)
  const metaPct  = metaSemanal > 0 ? Math.min((resumo?.faturamento || 0) / metaSemanal * 100, 100) : 0
  const alertaMargem = resumo && margemMinima > 0 && resumo.margem < margemMinima && resumo.faturamento > 0

  return (
    <div className="max-w-4xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="💰" title="Controle Financeiro" description="Registre faturamento e gastos — veja lucro e margem em tempo real">
        <div className="flex gap-2 flex-wrap">
          {PERIODOS.map(p => (
            <button key={p.valor} onClick={() => { setPeriodo(p.valor); setSemanaOffset(0) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodo === p.valor ? 'bg-[#f97316] text-white' : 'bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333]'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => { setMostraConfigs(v => !v) }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333] transition-all">
            ⚙️
          </button>
        </div>
      </PageHeader>

      {/* Configs */}
      {mostraConfigs && (
        <div className="mb-4 rounded-xl border border-[#333] bg-[#111] p-4">
          <h3 className="text-sm font-bold text-white mb-3">⚙️ Configurações</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Meta semanal de faturamento (R$)</label>
              <input type="number" defaultValue={metaSemanal || ''} placeholder="Ex: 3000"
                onChange={e => setConfigTemp(c => ({ ...c, metaSemanal: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Alerta de margem mínima (%)</label>
              <input type="number" defaultValue={margemMinima} placeholder="Ex: 30"
                onChange={e => setConfigTemp(c => ({ ...c, margemMinima: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
          </div>
          <Button onClick={salvarConfigs} variant="primary" className="w-full">Salvar</Button>
        </div>
      )}

      {/* Alerta margem baixa */}
      {alertaMargem && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <p className="text-sm text-red-400">
            Margem abaixo do mínimo! Atual: <strong>{resumo.margem}%</strong> — mínimo configurado: <strong>{margemMinima}%</strong>
          </p>
        </div>
      )}

      {/* Navegador de semanas */}
      {periodo === 'semana' && (
        <div className="flex items-center justify-between mb-4 bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-2">
          <button onClick={() => setSemanaOffset(o => o - 1)}
            className="text-[#888] hover:text-white transition-colors px-2 py-1 text-xl">‹</button>
          <div className="text-center">
            <p className="text-xs font-semibold text-white">
              {semanaOffset === 0 ? 'Semana atual' : semanaOffset === -1 ? 'Semana passada' : `${Math.abs(semanaOffset)} semanas atrás`}
            </p>
            <p className="text-[11px] text-[#f97316]">{fmtRango(getRangoSemana(semanaOffset))}</p>
          </div>
          <button onClick={() => setSemanaOffset(o => Math.min(0, o + 1))} disabled={semanaOffset === 0}
            className="text-[#888] hover:text-white transition-colors px-2 py-1 text-xl disabled:opacity-20">›</button>
        </div>
      )}

      {/* Meta semanal */}
      {metaSemanal > 0 && periodo === 'semana' && (
        <div className="mb-4 rounded-2xl px-5 py-4" style={{ background: '#0b0b0b', border: '1px solid #181818' }}>
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs font-medium" style={{ color: '#444' }}>Meta semanal de faturamento</span>
            <span className="text-xs font-bold text-white">{fmt(resumo?.faturamento || 0)} / {fmt(metaSemanal)}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#141414' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${metaPct}%`,
                background: metaPct >= 100
                  ? 'linear-gradient(90deg, #34d399, #059669)'
                  : metaPct >= 70
                  ? 'linear-gradient(90deg, #facc15, #d97706)'
                  : 'linear-gradient(90deg, #f97316, #ea580c)',
                boxShadow: metaPct > 5 ? '0 0 10px rgba(249,115,22,0.2)' : 'none',
              }} />
          </div>
          <p className="text-[10px] mt-2" style={{ color: '#2a2a2a' }}>
            {metaPct >= 100 ? '🎯 Meta atingida!' : `${metaPct.toFixed(0)}% — faltam ${fmt(metaSemanal - (resumo?.faturamento || 0))}`}
          </p>
        </div>
      )}

      {/* Cards de métricas */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ border: '1px solid #181818', background: '#0b0b0b' }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-[#141414]">
          {[
            { label: 'Faturamento', valor: resumo?.faturamento, cor: '#34d399', pct: pctFat,  invertPct: false },
            { label: 'Gastos',      valor: resumo?.gastos,      cor: '#f87171', pct: pctGast, invertPct: true  },
            { label: 'Lucro',       valor: resumo?.lucro,       cor: resumo?.lucro >= 0 ? '#60a5fa' : '#f87171', pct: pctLucro, invertPct: false },
            { label: 'Margem',      valor: null, custom: `${resumo?.margem ?? '—'}%`,
              cor: resumo && resumo.faturamento > 0 ? (parseFloat(resumo.margem) >= 30 ? '#34d399' : parseFloat(resumo.margem) >= 15 ? '#facc15' : '#f87171') : '#555',
              pct: null, invertPct: false },
          ].map(c => (
            <div key={c.label} className="px-5 py-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px]"
                style={{ background: `linear-gradient(90deg, ${c.cor}60, transparent)` }} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2.5" style={{ color: '#3a3a3a' }}>
                {c.label}
              </p>
              <p className="text-3xl font-black tracking-tight leading-none mb-2" style={{ color: c.cor }}>
                {loading ? <span style={{ color: '#1a1a1a' }}>—</span> : (c.custom || fmt(c.valor))}
              </p>
              {c.pct !== null && c.pct !== undefined && resumoAnt ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                  style={(c.invertPct ? c.pct <= 0 : c.pct >= 0)
                    ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' }
                    : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }}
                >
                  {(c.invertPct ? c.pct <= 0 : c.pct >= 0) ? '↑' : '↓'} {Math.abs(c.pct).toFixed(0)}% vs ant.
                </span>
              ) : (
                <p className="text-[10px]" style={{ color: '#252525' }}>
                  {periodo === 0 ? 'desde a abertura' : periodo === 'semana' ? fmtRango(getRangoSemana(semanaOffset)) : `últimos ${periodo} dias`}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Botões ação */}
      <div className="flex gap-2.5 mb-3">
        <button onClick={() => { abrirForm('receita'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }}>
          <span className="text-base font-black">+</span> Receita
        </button>
        <button onClick={() => { abrirForm('despesa'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}>
          <span className="text-base font-black">−</span> Gasto
        </button>
        <button onClick={() => { setMostraWpp(v => !v); setMostraForm(null) }}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', color: '#25d366' }}>
          📋 Importar
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={exportarCSV}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#333] bg-[#111] text-[#888] hover:text-white font-semibold text-sm transition-all">
          ⬇️ Exportar CSV
        </button>
        <button onClick={gerarResumoWpp}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#333] bg-[#111] text-[#888] hover:text-white font-semibold text-sm transition-all">
          📋 Copiar resumo
        </button>
        <button onClick={enviarResumoAgora} disabled={enviandoWpp}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 font-semibold text-sm transition-all disabled:opacity-50">
          {enviandoWpp ? '…' : '📲 Enviar WPP'}
        </button>
      </div>

      {/* Formulário novo lançamento */}
      {mostraForm && (
        <div className={`mb-6 rounded-xl border p-5 animate-slide-up ${
          mostraForm === 'receita' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm">{mostraForm === 'receita' ? '📈 Nova Receita' : '📉 Novo Gasto'}</h3>
            <button onClick={() => setMostraForm(null)} className="text-[#555] hover:text-white text-lg">×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Data</label>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-[#888] mb-1">Categoria</label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]">
              {(mostraForm === 'receita' ? CAT_RECEITA : CAT_DESPESA).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#888] mb-1">Descrição (opcional)</label>
            <input type="text" placeholder="Ex: Compra de carne no fornecedor" value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
          </div>
          <div className="flex gap-2">
            <Button onClick={salvar} loading={salvando} variant={mostraForm === 'receita' ? 'success' : 'danger'} className="flex-1">
              Salvar {mostraForm === 'receita' ? 'Receita' : 'Gasto'}
            </Button>
            <Button onClick={() => setMostraForm(null)} variant="ghost">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Importar WhatsApp */}
      {mostraWpp && (
        <div className="mb-6 rounded-xl border border-[#25d366]/30 bg-[#25d366]/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm">📋 Importar gastos do WhatsApp</h3>
            <button onClick={() => setMostraWpp(false)} className="text-[#555] hover:text-white text-lg">×</button>
          </div>
          <textarea rows={5} placeholder={"[16:29, 12/03/2026] Davi lima: 150\n[17:38, 15/03/2026] Davi lima: 71\n..."}
            value={wppTexto} onChange={e => handleWppChange(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366] resize-none mb-3 font-mono" />
          {wppValores.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="flex flex-wrap gap-2 mb-2">
                {wppValores.map((v, i) => (
                  <span key={i} className="text-xs bg-[#25d366]/10 text-[#25d366] border border-[#25d366]/20 px-2 py-0.5 rounded-full">{fmt(v)}</span>
                ))}
              </div>
              <p className="text-sm font-bold text-white">
                Total: <span className="text-red-400">{fmt(wppValores.reduce((s, v) => s + v, 0))}</span>
                <span className="text-[#555] font-normal text-xs ml-2">({wppValores.length} itens)</span>
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Categoria</label>
              <select value={wppCat} onChange={e => setWppCat(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366]">
                {CAT_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Data</label>
              <input type="date" value={wppData} onChange={e => setWppData(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366]" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#888] mb-1">Descrição (opcional)</label>
            <input type="text" placeholder="Ex: Compras da semana" value={wppDesc}
              onChange={e => setWppDesc(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366]" />
          </div>
          <Button onClick={salvarWpp} loading={salvandoWpp} variant="danger" disabled={wppValores.length === 0} className="w-full">
            Salvar Gasto Total ({wppValores.length > 0 ? fmt(wppValores.reduce((s, v) => s + v, 0)) : 'R$ 0,00'})
          </Button>
        </div>
      )}

      {/* Modal resumo WhatsApp */}
      {resumoWpp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">📱 Resumo para WhatsApp</h3>
              <button onClick={() => setResumoWpp(null)} className="text-[#555] hover:text-white text-xl">×</button>
            </div>
            <pre className="text-xs text-[#ccc] bg-[#1a1a1a] rounded-lg p-3 whitespace-pre-wrap mb-4 font-sans">{resumoWpp}</pre>
            <Button onClick={() => { navigator.clipboard.writeText(resumoWpp); setToast({ message: 'Copiado!', type: 'success' }); setResumoWpp(null) }}
              variant="primary" className="w-full">
              Copiar texto
            </Button>
          </div>
        </div>
      )}

      {/* Gráfico período atual */}
      {resumo?.grafico && resumo.grafico.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">📊 Receita vs Gastos {periodo === 0 ? 'por Semana' : 'por Dia'}</h3>
            <div className="flex items-center gap-4 text-[11px] text-[#888]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Receita</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> Gastos</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-32">
            {resumo.grafico.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex gap-0.5 items-end h-24">
                  <div className="flex-1 bg-green-500/70 rounded-t-sm hover:bg-green-400 transition-all"
                    style={{ height: `${maxGrafico > 0 ? (d.receita / maxGrafico) * 100 : 0}%`, minHeight: d.receita > 0 ? '4px' : '0' }} />
                  <div className="flex-1 bg-red-500/70 rounded-t-sm hover:bg-red-400 transition-all"
                    style={{ height: `${maxGrafico > 0 ? (d.despesa / maxGrafico) * 100 : 0}%`, minHeight: d.despesa > 0 ? '4px' : '0' }} />
                </div>
                <span className="text-[8px] text-[#555]">
                  {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolução mensal */}
      {evolucao.length > 1 && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">📈 Evolução Mensal do Lucro</h3>
            <div className="flex items-center gap-4 text-[11px] text-[#888]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Fat.</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> Gastos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" /> Lucro</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-32">
            {evolucao.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex gap-0.5 items-end h-24 group relative">
                  <div className="flex-1 bg-green-500/50 rounded-t-sm"
                    style={{ height: `${(d.faturamento / maxEvolucao) * 100}%`, minHeight: d.faturamento > 0 ? '4px' : '0' }} />
                  <div className="flex-1 bg-red-500/50 rounded-t-sm"
                    style={{ height: `${(d.gastos / maxEvolucao) * 100}%`, minHeight: d.gastos > 0 ? '4px' : '0' }} />
                  <div className={`flex-1 rounded-t-sm ${d.lucro >= 0 ? 'bg-blue-400/80' : 'bg-red-600/80'}`}
                    style={{ height: `${(Math.abs(d.lucro) / maxEvolucao) * 100}%`, minHeight: Math.abs(d.lucro) > 0 ? '4px' : '0' }} />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#222] border border-[#333] rounded px-2 py-1 text-[9px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    Fat: {fmt(d.faturamento)}<br/>Lucro: {fmt(d.lucro)}
                  </div>
                </div>
                <span className="text-[8px] text-[#555]">{fmtMes(d.mes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparativo mês a mês */}
      {evolucao.length >= 2 && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">📅 Comparativo Mês a Mês</h3>
            <span className="text-[10px] text-[#555]">últimos {Math.min(evolucao.length, 3)} meses</span>
          </div>
          {(() => {
            const meses = evolucao.slice(-3)
            const maxVal = Math.max(...meses.flatMap(m => [m.faturamento, m.gastos, Math.abs(m.lucro)]), 1)
            return (
              <div className="space-y-3">
                {meses.map((d, i) => {
                  const ant = i > 0 ? meses[i - 1] : null
                  const crescFat = ant ? pctDiff(d.faturamento, ant.faturamento) : null
                  const margem = d.faturamento > 0 ? ((d.lucro / d.faturamento) * 100).toFixed(1) : '0.0'
                  const isAtual = i === meses.length - 1
                  return (
                    <div key={d.mes} className={`p-4 rounded-xl border ${isAtual ? 'border-[#f97316]/20 bg-[#f97316]/5' : 'border-[#1a1a1a] bg-[#0f0f0f]'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{fmtMes(d.mes)}</span>
                          {isAtual && <span className="text-[9px] bg-[#f97316]/20 text-[#f97316] px-1.5 py-0.5 rounded-full">atual</span>}
                        </div>
                        {crescFat !== null && (
                          <span className={`text-[10px] font-semibold ${crescFat >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {crescFat >= 0 ? '↑' : '↓'} {Math.abs(crescFat).toFixed(1)}% vs {fmtMes(meses[i - 1].mes)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: 'Faturamento', valor: d.faturamento, barVal: d.faturamento, cor: 'bg-green-500/60', txt: 'text-green-400', display: fmt(d.faturamento) },
                          { label: 'Gastos',      valor: d.gastos,       barVal: d.gastos,       cor: 'bg-red-500/60',   txt: 'text-red-400',   display: fmt(d.gastos) },
                          { label: 'Lucro',       valor: d.lucro,        barVal: Math.abs(d.lucro), cor: d.lucro >= 0 ? 'bg-blue-400/60' : 'bg-red-500/60', txt: d.lucro >= 0 ? 'text-blue-400' : 'text-red-400', display: (d.lucro >= 0 ? '+' : '-') + fmt(Math.abs(d.lucro)) },
                        ].map(m => (
                          <div key={m.label} className="flex items-center gap-2">
                            <span className="text-[10px] text-[#555] w-20 shrink-0">{m.label}</span>
                            <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                              <div className={`h-full ${m.cor} rounded-full transition-all`} style={{ width: `${maxVal > 0 ? (m.barVal / maxVal) * 100 : 0}%`, minWidth: m.barVal > 0 ? '4px' : '0' }} />
                            </div>
                            <span className={`text-[10px] font-bold ${m.txt} w-24 text-right shrink-0`}>{m.display}</span>
                          </div>
                        ))}
                      </div>
                      <p className={`text-[10px] mt-2 ${parseFloat(margem) >= 30 ? 'text-green-400' : parseFloat(margem) >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                        Margem: {margem}%
                      </p>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* DRE Mensal */}
      {evolucao.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">📋 DRE — Resultado por Mês</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a1a1a]">
                  <th className="px-4 py-2 text-left text-[#555] font-semibold">Mês</th>
                  <th className="px-4 py-2 text-right text-green-400 font-semibold">Faturamento</th>
                  <th className="px-4 py-2 text-right text-red-400 font-semibold">Gastos</th>
                  <th className="px-4 py-2 text-right text-blue-400 font-semibold">Lucro</th>
                  <th className="px-4 py-2 text-right text-yellow-400 font-semibold">Margem</th>
                </tr>
              </thead>
              <tbody>
                {[...evolucao].reverse().map((d, i) => {
                  const margem = d.faturamento > 0 ? ((d.lucro / d.faturamento) * 100).toFixed(1) : '0.0'
                  const isPositivo = d.lucro >= 0
                  return (
                    <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors">
                      <td className="px-4 py-2.5 text-white font-medium">{fmtMes(d.mes)}</td>
                      <td className="px-4 py-2.5 text-right text-green-400">{fmt(d.faturamento)}</td>
                      <td className="px-4 py-2.5 text-right text-red-400">{fmt(d.gastos)}</td>
                      <td className={`px-4 py-2.5 text-right font-bold ${isPositivo ? 'text-blue-400' : 'text-red-400'}`}>
                        {isPositivo ? '+' : ''}{fmt(d.lucro)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${parseFloat(margem) >= 30 ? 'text-green-400' : parseFloat(margem) >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {margem}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#0f0f0f]">
                  <td className="px-4 py-2.5 text-[#888] font-semibold text-[11px] uppercase tracking-wider">Total</td>
                  <td className="px-4 py-2.5 text-right text-green-400 font-bold">{fmt(evolucao.reduce((s, d) => s + d.faturamento, 0))}</td>
                  <td className="px-4 py-2.5 text-right text-red-400 font-bold">{fmt(evolucao.reduce((s, d) => s + d.gastos, 0))}</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${evolucao.reduce((s, d) => s + d.lucro, 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {evolucao.reduce((s, d) => s + d.lucro, 0) >= 0 ? '+' : ''}{fmt(evolucao.reduce((s, d) => s + d.lucro, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#555]">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Projeção de fechamento */}
      {(() => {
        const hoje = new Date()
        const mesAtual = hoje.toISOString().slice(0, 7)
        const entradasMes = entradas.filter(e => e.data && e.data.startsWith(mesAtual))
        const diaDoMes = hoje.getDate()
        const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
        const diasRestantes = diasNoMes - diaDoMes
        if (diaDoMes < 3 || entradasMes.length === 0) return null
        const fat = entradasMes.filter(e => e.tipo === 'receita').reduce((s, e) => s + e.valor, 0)
        const gas = entradasMes.filter(e => e.tipo === 'despesa').reduce((s, e) => s + e.valor, 0)
        const fatDiario = fat / diaDoMes
        const gasDiario = gas / diaDoMes
        const fatProj = fat + fatDiario * diasRestantes
        const gasProj = gas + gasDiario * diasRestantes
        const lucroProj = fatProj - gasProj
        const margemProj = fatProj > 0 ? ((lucroProj / fatProj) * 100).toFixed(1) : '0.0'
        const isPositivo = lucroProj >= 0
        return (
          <div className="mb-6 rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔮</span>
              <div>
                <h3 className="text-sm font-bold text-white">Projeção de fechamento do mês</h3>
                <p className="text-[11px] text-[#666]">Baseada nos últimos {diaDoMes} dias — {diasRestantes} dias restantes no mês</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Faturamento proj.', valor: fmt(fatProj), cor: 'text-green-400' },
                { label: 'Gastos proj.',      valor: fmt(gasProj),  cor: 'text-red-400'   },
                { label: 'Lucro proj.',       valor: (isPositivo ? '+' : '') + fmt(lucroProj), cor: isPositivo ? 'text-blue-400' : 'text-red-400' },
                { label: 'Margem proj.',      valor: `${margemProj}%`, cor: parseFloat(margemProj) >= 30 ? 'text-green-400' : parseFloat(margemProj) >= 15 ? 'text-yellow-400' : 'text-red-400' },
              ].map(m => (
                <div key={m.label} className="bg-[#111] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className={`text-base font-black ${m.cor}`}>{m.valor}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#555] mt-3 text-center">
              ⚠️ Estimativa baseada na média diária atual — valores reais podem variar
            </p>
          </div>
        )
      })()}

      {/* Top despesas */}
      {resumo?.topDespesas && resumo.topDespesas.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-5">
          <h3 className="text-sm font-bold text-white mb-4">🔍 Maiores Gastos por Categoria</h3>
          <div className="space-y-2">
            {resumo.topDespesas.map((d, i) => {
              const pct = resumo.gastos > 0 ? (d.valor / resumo.gastos) * 100 : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-[#888] w-40 truncate">{d.categoria}</span>
                  <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-red-400 font-semibold w-20 text-right">{fmt(d.valor)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista de lançamentos */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Lançamentos ({entradasPeriodo.length})</h3>
          <button onClick={carregar} className="text-xs text-[#f97316] hover:underline">Atualizar</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#555] text-sm">Carregando…</div>
        ) : entradasPeriodo.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[#555] text-sm">Nenhum lançamento neste período</p>
            <p className="text-[#333] text-xs mt-1">Adicione receitas ou gastos acima</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {entradasPeriodo.map(e => (
              <div key={e.id}>
                {editandoId === e.id ? (
                  // Linha de edição inline
                  <div className="px-5 py-3 bg-[#161616]">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input type="number" step="0.01" value={formEdit.valor}
                        onChange={ev => setFormEdit(f => ({ ...f, valor: ev.target.value }))}
                        className="bg-[#1a1a1a] border border-[#f97316] rounded px-2 py-1 text-sm text-white focus:outline-none" />
                      <input type="date" value={formEdit.data}
                        onChange={ev => setFormEdit(f => ({ ...f, data: ev.target.value }))}
                        className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm text-white focus:outline-none" />
                    </div>
                    <select value={formEdit.categoria} onChange={ev => setFormEdit(f => ({ ...f, categoria: ev.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm text-white focus:outline-none mb-2">
                      {(e.tipo === 'receita' ? CAT_RECEITA : CAT_DESPESA).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" value={formEdit.descricao} placeholder="Descrição"
                      onChange={ev => setFormEdit(f => ({ ...f, descricao: ev.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm text-white focus:outline-none mb-2" />
                    <div className="flex gap-2">
                      <Button onClick={salvarEdicao} loading={salvandoEdit} variant="primary" className="flex-1 text-xs py-1">Salvar</Button>
                      <Button onClick={() => setEditandoId(null)} variant="ghost" className="text-xs py-1">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  // Linha normal
                  <div className="flex items-center gap-4 px-5 py-3 hover:bg-[#161616] transition-colors">
                    <div className={`w-2 h-8 rounded-full shrink-0 ${e.tipo === 'receita' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#888]">{fmtData(e.data)}</span>
                        <span className="text-[10px] bg-[#1a1a1a] text-[#666] px-2 py-0.5 rounded-full">{e.categoria}</span>
                      </div>
                      {e.descricao && <p className="text-xs text-[#666] truncate mt-0.5">{e.descricao}</p>}
                    </div>
                    <span className={`font-bold text-sm shrink-0 ${e.tipo === 'receita' ? 'text-green-400' : 'text-red-400'}`}>
                      {e.tipo === 'receita' ? '+' : '-'}{fmt(e.valor)}
                    </span>
                    <button onClick={() => abrirEdicao(e)} className="text-[#333] hover:text-[#f97316] transition-colors text-sm shrink-0">✏️</button>
                    <button onClick={() => deletar(e.id)} disabled={deletandoId === e.id}
                      className="text-[#333] hover:text-red-400 transition-colors text-sm disabled:opacity-50 shrink-0">
                      {deletandoId === e.id ? '…' : '🗑️'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
