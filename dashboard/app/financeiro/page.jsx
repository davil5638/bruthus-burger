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

  // ── Resumo WhatsApp ──
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
        <div className="mb-4 rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-[#888]">Meta semanal</span>
            <span className="text-xs font-semibold text-white">{fmt(resumo?.faturamento || 0)} / {fmt(metaSemanal)}</span>
          </div>
          <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${metaPct >= 100 ? 'bg-green-500' : metaPct >= 70 ? 'bg-yellow-500' : 'bg-[#f97316]'}`}
              style={{ width: `${metaPct}%` }} />
          </div>
          <p className="text-[10px] text-[#555] mt-1">{metaPct.toFixed(0)}% da meta atingida</p>
        </div>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Faturamento', valor: resumo?.faturamento, cor: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', emoji: '📈', pct: pctFat },
          { label: 'Gastos',      valor: resumo?.gastos,      cor: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20',   emoji: '📉', pct: pctGast, invertPct: true },
          { label: 'Lucro',       valor: resumo?.lucro,       cor: resumo?.lucro >= 0 ? 'text-blue-400' : 'text-red-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', emoji: '💵', pct: pctLucro },
          { label: 'Margem',      valor: null,                cor: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', emoji: '📊', custom: `${resumo?.margem ?? '—'}%` },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{c.emoji}</span>
              <span className="text-[10px] text-[#555] uppercase tracking-wider">{c.label}</span>
            </div>
            <p className={`text-xl font-bold ${c.cor}`}>
              {loading ? '…' : (c.custom || fmt(c.valor))}
            </p>
            {c.pct !== null && c.pct !== undefined && resumoAnt && (
              <p className={`text-[10px] mt-1 font-semibold ${
                c.invertPct ? (c.pct <= 0 ? 'text-green-400' : 'text-red-400') : (c.pct >= 0 ? 'text-green-400' : 'text-red-400')
              }`}>
                {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(0)}% vs sem. ant.
              </p>
            )}
            {(!c.pct && c.pct !== 0) && (
              <p className="text-[10px] text-[#444] mt-1">
                {periodo === 0 ? 'desde a abertura' : periodo === 'semana' ? fmtRango(getRangoSemana(semanaOffset)) : `últimos ${periodo} dias`}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Botões ação */}
      <div className="flex gap-3 mb-3">
        <button onClick={() => { abrirForm('receita'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 font-semibold text-sm transition-all">
          + Receita
        </button>
        <button onClick={() => { abrirForm('despesa'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold text-sm transition-all">
          − Gasto
        </button>
        <button onClick={() => { setMostraWpp(v => !v); setMostraForm(null) }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 font-semibold text-sm transition-all">
          📋 WhatsApp
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={exportarCSV}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#333] bg-[#111] text-[#888] hover:text-white font-semibold text-sm transition-all">
          ⬇️ Exportar CSV
        </button>
        <button onClick={gerarResumoWpp}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#333] bg-[#111] text-[#888] hover:text-white font-semibold text-sm transition-all">
          📱 Resumo p/ WhatsApp
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
