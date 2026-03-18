const { conectar } = require("./db");

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
// HELPER — linha do banco → objeto para o frontend
// ──────────────────────────────────────────────
function rowParaObj(row) {
  return {
    id:        row.id.toString(),
    tipo:      row.tipo,
    valor:     parseFloat(row.valor),
    categoria: row.categoria,
    descricao: row.descricao,
    data:      row.data instanceof Date
                 ? row.data.toISOString().slice(0, 10)
                 : String(row.data).slice(0, 10),
    criadoEm: row.criado_em,
  };
}

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

async function adicionarEntrada({ tipo, valor, categoria, descricao, data }) {
  const pool = await conectar();

  if (!["receita", "despesa"].includes(tipo)) throw new Error("tipo deve ser 'receita' ou 'despesa'");
  if (!valor || isNaN(valor) || valor <= 0)   throw new Error("valor inválido");

  const dataFinal = data || new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `INSERT INTO financeiro (tipo, valor, categoria, descricao, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      tipo,
      parseFloat(parseFloat(valor).toFixed(2)),
      categoria || "Outros",
      descricao || "",
      dataFinal,
    ]
  );

  return rowParaObj(rows[0]);
}

async function removerEntrada(id) {
  const pool = await conectar();

  const { rowCount } = await pool.query(
    "DELETE FROM financeiro WHERE id = $1",
    [id]
  );

  if (rowCount === 0) throw new Error("Entrada não encontrada");
  return { removido: id };
}

async function listarEntradas(filtros = {}) {
  const pool = await conectar();

  const conds = [];
  const vals  = [];

  if (filtros.tipo) {
    vals.push(filtros.tipo);
    conds.push(`tipo = $${vals.length}`);
  }
  if (filtros.dataInicio) {
    vals.push(filtros.dataInicio);
    conds.push(`data >= $${vals.length}`);
  }
  if (filtros.dataFim) {
    vals.push(filtros.dataFim);
    conds.push(`data <= $${vals.length}`);
  }

  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const { rows } = await pool.query(
    `SELECT * FROM financeiro ${where} ORDER BY data DESC, criado_em DESC`,
    vals
  );

  return rows.map(rowParaObj);
}

// ──────────────────────────────────────────────
// RESUMO / MÉTRICAS
// ──────────────────────────────────────────────

async function calcularResumo(dias = 7) {
  const pool = await conectar();

  const tudoHistorico = dias === 0;
  let dataInicioStr;
  let rows;

  if (tudoHistorico) {
    ({ rows } = await pool.query(
      "SELECT * FROM financeiro ORDER BY data ASC, criado_em ASC"
    ));
    dataInicioStr = rows.length > 0
      ? rowParaObj(rows[0]).data
      : new Date().toISOString().slice(0, 10);
  } else {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - (dias - 1));
    dataInicioStr = dataInicio.toISOString().slice(0, 10);

    ({ rows } = await pool.query(
      "SELECT * FROM financeiro WHERE data >= $1 ORDER BY data ASC",
      [dataInicioStr]
    ));
  }

  const entradas = rows.map(rowParaObj);

  const faturamento = entradas.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
  const gastos      = entradas.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
  const lucro       = faturamento - gastos;
  const margem      = faturamento > 0 ? parseFloat(((lucro / faturamento) * 100).toFixed(1)) : 0;

  // Agrupamento por semana (histórico) ou por dia
  const porDia = {};
  if (tudoHistorico) {
    entradas.forEach(e => {
      const d = new Date(e.data + "T12:00:00");
      const inicio = new Date(d);
      inicio.setDate(d.getDate() - d.getDay());
      const key = inicio.toISOString().slice(0, 10);
      if (!porDia[key]) porDia[key] = { data: key, receita: 0, despesa: 0 };
      porDia[key][e.tipo === "receita" ? "receita" : "despesa"] += e.valor;
    });
  } else {
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      porDia[key] = { data: key, receita: 0, despesa: 0 };
    }
    entradas.forEach(e => {
      if (porDia[e.data]) {
        porDia[e.data][e.tipo === "receita" ? "receita" : "despesa"] += e.valor;
      }
    });
  }

  // Top categorias de despesa
  const catDespesa = {};
  entradas.filter(e => e.tipo === "despesa").forEach(e => {
    catDespesa[e.categoria] = (catDespesa[e.categoria] || 0) + e.valor;
  });

  return {
    periodo: tudoHistorico ? "tudo" : dias,
    dataInicio: dataInicioStr,
    faturamento: parseFloat(faturamento.toFixed(2)),
    gastos:      parseFloat(gastos.toFixed(2)),
    lucro:       parseFloat(lucro.toFixed(2)),
    margem,
    totalEntradas: entradas.length,
    grafico: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
    topDespesas: Object.entries(catDespesa)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, val]) => ({ categoria: cat, valor: parseFloat(val.toFixed(2)) })),
  };
}

// ──────────────────────────────────────────────
// RESUMO POR INTERVALO CUSTOMIZADO (ex: "esta semana")
// ──────────────────────────────────────────────

async function calcularResumoCustom(dataInicio, dataFim = null) {
  const pool = await conectar();

  const params = [dataInicio];
  let whereFim = "";
  if (dataFim) {
    params.push(dataFim);
    whereFim = ` AND data <= $2`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM financeiro WHERE data >= $1${whereFim} ORDER BY data ASC`,
    params
  );

  const entradas = rows.map(rowParaObj);

  const faturamento = entradas.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
  const gastos      = entradas.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
  const lucro       = faturamento - gastos;
  const margem      = faturamento > 0 ? parseFloat(((lucro / faturamento) * 100).toFixed(1)) : 0;

  // Agrupamento por dia
  const porDia = {};
  entradas.forEach(e => {
    if (!porDia[e.data]) porDia[e.data] = { data: e.data, receita: 0, despesa: 0 };
    porDia[e.data][e.tipo === "receita" ? "receita" : "despesa"] += e.valor;
  });

  const catDespesa = {};
  entradas.filter(e => e.tipo === "despesa").forEach(e => {
    catDespesa[e.categoria] = (catDespesa[e.categoria] || 0) + e.valor;
  });

  return {
    periodo: "custom",
    dataInicio,
    dataFim: dataFim || new Date().toISOString().slice(0, 10),
    faturamento: parseFloat(faturamento.toFixed(2)),
    gastos:      parseFloat(gastos.toFixed(2)),
    lucro:       parseFloat(lucro.toFixed(2)),
    margem,
    totalEntradas: entradas.length,
    grafico: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
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
  calcularResumoCustom,
  CATEGORIAS_RECEITA,
  CATEGORIAS_DESPESA,
};
