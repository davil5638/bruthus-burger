const { conectar } = require("./db");

// ──────────────────────────────────────────────
// CATEGORIAS
// ──────────────────────────────────────────────
const CATEGORIAS_RECEITA = [
  "Vendas no local", "Delivery", "Ifood", "Outros",
];

const CATEGORIAS_DESPESA = [
  "Ingredientes / Insumos", "Embalagens", "Marketing / Anúncios",
  "Funcionários", "Aluguel", "Gás / Energia", "Equipamentos",
  "Custos Fixos", "Taxas / Comissões", "Outros",
];

// Categoria onde a conciliação lança comissão de marketplace e taxa de
// maquineta. Não é despesa de operação: é dinheiro que NUNCA chegou na
// conta da loja. Ver `somar()` logo abaixo.
const CATEGORIA_TAXAS = "Taxas / Comissões";

const r2 = (v) => parseFloat(Number(v || 0).toFixed(2));

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
// Quanto sobra por canal.
//
// Junta a receita de cada categoria com as taxas daquele canal — comissão
// do iFood, taxa da maquineta — que `conciliacaoOlaClick` lança em
// "Taxas / Comissões" citando o canal na descrição.
//
// É o número que responde se vale empurrar o cliente para o cardápio
// próprio em vez do marketplace: em outubro/2026, cada real vendido no
// iFood deixou 77 centavos, contra 99 no canal próprio.
// ──────────────────────────────────────────────
function resumirCanais(entradas) {
  const porCanal = {};
  const pegar = (canal) => (porCanal[canal] = porCanal[canal] || { canal, receita: 0, taxas: 0 });

  for (const e of entradas) {
    if (e.tipo === "receita") {
      pegar(e.categoria).receita += e.valor;
      continue;
    }
    if (e.categoria !== "Taxas / Comissões") continue;
    const canal = CATEGORIAS_RECEITA.find((c) => (e.descricao || "").includes(c));
    if (canal) pegar(canal).taxas += e.valor;
  }

  return Object.values(porCanal)
    .filter((c) => c.receita > 0)
    .map((c) => ({
      canal:    c.canal,
      receita:  parseFloat(c.receita.toFixed(2)),
      taxas:    parseFloat(c.taxas.toFixed(2)),
      liquido:  parseFloat((c.receita - c.taxas).toFixed(2)),
      retencao: parseFloat((((c.receita - c.taxas) / c.receita) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.receita - a.receita);
}

// ──────────────────────────────────────────────
// Os totais da tela, a partir dos lançamentos do período.
//
// FATURAMENTO É LÍQUIDO, de propósito (decisão do dono, 09/11/2026):
// "pode mostrar o valor líquido no faturamento, se não quebra a margem
// com valores irreais". Comissão do iFood e taxa de maquineta saem da
// receita, porque esse dinheiro nunca entra na conta da loja — deixá-las
// no topo inflava o faturamento e a margem saía sobre uma venda que não
// existiu.
//
// E por isso elas TAMBÉM saem de `gastos`. É o detalhe que faz a conta
// fechar: as taxas já são lançadas como despesa pela conciliação, então
// descontar da receita sem tirar dos gastos as contaria duas vezes e o
// lucro cairia o valor delas. Descontando dos dois lados, o lucro é
// exatamente o mesmo de antes — muda só a régua da margem, que agora é
// sobre o que de fato chega.
//
// Exemplo real, semana de 03 a 09/11/2026:
//   bruto 8.023,95 − taxas 380,23 = líquido 7.643,72
//   gastos 4.696,34 − 380,23 = 4.316,11
//   lucro 3.327,61 (igual ao de antes) → margem 43,5% em vez de 41,5%
// ──────────────────────────────────────────────
function somar(entradas) {
  let bruto = 0, taxas = 0, despesas = 0;

  for (const e of entradas) {
    if (e.tipo === "receita")             { bruto    += e.valor; continue; }
    if (e.categoria === CATEGORIA_TAXAS)  { taxas    += e.valor; continue; }
    despesas += e.valor;
  }

  const faturamento = bruto - taxas;
  const lucro       = faturamento - despesas;

  return {
    faturamentoBruto: r2(bruto),
    taxas:            r2(taxas),
    faturamento:      r2(faturamento),
    gastos:           r2(despesas),
    lucro:            r2(lucro),
    margem: faturamento > 0 ? parseFloat(((lucro / faturamento) * 100).toFixed(1)) : 0,
  };
}

// Mesma regra no gráfico: a taxa abate a receita do dia em que foi
// lançada, em vez de virar barra de gasto.
function acumularNoDia(balde, e) {
  if (!balde) return;
  if (e.tipo === "receita")            balde.receita += e.valor;
  else if (e.categoria === CATEGORIA_TAXAS) balde.receita -= e.valor;
  else                                 balde.despesa += e.valor;
}

// Top de despesa sem as taxas — elas não estão mais em `gastos`, e
// listá-las aqui faria a soma da lista passar do total mostrado.
function topDespesas(entradas) {
  const cat = {};
  entradas
    .filter((e) => e.tipo === "despesa" && e.categoria !== CATEGORIA_TAXAS)
    .forEach((e) => { cat[e.categoria] = (cat[e.categoria] || 0) + e.valor; });

  return Object.entries(cat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([categoria, valor]) => ({ categoria, valor: r2(valor) }));
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

  const totais = somar(entradas);

  // Agrupamento por semana (histórico) ou por dia
  const porDia = {};
  if (tudoHistorico) {
    entradas.forEach(e => {
      const d = new Date(e.data + "T12:00:00");
      const inicio = new Date(d);
      inicio.setDate(d.getDate() - d.getDay());
      const key = inicio.toISOString().slice(0, 10);
      if (!porDia[key]) porDia[key] = { data: key, receita: 0, despesa: 0 };
      acumularNoDia(porDia[key], e);
    });
  } else {
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      porDia[key] = { data: key, receita: 0, despesa: 0 };
    }
    entradas.forEach(e => acumularNoDia(porDia[e.data], e));
  }

  return {
    periodo: tudoHistorico ? "tudo" : dias,
    dataInicio: dataInicioStr,
    ...totais,
    totalEntradas: entradas.length,
    grafico: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
    porCanal: resumirCanais(entradas),
    topDespesas: topDespesas(entradas),
  };
}

// ──────────────────────────────────────────────
// EDITAR
// ──────────────────────────────────────────────

async function editarEntrada(id, dados) {
  const pool = await conectar();

  const campos = [];
  const vals   = [];

  if (dados.valor !== undefined) {
    vals.push(parseFloat(parseFloat(dados.valor).toFixed(2)));
    campos.push(`valor = $${vals.length}`);
  }
  if (dados.categoria !== undefined) {
    vals.push(dados.categoria);
    campos.push(`categoria = $${vals.length}`);
  }
  if (dados.descricao !== undefined) {
    vals.push(dados.descricao);
    campos.push(`descricao = $${vals.length}`);
  }
  if (dados.data !== undefined) {
    vals.push(dados.data);
    campos.push(`data = $${vals.length}`);
  }

  if (campos.length === 0) throw new Error("Nenhum campo para atualizar");

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE financeiro SET ${campos.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals
  );

  if (rows.length === 0) throw new Error("Entrada não encontrada");
  return rowParaObj(rows[0]);
}

// ──────────────────────────────────────────────
// EVOLUÇÃO MENSAL
// ──────────────────────────────────────────────

async function evolucaoMensal() {
  const pool = await conectar();

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(data, 'YYYY-MM') AS mes,
      SUM(CASE WHEN tipo = 'receita'                   THEN valor
               WHEN categoria = $1                     THEN -valor
               ELSE 0 END)                             AS faturamento,
      SUM(CASE WHEN tipo = 'despesa' AND categoria <> $1 THEN valor ELSE 0 END) AS gastos
    FROM financeiro
    GROUP BY mes
    ORDER BY mes ASC
  `, [CATEGORIA_TAXAS]);

  return rows.map(r => ({
    mes:          r.mes,
    faturamento:  parseFloat(r.faturamento || 0),
    gastos:       parseFloat(r.gastos || 0),
    lucro:        parseFloat((r.faturamento || 0) - (r.gastos || 0)),
  }));
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

  const totais = somar(entradas);

  // Agrupamento por dia
  const porDia = {};
  entradas.forEach(e => {
    if (!porDia[e.data]) porDia[e.data] = { data: e.data, receita: 0, despesa: 0 };
    acumularNoDia(porDia[e.data], e);
  });

  return {
    periodo: "custom",
    dataInicio,
    dataFim: dataFim || new Date().toISOString().slice(0, 10),
    ...totais,
    totalEntradas: entradas.length,
    grafico: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
    porCanal: resumirCanais(entradas),
    topDespesas: topDespesas(entradas),
  };
}

module.exports = {
  adicionarEntrada,
  editarEntrada,
  removerEntrada,
  listarEntradas,
  calcularResumo,
  calcularResumoCustom,
  evolucaoMensal,
  CATEGORIAS_RECEITA,
  CATEGORIAS_DESPESA,
};
