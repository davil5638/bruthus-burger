// ──────────────────────────────────────────────
// CUSTOS FIXOS — provisão semanal automática
//
// Mantém os custos fixos em base MENSAL e lança no financeiro
// uma provisão SEMANAL (mensal × 12 meses ÷ 52 semanas do ano).
// Assim cada semana "carrega" sua fatia dos custos fixos e o
// lucro semanal fica honesto, sem um tranco único no fim do mês.
//
// Para mudar o valor: edite `valorMensal` abaixo. O valor semanal
// é recalculado sozinho (não mexa no número da semana na mão).
// ──────────────────────────────────────────────
const { adicionarEntrada, listarEntradas } = require("./financeiro");

const CATEGORIA = "Custos Fixos";
const SEMANAS_NO_ANO = 52;

// Custos fixos MENSAIS (sempre em base mensal — nunca semanal).
const CUSTOS_FIXOS = [
  { nome: "MEI + maquineta + programa de atendimento", valorMensal: 150 },
];

function totalMensal() {
  return CUSTOS_FIXOS.reduce((s, c) => s + c.valorMensal, 0);
}

// Provisão semanal = total mensal × 12 meses ÷ 52 semanas.
// Ex: 150 × 12 ÷ 52 = R$ 34,62 (fecha R$ 1.800/ano exatos).
function valorSemanal() {
  return parseFloat(((totalMensal() * 12) / SEMANAS_NO_ANO).toFixed(2));
}

function fmtBR(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

function descricaoLancamento() {
  const itens = CUSTOS_FIXOS.map((c) => c.nome).join(" + ");
  return `Provisão semanal de custos fixos (${itens}) — base R$ ${fmtBR(totalMensal())}/mês`;
}

// Data de hoje no fuso de Fortaleza, no formato YYYY-MM-DD.
function hojeFortaleza() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
}

// ──────────────────────────────────────────────
// Lança a provisão da semana.
// Idempotente: se já houver um lançamento de "Custos Fixos" na
// mesma data, não duplica (protege contra redeploy/reinício).
// ──────────────────────────────────────────────
async function lancarSemana({ dryRun = false, data = null } = {}) {
  const dataLanc = data || hojeFortaleza();
  const valor = valorSemanal();

  const existentes = await listarEntradas({
    tipo: "despesa",
    dataInicio: dataLanc,
    dataFim: dataLanc,
  });
  const jaLancado = existentes.find((e) => e.categoria === CATEGORIA);
  if (jaLancado) {
    return { lancado: false, motivo: "ja_lancado_hoje", data: dataLanc, valor, entrada: jaLancado };
  }

  if (dryRun) {
    return { lancado: false, motivo: "dry_run", data: dataLanc, valor, descricao: descricaoLancamento() };
  }

  const entrada = await adicionarEntrada({
    tipo: "despesa",
    valor,
    categoria: CATEGORIA,
    descricao: descricaoLancamento(),
    data: dataLanc,
  });

  return { lancado: true, data: dataLanc, valor, entrada };
}

// ──────────────────────────────────────────────
// Execução direta:
//   node scripts/custosFixos.js          → lança a provisão da semana
//   node scripts/custosFixos.js --dry    → só mostra o cálculo (não grava)
// ──────────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
  const dryRun = process.argv.includes("--dry");
  lancarSemana({ dryRun })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message); process.exit(1); });
}

module.exports = {
  CATEGORIA,
  CUSTOS_FIXOS,
  totalMensal,
  valorSemanal,
  descricaoLancamento,
  lancarSemana,
};
