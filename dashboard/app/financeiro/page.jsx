'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

// Ciclo Ter→Seg: retorna a última terça-feira (início da semana atual)
function getUltimaTerca() {
  const hoje = new Date()
  const dia = hoje.getDay() // 0=Dom,1=Seg,2=Ter...
  const diasDesdeTerca = (dia + 5) % 7 // Ter=0, Qua=1, ... Seg=6
  const terca = new Date(hoje)
  terca.setDate(hoje.getDate() - diasDesdeTerca)
  return terca.toISOString().slice(0, 10)
}

// Retorna a terça anterior à semana atual (início da semana passada)
function getTercaSemanaPassada() {
  const terca = new Date(getUltimaTerca())
  terca.setDate(terca.getDate() - 7)
  return terca.toISOString().slice(0, 10)
}

// Retorna a segunda-feira da semana passada (fim da semana passada)
function getSegSemanaPassada() {
  const terca = new Date(getUltimaTerca())
  terca.setDate(terca.getDate() - 1) // dia anterior à terça atual = segunda passada
  return terca.toISOString().slice(0, 10)
}

const PERIODOS = [
  { valor: 'semana',        label: 'Semana atual'   },
  { valor: 'semana-passada', label: 'Semana passada' },
  { valor: 14,              label: '14 dias'        },
  { valor: 30,              label: '30 dias'        },
  { valor: 0,               label: 'Todos'          },
]

const CAT_RECEITA = ['Vendas no local', 'Delivery', 'Ifood', 'Outros']
const CAT_DESPESA = ['Ingredientes / Insumos', 'Embalagens', 'Marketing / Anúncios', 'Funcionários', 'Aluguel', 'Gás / Energia', 'Equipamentos', 'Outros']

function fmt(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }
function fmtData(d) { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }

export default function FinanceiroPage() {
  const [periodo, setPeriodo]     = useState('semana')
  const [resumo, setResumo]       = useState(null)
  const [entradas, setEntradas]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)

  // Formulário
  const [mostraForm, setMostraForm] = useState(null) // 'receita' | 'despesa' | null
  const [form, setForm]             = useState({ valor: '', categoria: '', descricao: '', data: new Date().toISOString().slice(0, 10) })
  const [salvando, setSalvando]     = useState(false)
  const [deletandoId, setDeletandoId] = useState(null)

  // Importar do WhatsApp
  const [mostraWpp, setMostraWpp]   = useState(false)
  const [wppTexto, setWppTexto]     = useState('')
  const [wppValores, setWppValores] = useState([])
  const [wppCat, setWppCat]         = useState(CAT_DESPESA[0])
  const [wppDesc, setWppDesc]       = useState('')
  const [wppData, setWppData]       = useState(new Date().toISOString().slice(0, 10))
  const [salvandoWpp, setSalvandoWpp] = useState(false)

  function parsearWpp(texto) {
    const linhas = texto.split('\n').filter(l => l.trim())
    const valores = []
    for (const linha of linhas) {
      // Remove tudo antes do último ": " e tenta extrair número
      const partes = linha.split(': ')
      const ultimo = partes[partes.length - 1].trim().replace(',', '.')
      const val = parseFloat(ultimo)
      if (!isNaN(val) && val > 0) valores.push(val)
    }
    return valores
  }

  function handleWppChange(texto) {
    setWppTexto(texto)
    setWppValores(parsearWpp(texto))
  }

  async function salvarWpp() {
    const total = wppValores.reduce((s, v) => s + v, 0)
    if (total <= 0) { setToast({ message: 'Nenhum valor encontrado no texto!', type: 'error' }); return }
    setSalvandoWpp(true)
    try {
      await api.post('/financeiro', { tipo: 'despesa', valor: total, categoria: wppCat, descricao: wppDesc || `Importado do WhatsApp (${wppValores.length} lançamentos)`, data: wppData })
      setToast({ message: `Gasto de ${fmt(total)} registrado!`, type: 'success' })
      setMostraWpp(false)
      setWppTexto('')
      setWppValores([])
      carregar()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setSalvandoWpp(false) }
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      let resumoUrl
      if (periodo === 'semana') {
        resumoUrl = `/financeiro/resumo?dataInicio=${getUltimaTerca()}`
      } else if (periodo === 'semana-passada') {
        resumoUrl = `/financeiro/resumo?dataInicio=${getTercaSemanaPassada()}&dataFim=${getSegSemanaPassada()}`
      } else {
        resumoUrl = `/financeiro/resumo?dias=${periodo}`
      }
      const [r, e] = await Promise.all([
        api.get(resumoUrl),
        api.get('/financeiro'),
      ])
      setResumo(r.resumo)
      setEntradas(e.entradas)
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally { setLoading(false) }
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  function abrirForm(tipo) {
    setMostraForm(tipo)
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
      setMostraForm(null)
      carregar()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setSalvando(false) }
  }

  async function deletar(id) {
    setDeletandoId(id)
    try {
      await api.delete ? fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/financeiro/${id}`, { method: 'DELETE' }) : null
      // fallback manual delete request
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/financeiro/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao deletar')
      setToast({ message: 'Lançamento removido!', type: 'success' })
      carregar()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setDeletandoId(null) }
  }

  const maxGrafico = resumo?.grafico ? Math.max(...resumo.grafico.map(d => Math.max(d.receita, d.despesa)), 1) : 1

  // Entradas do período exibido
  const entradasPeriodo = (() => {
    if (periodo === 0) return entradas
    if (periodo === 'semana') {
      const terca = getUltimaTerca()
      return entradas.filter(e => e.data >= terca)
    }
    if (periodo === 'semana-passada') {
      const ini = getTercaSemanaPassada()
      const fim = getSegSemanaPassada()
      return entradas.filter(e => e.data >= ini && e.data <= fim)
    }
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (periodo - 1))
    return entradas.filter(e => new Date(e.data + 'T12:00:00') >= cutoff)
  })()

  return (
    <div className="max-w-4xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="💰" title="Controle Financeiro" description="Registre faturamento e gastos da semana — veja lucro e margem em tempo real">
        <div className="flex gap-2">
          {PERIODOS.map(p => (
            <button key={p.valor} onClick={() => setPeriodo(p.valor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodo === p.valor ? 'bg-[#f97316] text-white' : 'bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333]'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Faturamento',  valor: resumo?.faturamento, cor: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  emoji: '📈' },
          { label: 'Gastos',       valor: resumo?.gastos,      cor: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    emoji: '📉' },
          { label: 'Lucro',        valor: resumo?.lucro,       cor: resumo?.lucro >= 0 ? 'text-blue-400' : 'text-red-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', emoji: '💵' },
          { label: 'Margem',       valor: null,                cor: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', emoji: '📊', custom: `${resumo?.margem ?? '—'}%` },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{c.emoji}</span>
              <span className="text-[10px] text-[#555] uppercase tracking-wider">{c.label}</span>
            </div>
            <p className={`text-xl font-bold ${c.cor}`}>
              {loading ? '…' : (c.custom || fmt(c.valor))}
            </p>
            <p className="text-[10px] text-[#444] mt-1">
              {periodo === 0 ? 'desde a abertura' : periodo === 'semana' ? 'desde terça-feira' : periodo === 'semana-passada' ? 'ter → seg passados' : `últimos ${periodo} dias`}
            </p>
          </div>
        ))}
      </div>

      {/* Botões adicionar */}
      <div className="flex gap-3 mb-3">
        <button onClick={() => { abrirForm('receita'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 font-semibold text-sm transition-all">
          + Adicionar Receita
        </button>
        <button onClick={() => { abrirForm('despesa'); setMostraWpp(false) }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold text-sm transition-all">
          − Adicionar Gasto
        </button>
      </div>
      <button onClick={() => { setMostraWpp(v => !v); setMostraForm(null) }}
        className="w-full flex items-center justify-center gap-2 py-2.5 mb-6 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 font-semibold text-sm transition-all">
        📋 Importar gastos do WhatsApp
      </button>

      {/* Formulário inline */}
      {mostraForm && (
        <div className={`mb-6 rounded-xl border p-5 animate-slide-up ${
          mostraForm === 'receita' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm">
              {mostraForm === 'receita' ? '📈 Nova Receita' : '📉 Novo Gasto'}
            </h3>
            <button onClick={() => setMostraForm(null)} className="text-[#555] hover:text-white text-lg">×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" min="0" placeholder="0,00"
                value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
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
              {(mostraForm === 'receita' ? CAT_RECEITA : CAT_DESPESA).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#888] mb-1">Descrição (opcional)</label>
            <input type="text" placeholder="Ex: Compra de carne no fornecedor"
              value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316]" />
          </div>
          <div className="flex gap-2">
            <Button onClick={salvar} loading={salvando}
              variant={mostraForm === 'receita' ? 'success' : 'danger'} className="flex-1">
              Salvar {mostraForm === 'receita' ? 'Receita' : 'Gasto'}
            </Button>
            <Button onClick={() => setMostraForm(null)} variant="ghost">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Importar do WhatsApp */}
      {mostraWpp && (
        <div className="mb-6 rounded-xl border border-[#25d366]/30 bg-[#25d366]/5 p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm">📋 Importar gastos do WhatsApp</h3>
            <button onClick={() => setMostraWpp(false)} className="text-[#555] hover:text-white text-lg">×</button>
          </div>

          <label className="block text-xs text-[#888] mb-1">Cole as mensagens do WhatsApp</label>
          <textarea rows={6} placeholder={"[16:29, 12/03/2026] Davi lima: 150\n[17:38, 15/03/2026] Davi lima: 71\n..."}
            value={wppTexto} onChange={e => handleWppChange(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366] resize-none mb-3 font-mono" />

          {wppValores.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="flex flex-wrap gap-2 mb-2">
                {wppValores.map((v, i) => (
                  <span key={i} className="text-xs bg-[#25d366]/10 text-[#25d366] border border-[#25d366]/20 px-2 py-0.5 rounded-full">
                    {fmt(v)}
                  </span>
                ))}
              </div>
              <p className="text-sm font-bold text-white">
                Total: <span className="text-red-400">{fmt(wppValores.reduce((s, v) => s + v, 0))}</span>
                <span className="text-[#555] font-normal text-xs ml-2">({wppValores.length} lançamentos)</span>
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
              <label className="block text-xs text-[#888] mb-1">Data de referência</label>
              <input type="date" value={wppData} onChange={e => setWppData(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366]" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#888] mb-1">Descrição (opcional)</label>
            <input type="text" placeholder="Ex: Compras da semana"
              value={wppDesc} onChange={e => setWppDesc(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25d366]" />
          </div>
          <Button onClick={salvarWpp} loading={salvandoWpp} variant="danger"
            disabled={wppValores.length === 0} className="w-full">
            Salvar Gasto Total ({wppValores.length > 0 ? fmt(wppValores.reduce((s, v) => s + v, 0)) : 'R$ 0,00'})
          </Button>
        </div>
      )}

      {/* Gráfico de barras */}
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
                  <div className="flex-1 bg-green-500/70 rounded-t-sm transition-all hover:bg-green-400"
                    style={{ height: `${maxGrafico > 0 ? (d.receita / maxGrafico) * 100 : 0}%`, minHeight: d.receita > 0 ? '4px' : '0' }} />
                  <div className="flex-1 bg-red-500/70 rounded-t-sm transition-all hover:bg-red-400"
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
          <h3 className="text-sm font-bold text-white">Lançamentos Recentes</h3>
          <button onClick={carregar} className="text-xs text-[#f97316] hover:underline">Atualizar</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#555] text-sm">Carregando…</div>
        ) : entradasPeriodo.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[#555] text-sm">Nenhum lançamento ainda</p>
            <p className="text-[#333] text-xs mt-1">Adicione sua primeira receita ou gasto acima</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {entradasPeriodo.map(e => (
              <div key={e.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#161616] transition-colors">
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
                <button onClick={() => deletar(e.id)} disabled={deletandoId === e.id}
                  className="text-[#333] hover:text-red-400 transition-colors text-sm disabled:opacity-50 shrink-0">
                  {deletandoId === e.id ? '…' : '🗑️'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
