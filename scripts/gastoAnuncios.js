// ──────────────────────────────────────────────
// gastoAnuncios.js — traz o gasto REAL de anúncio para o financeiro
//
// O PROBLEMA QUE ISSO RESOLVE:
// Até aqui o único lançamento de anúncio que o sistema fazia era um, no
// dia em que a campanha era criada, no valor do orçamento DIÁRIO
// (server.js, rota /anuncios/criar). Campanha de R$ 20/dia rodando 15
// dias gastava R$ 300 e o financeiro registrava R$ 20. Na prática nem
// isso: a categoria "Marketing / Anúncios" estava com R$ 0,00 em 30
// dias, porque as campanhas não são criadas por ali.
//
// Agora o gasto vem da fonte: a API de insights da Meta, dia a dia.
//
// COMO FUNCIONA:
// Mesmo desenho da conciliação do OlaClick — para cada dia, pergunta à
// Meta quanto foi gasto e compara com o que já existe no financeiro
// naquele dia. Lança só a DIFERENÇA, então rodar duas vezes não duplica.
//
// Isso também absorve uma característica da Meta: o gasto de um dia pode
// ser revisado depois (atribuição, reembolso de impressão inválida). Como
// lançamos diferença e olhamos alguns dias para trás, a correção entra
// sozinha na próxima rodada.
//
// ⚠️ O QUE ISTO NÃO COBRE:
// Só enxerga o que foi gasto DENTRO da conta de anúncios configurada em
// AD_ACCOUNT_ID. Se o gestor de tráfego roda os anúncios na conta dele e
// repassa o custo, a API não vê nada — nesse caso o gasto tem que entrar
// pelo bot do Telegram, como qualquer outra despesa.
//
// O honorário do gestor NÃO entra aqui: ele já está dentro dos R$ 200
// semanais de custos fixos (`custosFixos.js`). Aqui é só a verba que vai
// para a Meta.
//
// CONFIGURAÇÃO (.env / Render):
//   META_ACCESS_TOKEN → token com permissão ads_read
//   AD_ACCOUNT_ID     → id da conta, com ou sem o prefixo act_
//
// Uso direto:
//   node scripts/gastoAnuncios.js            → últimos 7 dias
//   node scripts/gastoAnuncios.js --dry      → só mostra, não grava
//   node scripts/gastoAnuncios.js --dias=14
//   node scripts/gastoAnuncios.js --data=2026-11-03
// ──────────────────────────────────────────────

// dotenv ANTES dos requires — ver a explicação em conciliacaoOlaClick.js:
// `db.js` monta o Pool no load do módulo e lê DATABASE_URL naquele
// instante; carregar o .env depois faz o pg cair no localhost.
if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const axios = require("axios");
const { adicionarEntrada, listarEntradas } = require("./financeiro");

const GRAPH_API = "https://graph.facebook.com/v21.0";
const TIMEZONE  = "America/Fortaleza";

const CATEGORIA = "Marketing / Anúncios";
const MARCA     = "Meta Ads";

// Piso de segurança: 01/10/2026.
//
// A verba de anúncio sempre saiu do caixa da hamburgueria, então é despesa
// do negócio e pode ser lançada retroativamente. Outubro foi trazido a
// pedido do dono (R$ 861,92), junto com 01 e 02/11 (R$ 54,69) para não
// deixar buraco antes do automático começar.
//
// O histórico anterior a outubro continua de fora por decisão dele:
// R$ 1.544 entre nov/2025 e set/2026, que ficam como estão.
//
// O honorário do gestor de tráfego é outra coisa e NÃO entra aqui: é fixo,
// e já está dentro dos R$ 800/mês de custosFixos.js. Aqui é só a verba.
const DATA_MINIMA = "2026-10-01";

// Diferença abaixo disso é centavo de arredondamento.
const TOLERANCIA = 0.5;

// Trava: no máximo este tanto de dias por rodada. O cron usa 7; o valor
// alto aqui só existe para permitir recuperar um período de uma vez.
const MAX_DIAS = 95;

function contaAnuncios() {
  const raw = process.env.AD_ACCOUNT_ID || "";
  if (!raw || raw === "act_") return "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function configurado() {
  const token = process.env.META_ACCESS_TOKEN || "";
  if (!token || /SEU_/i.test(token)) return false;
  return Boolean(contaAnuncios());
}

const r2 = (v) => parseFloat(Number(v || 0).toFixed(2));

function hojeFortaleza() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function somarDias(dataStr, dias) {
  const d = new Date(`${dataStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fmtBR(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

// ──────────────────────────────────────────────
// Gasto por dia, direto da Meta.
//
// time_increment=1 quebra o período em linhas diárias; level=account
// soma todas as campanhas. O dia que a Meta devolve segue o fuso da
// CONTA de anúncios, não o nosso — se a conta estiver num fuso diferente
// de Fortaleza, um gasto pode cair no dia vizinho. O total da semana
// continua certo, e como lançamos diferença, o acerto se resolve na
// rodada seguinte.
// ──────────────────────────────────────────────
async function buscarGastoDiario({ dataInicio, dataFim }) {
  if (!configurado()) throw new Error("META_ACCESS_TOKEN ou AD_ACCOUNT_ID não configurados");

  const porDia = {};

  // A Graph API pagina em 25 itens por padrão. Com time_increment=1 isso
  // é UMA LINHA POR DIA, então qualquer janela acima de 25 dias voltava
  // cortada — e sem erro nenhum, só faltando dia. Foi assim que uma
  // consulta de 180 dias devolveu maio a julho e escondeu outubro.
  // Pedimos limit alto E seguimos paging.next, porque um dos dois
  // sozinho não garante nada.
  let url = `${GRAPH_API}/${contaAnuncios()}/insights`;
  let params = {
    fields: "spend,impressions,clicks",
    time_range: JSON.stringify({ since: dataInicio, until: dataFim }),
    time_increment: 1,
    level: "account",
    limit: 500,
    access_token: process.env.META_ACCESS_TOKEN,
  };

  // Trava de segurança: nunca mais que isso de páginas, para um cursor
  // que se repita não virar laço infinito dentro do cron.
  for (let pagina = 0; pagina < 20 && url; pagina++) {
    const { data } = await axios.get(url, { timeout: 25000, ...(params ? { params } : {}) });

    for (const linha of data?.data || []) {
      const dia = linha.date_start;
      porDia[dia] = {
        data: dia,
        gasto: r2(linha.spend),
        impressoes: parseInt(linha.impressions || 0, 10),
        cliques: parseInt(linha.clicks || 0, 10),
      };
    }

    // O cursor `next` já vem com querystring completa, token incluído.
    url = data?.paging?.next || null;
    params = null;
  }

  return porDia;
}

// Quanto este módulo já lançou naquele dia. Filtra pela marca para não
// confundir com gasto de anúncio lançado na mão pelo Telegram.
async function registradoNoDia(data) {
  const entradas = await listarEntradas({ tipo: "despesa", dataInicio: data, dataFim: data });
  return r2(
    entradas
      .filter((e) => e.categoria === CATEGORIA && (e.descricao || "").includes(MARCA))
      .reduce((s, e) => s + e.valor, 0)
  );
}

// ──────────────────────────────────────────────
// Lança o gasto dos últimos dias.
//
// Por padrão vai de ontem para trás: o gasto do dia corrente ainda está
// correndo e geraria lançamento picado.
// ──────────────────────────────────────────────
async function lancarPendentes({ dias = 7, dryRun = false, incluirHoje = false } = {}) {
  if (!configurado()) {
    return { ignorado: "META_ACCESS_TOKEN ou AD_ACCOUNT_ID não configurados", dias: [] };
  }

  const limite = Math.min(dias, MAX_DIAS);
  const fim    = incluirHoje ? hojeFortaleza() : somarDias(hojeFortaleza(), -1);
  const inicio = somarDias(fim, -(limite - 1));

  let porDia;
  try {
    porDia = await buscarGastoDiario({ dataInicio: inicio, dataFim: fim });
  } catch (e) {
    const err = e.response?.data?.error;
    return {
      erro: err ? `${err.type} (code ${err.code}): ${err.message}` : e.message,
      de: inicio, ate: fim, dias: [],
    };
  }

  const resultados = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (d < DATA_MINIMA) {
      resultados.push({ data: d, ignorado: "antes_da_data_minima" });
      continue;
    }

    const gasto = porDia[d]?.gasto || 0;
    const ja    = await registradoNoDia(d);
    const dif   = r2(gasto - ja);
    const item  = { data: d, gasto, registrado: ja, diferenca: dif, ...(porDia[d] || {}) };

    if (dif < -TOLERANCIA) {
      // Financeiro acima da Meta: gasto revisado para baixo, ou alguém
      // lançou na mão com a mesma marca. Não estorna sozinho.
      item.acao = "nada";
      item.aviso = "despesa acima do que a Meta reporta — conferir na mão";
    } else if (dif <= TOLERANCIA) {
      item.acao = "em_dia";
    } else if (dryRun) {
      item.acao = "lancaria";
    } else {
      const entrada = await adicionarEntrada({
        tipo: "despesa",
        valor: dif,
        categoria: CATEGORIA,
        descricao: `${MARCA} — gasto de ${d} (R$ ${fmtBR(gasto)}${item.cliques ? `, ${item.cliques} cliques` : ""}${ja ? `, menos já lançado R$ ${fmtBR(ja)}` : ""})`,
        data: d,
      });
      item.acao = "lancado";
      item.entradaId = entrada.id;
    }

    resultados.push(item);
  }

  const feitos = resultados.filter((r) => r.acao === "lancado" || r.acao === "lancaria");

  return {
    dryRun,
    de: inicio,
    ate: fim,
    diasVerificados: resultados.length,
    lancamentos: feitos.length,
    valorTotal: r2(feitos.reduce((s, r) => s + r.diferenca, 0)),
    avisos: resultados.filter((r) => r.aviso),
    dias: resultados,
  };
}

// ──────────────────────────────────────────────
if (require.main === module) {
  const arg  = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || "").split("=")[1];
  const dry  = process.argv.includes("--dry");
  const data = arg("data");
  const dias = parseInt(arg("dias") || "7", 10);

  const exec = data
    ? lancarPendentes({ dias: 1, dryRun: dry, incluirHoje: data >= hojeFortaleza() })
    : lancarPendentes({ dias, dryRun: dry });

  exec
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message || e); process.exit(1); });
}

module.exports = {
  CATEGORIA,
  MARCA,
  DATA_MINIMA,
  configurado,
  contaAnuncios,
  buscarGastoDiario,
  lancarPendentes,
};
