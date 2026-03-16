const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.resolve(__dirname, "../data/financeiro.json");

// ──────────────────────────────────────────────
// CATEGORIAS
// ──────────────────────────────────────────────
const CATEGORIAS_RECEITA = [
  "Vendas no local", "Delivery", "Ifood", "Outros",
];

const CATEGORIAS_DESPESA = [
  "Ingredientes / Insumos", "Embalagens", "Marketing / Anúncios",
  "Funcionários", "Aluguel", "Gás / Energia", "Equipamentos", "Outros",
];

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function lerDados() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ entradas: [] }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { entradas: [] };
  }
}

function salvarDados(dados) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 2));
}

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

function adicionarEntrada({ tipo, valor, categoria, descricao, data }) {
  if (!["receita", "despesa"].includes(tipo)) throw new Error("tipo deve ser 'receita' ou 'despesa'");
  if (!valor || isNaN(valor) || valor <= 0) throw new Error("valor inválido");

  const dados = lerDados();
  const entrada = {
    id: Date.now().toString(),
    tipo,
    valor: parseFloat(parseFloat(valor).toFixed(2)),
    categoria: categoria || "Outros",
    descricao: descricao || "",
    data: data || new Date().toISOString().slice(0, 10),
    criadoEm: new Date().toISOString(),
  };

  dados.entradas.push(entrada);
  salvarDados(dados);
  return entrada;
}

function removerEntrada(id) {
  const dados = lerDados();
  const antes = dados.entradas.length;
  dados.entradas = dados.entradas.filter((e) => e.id !== id);
  if (dados.entradas.length === antes) throw new Error("Entrada não encontrada");
  salvarDados(dados);
  return { removido: id };
}

function listarEntradas(filtros = {}) {
  const dados = lerDados();
  let entradas = [...dados.entradas].sort((a, b) => new Date(b.data) - new Date(a.data));

  if (filtros.tipo) entradas = entradas.filter((e) => e.tipo === filtros.tipo);
  if (filtros.dataInicio) entradas = entradas.filter((e) => e.data >= filtros.dataInicio);
  if (filtros.dataFim)    entradas = entradas.filter((e) => e.data <= filtros.dataFim);

  return entradas;
}

// ──────────────────────────────────────────────
// RESUMO / MÉTRICAS
// ──────────────────────────────────────────────

function calcularResumo(dias = 7) {
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - (dias - 1));
  const dataInicioStr = dataInicio.toISOString().slice(0, 10);

  const entradas = listarEntradas({ dataInicio: dataInicioStr });

  const faturamento = entradas.filter((e) => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
  const gastos      = entradas.filter((e) => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
  const lucro       = faturamento - gastos;
  const margem      = faturamento > 0 ? parseFloat(((lucro / faturamento) * 100).toFixed(1)) : 0;

  // Agrupa por dia para o gráfico
  const porDia = {};
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    porDia[key] = { data: key, receita: 0, despesa: 0 };
  }

  entradas.forEach((e) => {
    if (porDia[e.data]) {
      porDia[e.data][e.tipo === "receita" ? "receita" : "despesa"] += e.valor;
    }
  });

  // Top categorias de despesa
  const catDespesa = {};
  entradas.filter((e) => e.tipo === "despesa").forEach((e) => {
    catDespesa[e.categoria] = (catDespesa[e.categoria] || 0) + e.valor;
  });

  return {
    periodo: dias,
    dataInicio: dataInicioStr,
    faturamento: parseFloat(faturamento.toFixed(2)),
    gastos:      parseFloat(gastos.toFixed(2)),
    lucro:       parseFloat(lucro.toFixed(2)),
    margem,
    totalEntradas: entradas.length,
    grafico: Object.values(porDia),
    topDespesas: Object.entries(catDespesa)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, val]) => ({ categoria: cat, valor: parseFloat(val.toFixed(2)) })),
  };
}

module.exports = {
  adicionarEntrada,
  removerEntrada,
  listarEntradas,
  calcularResumo,
  CATEGORIAS_RECEITA,
  CATEGORIAS_DESPESA,
};
