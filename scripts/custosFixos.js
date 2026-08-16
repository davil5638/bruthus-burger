// ──────────────────────────────────────────────
// CUSTOS FIXOS — provisão semanal automática
//
// Mantém os custos fixos em base MENSAL e lança no financeiro uma
// provisão SEMANAL. Assim cada semana "carrega" sua fatia dos custos
// fixos e o lucro semanal fica honesto, sem um tranco no fim do mês.
//
// A semana aqui é a mesma do resumo do WhatsApp: TERÇA → SEGUNDA.
// A provisão entra na terça, quando a semana reseta.
//
// Para mudar o valor: edite `valorMensal` dos itens abaixo. O valor
// semanal é recalculado sozinho (não mexa no número da semana na mão).
//
// IMPORTANTE — por que existe o "recuperar":
// O app roda no free tier do Render e DORME quando ocioso. Um cron
// marcado pra um horário só dispara se o processo estiver vivo naquele
// instante — dormindo, a semana passa em branco (foi exatamente o que
// aconteceu entre 27/jul e 10/ago de 2026, depois que o auto-ping foi
// removido no commit f9b0a70). Por isso a fonte de verdade não é o
// horário do cron, e sim o próprio banco: ao acordar, o sistema olha
// qual foi a última semana lançada e preenche o buraco.
// ──────────────────────────────────────────────
const { adicionarEntrada, listarEntradas } = require("./financeiro");

const CATEGORIA = "Custos Fixos";

// A semana começa na TERÇA (2 = terça, no padrão 0=domingo).
const DIA_INICIO_SEMANA = 2;

// Divisor da provisão: 4 semanas por mês (R$ 420/mês → R$ 105/semana).
// Obs: 4 semanas/mês × 12 = 48 semanas, e o ano tem ~52. Na prática
// isso provisiona um pouco a mais no acumulado do ano — é proposital,
// serve de folga e mantém o número da semana redondo.
const SEMANAS_NO_MES = 4;

// Quantas semanas pra trás o recuperar pode preencher de uma vez.
// Trava de segurança: evita despejar um ano de lançamentos se o
// banco estiver vazio ou a data do servidor vier errada.
const MAX_SEMANAS_RETROATIVAS = 12;

// Custos fixos MENSAIS (sempre em base mensal — nunca semanal).
// Total hoje: R$ 420/mês → R$ 105/semana.
// Para detalhar item a item depois, basta quebrar em várias linhas
// com os valores individuais — a soma é que manda.
const CUSTOS_FIXOS = [
  { nome: "Taxa iFood + maquineta + 2 MEIs + sistema", valorMensal: 420 },
];

function totalMensal() {
  return CUSTOS_FIXOS.reduce((s, c) => s + c.valorMensal, 0);
}

// Provisão semanal = total mensal ÷ 4 semanas. Ex: 420 ÷ 4 = R$ 105,00.
function valorSemanal() {
  return parseFloat((totalMensal() / SEMANAS_NO_MES).toFixed(2));
}

function fmtBR(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

function descricaoLancamento() {
  const itens = CUSTOS_FIXOS.map((c) => c.nome).join(" + ");
  return `Provisão semanal de custos fixos (${itens}) — base R$ ${fmtBR(totalMensal())}/mês`;
}

// ──────────────────────────────────────────────
// DATAS — tudo ancorado na terça que abre a semana
// ──────────────────────────────────────────────

// Data de hoje no fuso de Fortaleza, no formato YYYY-MM-DD.
function hojeFortaleza() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
}

// Meio-dia UTC evita que fuso/horário de verão empurre a data um dia.
function paraData(dataStr) {
  return new Date(`${dataStr}T12:00:00Z`);
}

function paraStr(d) {
  return d.toISOString().slice(0, 10);
}

// Terça-feira que abre a semana a que a data pertence (terça→segunda).
// Ex: segunda 17/ago pertence à semana que abriu na terça 11/ago.
function inicioSemana(dataStr) {
  const d = paraData(dataStr);
  const recuo = (d.getUTCDay() - DIA_INICIO_SEMANA + 7) % 7;
  d.setUTCDate(d.getUTCDate() - recuo);
  return paraStr(d);
}

function somarDias(dataStr, dias) {
  const d = paraData(dataStr);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraStr(d);
}

// ──────────────────────────────────────────────
// Lança a provisão de UMA semana.
//
// Idempotente POR SEMANA (não por dia): se já existe qualquer
// lançamento de "Custos Fixos" entre a terça e a segunda daquela
// semana, não duplica. Antes a checagem era pela data exata — se o
// app acordasse num dia diferente, lançava de novo em cima do anterior.
// ──────────────────────────────────────────────
async function lancarSemana({ dryRun = false, data = null } = {}) {
  const dataLanc = inicioSemana(data || hojeFortaleza());
  const fimSemana = somarDias(dataLanc, 6);
  const valor = valorSemanal();

  const existentes = await listarEntradas({
    tipo: "despesa",
    dataInicio: dataLanc,
    dataFim: fimSemana,
  });
  const jaLancado = existentes.find((e) => e.categoria === CATEGORIA);
  if (jaLancado) {
    return { lancado: false, motivo: "ja_lancado_na_semana", data: dataLanc, valor, entrada: jaLancado };
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
// Recupera TODAS as semanas pendentes.
//
// Olha a última semana já lançada no banco e preenche daí até a semana
// atual. É isso que faz o sistema se autocorrigir quando o app passa
// dias dormindo: basta ele acordar uma vez que o atraso é quitado.
// Seguro pra chamar em todo boot — se não falta nada, não escreve nada.
// ──────────────────────────────────────────────
async function recuperarSemanasPendentes({ dryRun = false, maxSemanas = MAX_SEMANAS_RETROATIVAS } = {}) {
  const semanaAtual = inicioSemana(hojeFortaleza());

  // Última semana lançada (procura só dentro da janela permitida).
  const inicioBusca = somarDias(semanaAtual, -7 * maxSemanas);
  const anteriores = await listarEntradas({
    tipo: "despesa",
    dataInicio: inicioBusca,
    dataFim: somarDias(semanaAtual, 6),
  });
  const custosFixos = anteriores
    .filter((e) => e.categoria === CATEGORIA)
    .sort((a, b) => b.data.localeCompare(a.data));

  // Sem histórico na janela: lança só a semana atual, sem inventar passado.
  const primeiraPendente = custosFixos.length
    ? somarDias(inicioSemana(custosFixos[0].data), 7)
    : semanaAtual;

  const semanas = [];
  for (let s = primeiraPendente; s <= semanaAtual; s = somarDias(s, 7)) {
    semanas.push(s);
    if (semanas.length >= maxSemanas) break;
  }

  const resultados = [];
  for (const semana of semanas) {
    resultados.push(await lancarSemana({ dryRun, data: semana }));
  }

  const lancadas = resultados.filter((r) => r.lancado);
  return {
    semanaAtual,
    ultimaLancada: custosFixos.length ? inicioSemana(custosFixos[0].data) : null,
    verificadas: semanas.length,
    lancadas: lancadas.length,
    valorTotal: parseFloat(lancadas.reduce((s, r) => s + r.valor, 0).toFixed(2)),
    dryRun,
    resultados,
  };
}

// ──────────────────────────────────────────────
// Execução direta:
//   node scripts/custosFixos.js            → recupera todas as semanas pendentes
//   node scripts/custosFixos.js --dry      → só mostra o que lançaria (não grava)
//   node scripts/custosFixos.js --semana   → lança apenas a semana atual
// ──────────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
  const dryRun = process.argv.includes("--dry");
  const soSemanaAtual = process.argv.includes("--semana");

  const exec = soSemanaAtual
    ? lancarSemana({ dryRun })
    : recuperarSemanasPendentes({ dryRun });

  exec
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message); process.exit(1); });
}

module.exports = {
  CATEGORIA,
  CUSTOS_FIXOS,
  totalMensal,
  valorSemanal,
  descricaoLancamento,
  inicioSemana,
  lancarSemana,
  recuperarSemanasPendentes,
};
