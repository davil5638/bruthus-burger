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
// ──────────────────────────────────────────────
// POR COBRANÇA, NÃO POR DIA DE VEICULAÇÃO (decisão do dono, 09/11/2026)
//
// Até 09/11/2026 este módulo lançava o `spend` diário da API de insights:
// o anúncio rodou hoje, a despesa entrava hoje. O dono pediu o contrário,
// e com razão para o uso que ele faz da tela:
//
//   "o valor do meta ads só entra nos gastos quando é efetuado a cobrança
//    no meu cartão né? pq essa semana não foi efetuado pagamento pq não
//    chegou no limite de gastos"
//
// A Meta não cobra por dia. Ela acumula e só passa o cartão quando o
// acumulado bate no limite de faturamento da conta (ou na data mensal).
// Na semana de 03 a 09/11 o sistema mostrava R$ 192,19 de anúncio e o
// cartão não tinha sido tocado — dinheiro que ainda não saiu do caixa,
// aparecendo como gasto da semana.
//
// COMO SE DESCOBRE A COBRANÇA:
// A API de billing (/transactions, /invoices) não existe para este token
// — testado, devolve "nonexisting field". O que a conta expõe é:
//
//   amount_spent → tudo que a conta já gastou, desde sempre (centavos)
//   balance      → o que está acumulado e AINDA NÃO foi cobrado
//
// Logo: `amount_spent − balance` = tudo que já foi efetivamente cobrado.
// Esse número só se mexe quando a Meta passa o cartão. É ele que este
// módulo persegue.
//
// Como o resto do sistema (conciliação do OlaClick, custos fixos), aqui
// se lança só a DIFERENÇA entre o que já foi cobrado e o que já está no
// financeiro. Rodar duas vezes não duplica, e um dia sem o cron rodar se
// resolve sozinho na rodada seguinte.
//
// O QUE MUDA NA PRÁTICA:
// A despesa deixa de pingar todo dia e passa a entrar de uma vez, na data
// em que a cobrança é notada. Uma semana pode fechar com R$ 0 de anúncio
// e a seguinte levar a conta inteira. É o dinheiro saindo do caixa, que é
// a régua do resto deste financeiro.
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
//   node scripts/gastoAnuncios.js          → lança a cobrança pendente
//   node scripts/gastoAnuncios.js --dry    → só mostra, não grava
//   node scripts/gastoAnuncios.js --extrato → cobrado, a vencer e detalhe
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
const DATA_MINIMA = "2026-10-01";

// ──────────────────────────────────────────────
// Quanto a conta já tinha sido cobrada ANTES do que está no financeiro.
//
// `amount_spent − balance` é um acumulado da vida inteira da conta, e o
// financeiro só conhece de 01/10/2026 para cá. Esta constante é a parte
// de trás, que não deve virar despesa de novo.
//
// CALIBRADA em 09/11/2026, com a conta em:
//   amount_spent  R$ 2.930,65
//   balance       R$   194,98   (acumulado ainda não cobrado)
//   → já cobrado  R$ 2.735,67
//
// e o financeiro com R$ 916,16 de "Meta Ads" lançados desde 01/10 — isto
// é, os R$ 1.108,35 que existiam menos os R$ 192,19 de 05 a 08/11, que
// eram veiculação ainda não cobrada e saíram junto com esta mudança.
//
//   2.735,67 − 916,16 = 1.819,51
//
// Se os R$ 192,19 NÃO tiverem sido removidos, a diferença dá negativa e o
// módulo não lança nada — avisa e pede conferência, que é o certo. Ele
// nunca estorna sozinho.
//
// Recalibrar só se a conta de anúncios for trocada (outro AD_ACCOUNT_ID
// zera `amount_spent` e esta base deixa de valer).
const BASE_COBRADO = 1819.51;

// Diferença abaixo disso é centavo de arredondamento.
const TOLERANCIA = 0.5;

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
// Estado de cobrança da conta.
//
// Os dois campos vêm em CENTAVOS, como string. `balance` é o que está
// pendurado esperando a próxima cobrança; some quando o cartão passa.
//
// Numa conta que fature por boleto/pré-pago o `balance` pode vir sempre
// zerado — aí "cobrado" iguala "gasto" e o comportamento volta a ser o
// de antes, por dia. É o pior caso, e não quebra nada.
// ──────────────────────────────────────────────
async function buscarCobranca() {
  if (!configurado()) throw new Error("META_ACCESS_TOKEN ou AD_ACCOUNT_ID não configurados");

  const { data } = await axios.get(`${GRAPH_API}/${contaAnuncios()}`, {
    params: { fields: "amount_spent,balance,currency", access_token: process.env.META_ACCESS_TOKEN },
    timeout: 25000,
  });

  const gastoTotal = r2(Number(data.amount_spent || 0) / 100);
  const aVencer    = r2(Number(data.balance || 0) / 100);

  return {
    moeda: data.currency || "BRL",
    gastoTotal,                            // tudo que a conta já veiculou
    aVencer,                               // acumulado ainda não cobrado
    cobradoTotal: r2(gastoTotal - aVencer) // o que já passou no cartão
  };
}

// ──────────────────────────────────────────────
// Gasto por dia, da API de insights.
//
// Não serve mais para lançar — serve para DESCREVER a cobrança (que dias
// ela cobre) e para mostrar na tela o que está correndo e ainda vai ser
// cobrado. time_increment=1 quebra o período em linhas diárias;
// level=account soma todas as campanhas.
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

// Tudo que este módulo já lançou desde a data mínima. Filtra pela marca
// para não confundir com gasto de anúncio lançado na mão pelo Telegram.
async function totalLancado() {
  const entradas = await listarEntradas({ tipo: "despesa", dataInicio: DATA_MINIMA });
  return r2(
    entradas
      .filter((e) => e.categoria === CATEGORIA && (e.descricao || "").includes(MARCA))
      .reduce((s, e) => s + e.valor, 0)
  );
}

// Uma linha curta dizendo que período a cobrança cobre, para a descrição
// do lançamento. Se os insights falharem, segue sem isso — a cobrança é
// o que importa, o detalhe é conforto.
async function periodoProvavel(valor) {
  try {
    const fim    = hojeFortaleza();
    const inicio = somarDias(fim, -60);
    const porDia = await buscarGastoDiario({ dataInicio: inicio, dataFim: fim });

    // Anda de trás para frente somando até cobrir o valor cobrado.
    const dias = Object.keys(porDia).sort().reverse();
    let soma = 0;
    let primeiro = null;
    for (const d of dias) {
      if (soma >= valor) break;
      soma += porDia[d].gasto;
      primeiro = d;
    }
    if (!primeiro) return "";

    const ult = dias[0];
    return primeiro === ult ? `veiculação de ${primeiro}` : `veiculação de ${primeiro} a ${ult}`;
  } catch {
    return "";
  }
}

// ──────────────────────────────────────────────
// Lança a cobrança que ainda não está no financeiro.
//
// O lançamento sai com a data de HOJE: é o dia em que se soube da
// cobrança. A Meta não diz a data exata em que passou o cartão, e com o
// cron rodando todo dia às 05h10 a defasagem é de no máximo um dia.
// ──────────────────────────────────────────────
async function lancarPendentes({ dryRun = false } = {}) {
  if (!configurado()) {
    return { ignorado: "META_ACCESS_TOKEN ou AD_ACCOUNT_ID não configurados", dias: [] };
  }

  let conta;
  try {
    conta = await buscarCobranca();
  } catch (e) {
    const err = e.response?.data?.error;
    return {
      erro: err ? `${err.type} (code ${err.code}): ${err.message}` : e.message,
      dias: [],
    };
  }

  const cobradoNoPeriodo = r2(conta.cobradoTotal - BASE_COBRADO);
  const ja               = await totalLancado();
  const diferenca        = r2(cobradoNoPeriodo - ja);
  const hoje             = hojeFortaleza();

  const base = {
    dryRun,
    de: DATA_MINIMA,
    ate: hoje,
    gastoTotalConta: conta.gastoTotal,
    cobradoTotalConta: conta.cobradoTotal,
    aVencer: conta.aVencer,          // provisão: já veiculado, ainda não cobrado
    cobradoNoPeriodo,
    jaLancado: ja,
    diferenca,
    lancamentos: 0,
    valorTotal: 0,
    avisos: [],
    dias: [],
  };

  if (diferenca < -TOLERANCIA) {
    // Financeiro acima do que a Meta diz ter cobrado. Acontece se alguém
    // lançou na mão com a mesma marca, se houve reembolso, ou se a conta
    // de anúncios mudou e a BASE_COBRADO ficou velha. Nunca estorna só.
    base.acao = "nada";
    base.avisos.push({
      data: hoje,
      aviso: `despesa (R$ ${fmtBR(ja)}) acima do que a Meta já cobrou (R$ ${fmtBR(cobradoNoPeriodo)}) — conferir na mão`,
    });
    return base;
  }

  if (diferenca <= TOLERANCIA) {
    base.acao = "em_dia";
    return base;
  }

  const periodo = await periodoProvavel(diferenca);
  const descricao =
    `${MARCA} — cobrança de R$ ${fmtBR(diferenca)} notada em ${hoje}` +
    (periodo ? ` (${periodo})` : "") +
    (conta.aVencer > 0 ? `; a vencer R$ ${fmtBR(conta.aVencer)}` : "");

  if (dryRun) {
    base.acao = "lancaria";
    base.descricao = descricao;
  } else {
    const entrada = await adicionarEntrada({
      tipo: "despesa",
      valor: diferenca,
      categoria: CATEGORIA,
      descricao,
      data: hoje,
    });
    base.acao = "lancado";
    base.entradaId = entrada.id;
    base.descricao = descricao;
  }

  base.lancamentos = 1;
  base.valorTotal = diferenca;
  return base;
}

// ──────────────────────────────────────────────
if (require.main === module) {
  const dry     = process.argv.includes("--dry");
  const extrato = process.argv.includes("--extrato");

  const exec = extrato
    ? (async () => {
        const c = await buscarCobranca();
        const ja = await totalLancado();
        const fim = hojeFortaleza();
        const porDia = await buscarGastoDiario({ dataInicio: somarDias(fim, -14), dataFim: fim });
        return {
          ...c,
          baseCobrado: BASE_COBRADO,
          cobradoNoPeriodo: r2(c.cobradoTotal - BASE_COBRADO),
          jaLancadoNoFinanceiro: ja,
          diferenca: r2(c.cobradoTotal - BASE_COBRADO - ja),
          ultimos14dias: Object.values(porDia),
        };
      })()
    : lancarPendentes({ dryRun: dry });

  exec
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message || e); process.exit(1); });
}

module.exports = {
  CATEGORIA,
  MARCA,
  DATA_MINIMA,
  BASE_COBRADO,
  configurado,
  contaAnuncios,
  buscarCobranca,
  buscarGastoDiario,
  totalLancado,
  lancarPendentes,
};
