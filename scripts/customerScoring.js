const { pool, conectar } = require("./dbClientes");

const DIAS_PERDIDO   = 90;
const DIAS_RISCO_MIN = 30;
const MIN_PEDIDOS_HISTORICO = 2;

function diasEntre(d1, d2) {
  const ms = new Date(d2).getTime() - new Date(d1).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function quartil(v, ordenados) {
  if (!ordenados.length) return 0;
  let idx = 0;
  for (let i = 0; i < ordenados.length; i++) if (v >= ordenados[i]) idx = i + 1;
  return Math.min(4, Math.ceil((4 * idx) / ordenados.length));
}

async function statsCliente(clienteId) {
  await conectar();
  const { rows } = await pool.query(
    `SELECT data_pedido, valor, cupom
     FROM pedidos WHERE cliente_id = $1 ORDER BY data_pedido ASC`,
    [clienteId]
  );
  if (!rows.length) {
    return {
      totalPedidos: 0, totalGasto: 0, ticketMedio: 0,
      primeiroPedido: null, ultimoPedido: null,
      intervaloMedioDias: null, recenciaDias: null,
      pctComCupom: 0, pctFimDeSemana: 0, pctNoturno: 0,
      varTicket: 0,
    };
  }
  const total = rows.length;
  const valores = rows.map(r => Number(r.valor));
  const gastoTotal = valores.reduce((s, v) => s + v, 0);
  const ticket = gastoTotal / total;
  const primeiro = rows[0].data_pedido;
  const ultimo   = rows[rows.length - 1].data_pedido;

  // intervalo médio entre pedidos consecutivos
  let intervalo = null;
  if (total >= 2) {
    let soma = 0;
    for (let i = 1; i < total; i++) soma += diasEntre(rows[i - 1].data_pedido, rows[i].data_pedido);
    intervalo = soma / (total - 1);
  }

  const recencia = diasEntre(ultimo, new Date());
  const comCupom = rows.filter(r => r.cupom).length;
  const fimSemana = rows.filter(r => {
    const d = new Date(r.data_pedido).getDay();
    return d === 0 || d === 5 || d === 6;
  }).length;
  const noturno = rows.filter(r => {
    const h = new Date(r.data_pedido).getHours();
    return h >= 21 || h <= 2;
  }).length;

  // variação relativa do ticket (desvio padrão / média)
  const media = ticket;
  const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / total;
  const desvio = Math.sqrt(variancia);
  const cv = media > 0 ? desvio / media : 0;

  return {
    totalPedidos: total,
    totalGasto: +gastoTotal.toFixed(2),
    ticketMedio: +ticket.toFixed(2),
    primeiroPedido: primeiro,
    ultimoPedido: ultimo,
    intervaloMedioDias: intervalo ? +intervalo.toFixed(2) : null,
    recenciaDias: recencia,
    pctComCupom: +(100 * comCupom / total).toFixed(1),
    pctFimDeSemana: +(100 * fimSemana / total).toFixed(1),
    pctNoturno: +(100 * noturno / total).toFixed(1),
    varTicket: +cv.toFixed(2),
  };
}

function calcularScoreRisco(stats) {
  const { totalPedidos, recenciaDias, intervaloMedioDias } = stats;
  if (!totalPedidos) return 0;

  if (totalPedidos < MIN_PEDIDOS_HISTORICO) {
    if (recenciaDias > 60) return 90;
    if (recenciaDias > 30) return 65;
    return 35;
  }

  const baseIntervalo = Math.max(intervaloMedioDias || 14, 7);
  const razao = recenciaDias / baseIntervalo;
  let score;
  if (razao < 0.6)      score = 10 + razao * 25;
  else if (razao < 1.0) score = 25 + (razao - 0.6) * 50;
  else if (razao < 2.0) score = 45 + (razao - 1.0) * 35;
  else                  score = 80 + Math.min(15, (razao - 2.0) * 10);

  if (recenciaDias > DIAS_PERDIDO) score = Math.max(score, 92);
  return Math.round(Math.min(100, Math.max(0, score)));
}

function chanceAbandono(scoreRisco) {
  return +Math.min(99, 100 * (1 - Math.exp(-scoreRisco / 38))).toFixed(2);
}

function valorEstimadoPerdido(stats) {
  if (!stats.totalPedidos || !stats.intervaloMedioDias) return 0;
  const pedidosPorMes = 30 / Math.max(stats.intervaloMedioDias, 7);
  return +(pedidosPorMes * stats.ticketMedio * 3).toFixed(2);
}

function classificarSegmento(stats, scoreValor, scoreRisco) {
  const { totalPedidos, recenciaDias, primeiroPedido, pctComCupom, pctFimDeSemana, pctNoturno, varTicket } = stats;

  if (!totalPedidos) return "sem_pedidos";

  const idadeRelacao = primeiroPedido ? diasEntre(primeiroPedido, new Date()) : 0;
  if (totalPedidos <= 2 && idadeRelacao <= 45) return "novo";

  if (recenciaDias > DIAS_PERDIDO || scoreRisco >= 88) return "perdido";

  if (pctComCupom >= 60) return "sensivel_desconto";

  if ((pctFimDeSemana >= 70 || pctNoturno >= 50 || varTicket >= 0.5) && totalPedidos >= 3)
    return "impulsivo";

  if (scoreRisco >= 50 && scoreValor >= 35) return "em_risco";

  if (scoreValor >= 75 && recenciaDias <= 45) return "vip";

  return "regular";
}

async function calcularScoreValor(clienteId, stats) {
  // RFM normalizado contra a base atual
  const { rows } = await pool.query(`
    SELECT total_pedidos, total_gasto, recencia_dias FROM clientes
    WHERE total_pedidos > 0
  `);
  const freqOrd  = rows.map(r => Number(r.total_pedidos)).sort((a, b) => a - b);
  const gastoOrd = rows.map(r => Number(r.total_gasto)).sort((a, b) => a - b);
  const qF = quartil(stats.totalPedidos, freqOrd);
  const qM = quartil(stats.totalGasto,   gastoOrd);
  // 0 a 100 — combina frequência e monetário
  return Math.round(((qF + qM) / 8) * 100);
}

function gerarTags(stats) {
  const tags = [];
  if (stats.pctComCupom >= 60) tags.push("sensivel_desconto");
  if (stats.pctFimDeSemana >= 70) tags.push("fim_de_semana");
  if (stats.pctNoturno >= 50) tags.push("noturno");
  if (stats.varTicket >= 0.5) tags.push("ticket_variavel");
  if (stats.ticketMedio >= 60) tags.push("ticket_alto");
  return tags;
}

async function recalcularCliente(clienteId) {
  await conectar();
  const stats = await statsCliente(clienteId);
  const scoreRisco  = calcularScoreRisco(stats);
  const scoreValor  = await calcularScoreValor(clienteId, stats);
  const chance      = chanceAbandono(scoreRisco);
  const perda       = valorEstimadoPerdido(stats);
  const segmento    = classificarSegmento(stats, scoreValor, scoreRisco);
  const tags        = gerarTags(stats);

  await pool.query(
    `UPDATE clientes SET
       primeiro_pedido_em    = $2,
       ultimo_pedido_em      = $3,
       total_pedidos         = $4,
       total_gasto           = $5,
       ticket_medio          = $6,
       intervalo_medio_dias  = $7,
       recencia_dias         = $8,
       score_valor           = $9,
       score_risco           = $10,
       chance_abandono       = $11,
       valor_estimado_perdido= $12,
       segmento              = $13,
       tags                  = $14,
       recalculado_em        = NOW(),
       atualizado_em         = NOW()
     WHERE id = $1`,
    [
      clienteId,
      stats.primeiroPedido,
      stats.ultimoPedido,
      stats.totalPedidos,
      stats.totalGasto,
      stats.ticketMedio,
      stats.intervaloMedioDias,
      stats.recenciaDias,
      scoreValor,
      scoreRisco,
      chance,
      perda,
      segmento,
      tags,
    ]
  );
  return { clienteId, stats, scoreValor, scoreRisco, chance, perda, segmento, tags };
}

async function recalcularTodos() {
  await conectar();
  const { rows } = await pool.query("SELECT id FROM clientes");
  let processados = 0;
  const porSegmento = {};
  for (const r of rows) {
    const out = await recalcularCliente(r.id);
    porSegmento[out.segmento] = (porSegmento[out.segmento] || 0) + 1;
    processados++;
  }
  console.log(`✅ Recalculou ${processados} clientes — distribuição:`, porSegmento);
  return { processados, porSegmento };
}

module.exports = {
  statsCliente,
  calcularScoreRisco,
  calcularScoreValor,
  chanceAbandono,
  valorEstimadoPerdido,
  classificarSegmento,
  recalcularCliente,
  recalcularTodos,
};
