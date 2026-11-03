// ──────────────────────────────────────────────
// conciliacaoOlaClick.js — fecha a conta da receita com o OlaClick
//
// O PROBLEMA QUE ISSO RESOLVE:
// O webhook do OlaClick entrega pedido do cardápio próprio (INBOUND), do
// balcão (OUTBOUND) e do chatbot — mas NÃO entrega pedido de marketplace.
// Em 1.567 payloads guardados não existe um único pedido de iFood. E o
// iFood vende: 147 pedidos / R$ 5.397,39 em 30 dias. Toda segunda alguém
// olhava o painel e digitava um valor redondo no sistema para fechar a
// diferença.
//
// COMO FUNCIONA:
// Para cada dia e cada canal, pergunta ao OlaClick quanto foi vendido e
// compara com o que já existe no financeiro. Lança só a DIFERENÇA. Como
// lança diferença, rodar duas vezes não duplica: na segunda vez a
// diferença já é zero. É a mesma ideia de autocorreção que `custosFixos`
// usa — a fonte de verdade não é o cron ter rodado, é o estado do banco.
//
// ──────────────────────────────────────────────
// O CASO DO IFOOD — por que ele precisa de dois lançamentos
//
// O total que o OlaClick mostra é o que o CLIENTE pagou. Não é o que a
// loja recebe. Reconstruindo a semana de 29/10 a 02/11 (42 pedidos),
// contra o valor real que o dono tinha a receber no app (R$ 1.375):
//
//   itens de menu                      1.879,00
//   − desconto bancado pela loja        −181,96   (modality IFOOD_MERCHANT)
//   − desconto bancado pelo iFood       −373,04   (modality IFOOD_IFOOD)
//   + entrega                           +116,50
//   + taxa de serviço                    +44,34
//   = total que o cliente pagou        1.484,84   ← o que o OlaClick mostra
//   + reembolso do iFood                +373,04   ← ele devolve o que bancou
//   − taxa de serviço (fica com ele)     −44,34
//   = base da comissão                 1.813,54
//   − comissão 24,18%                   −438,54
//   = a loja recebe                    1.375,00   ← fecha exato
//
// Daí os lançamentos por dia de iFood:
//   RECEITA = total que o cliente pagou + reembolso do iFood
//   DESPESA = comissão + taxa de serviço
//
// O reembolso é a parte que não existia em lugar nenhum: ~R$ 373 por
// semana entrando na conta da loja e invisível no sistema, porque o
// OlaClick mostra o desconto inteiro como se a loja tivesse bancado.
//
// Repare que a comissão NÃO é percentual sobre o total do OlaClick. A
// base é `total + reembolso − taxa de serviço`. Aplicar 24,18% direto
// sobre o total daria R$ 358,97 em vez de R$ 438,54 — erro de R$ 80 por
// semana, e a conta não fecharia com o extrato.
//
// Uso direto:
//   node scripts/conciliacaoOlaClick.js             → últimos 3 dias
//   node scripts/conciliacaoOlaClick.js --dry       → só mostra, não grava
//   node scripts/conciliacaoOlaClick.js --dias=7    → últimos 7 dias
//   node scripts/conciliacaoOlaClick.js --data=2026-11-03
// ──────────────────────────────────────────────

// dotenv ANTES dos requires: `db.js` monta o Pool no load do módulo e lê
// process.env.DATABASE_URL naquele instante. Se o .env entrar depois, o
// Pool nasce sem connectionString, o pg cai no localhost e a falha vem
// como AggregateError [ECONNREFUSED] de mensagem VAZIA — era por isso que
// rodar este arquivo na mão morria num "❌" pelado. No server.js o
// problema não aparece porque lá o dotenv é a linha 1.
if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const ola = require("./olaclickApi");
const { adicionarEntrada, listarEntradas } = require("./financeiro");

// Canal do OlaClick → categoria de receita no financeiro.
// INBOUND/OUTBOUND/CHATBOT ficam em "Delivery" porque é assim que o
// webhook já lança há meses; mudar agora quebraria a comparação histórica
// do dashboard. OUTBOUND é o pedido que chega pelo WhatsApp e é cadastrado
// à mão no OlaClick — conferido: quase todos dentro do horário da loja,
// então a data deles é confiável.
//
// `detalhado` liga a busca pedido-a-pedido, necessária só onde existe
// desconto bancado pela plataforma e comissão a calcular.
const CANAIS = [
  { categoria: "Delivery", sources: ["inbound", "outbound", "chatbot"], detalhado: "proprio" },
  { categoria: "Ifood",    sources: ["ifood"],                          detalhado: "ifood"   },
  { categoria: "Outros",   sources: ["rappi", "uber_eats"],              detalhado: false     },
];

// Comissão por canal, aplicada sobre `total + reembolso − taxa de serviço`.
//
// 20,85% está CALIBRADO contra o extrato real de outubro/2026 do Portal
// do Parceiro iFood, que fechou o mês em R$ 5.063,34 líquidos
// (R$ 4.033,70 de repasses + R$ 1.029,64 recebidos direto pela loja).
// Com esta alíquota o modelo chega nesse mesmo líquido.
//
// Atenção: 20,85% NÃO é a alíquota que o iFood publica. Ele cobra
// R$ 1.079,97 sobre um "valor das vendas" de R$ 7.045,98, ou 15,33%,
// mas essa base é o valor de menu antes dos descontos e sem a entrega.
// A nossa base é outra (`total + reembolso − taxa de serviço`), então a
// alíquota tem que ser outra para dar o mesmo resultado. O que importa
// é o líquido bater com o extrato, e bate.
//
// A primeira estimativa foi 24,18%, derivada de UMA semana a partir de um
// valor que o dono lembrou de cabeça. Errava R$ 212,85 no mês. Se for
// recalibrar de novo, use sempre o extrato de um mês fechado.
//
// Não há contagem dupla com `custosFixos.js`: os R$ 800/mês de lá são
// gestor de tráfego, 2 MEIs, sistema e o chip da maquineta — nenhuma
// taxa de iFood.
const COMISSOES = { Ifood: 0.2085 };

// Taxa da maquineta sobre venda no CARTÃO do canal próprio.
//
// Só incide em pagamento com código `card` — o cartão que passa na
// maquineta da loja. Pix e dinheiro não pagam. E cartão de pedido de
// iFood (`credit_card`, `debit_card`, `digital_wallet`) também não entra:
// aquilo é cobrado pelo iFood, não passa na maquineta, e já está coberto
// pela comissão acima. Aplicar 3% ali seria cobrar duas vezes.
//
// Medido na semana de 29/10 a 02/11: o cartão foi R$ 3.509,19 de
// R$ 7.479,91 do canal próprio (46,9%), o que dá R$ 105,28 de taxa na
// semana, uns R$ 453/mês.
const TAXA_MAQUINETA = 0.03;

// Categoria de despesa onde entram comissão e taxa de serviço.
const CATEGORIA_TAXAS = "Taxas / Comissões";

// Marca que identifica lançamento feito por este módulo.
const MARCA = "Conciliação OlaClick";

// Piso de segurança: a conciliação NUNCA mexe em dia anterior a isto.
// Antes desta data a receita que faltava era remendada na mão, em
// "Vendas no local". Se a conciliação entrasse lá, somaria em cima do
// remendo e inflaria a receita duas vezes. Limpar aquele período é
// trabalho separado e manual — não é decisão de cron.
const DATA_MINIMA = "2026-11-03";

// Diferença abaixo disso é centavo de arredondamento, não erro.
const TOLERANCIA = 0.5;

// Trava: no máximo este tanto de dias para trás numa rodada.
const MAX_DIAS = 14;

// Pausa entre chamadas de detalhe. Somando iFood e canal próprio são
// umas 28 chamadas por dia conciliado. A 110ms a API já devolveu 429 em
// rajada, então o ritmo aqui é mais folgado — e `olaclickApi` ainda
// repete sozinho se o 429 vier.
const PAUSA_MS = 250;

const CANCELADO = /CANCEL/i;

// ──────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────

const r2 = (v) => parseFloat(Number(v || 0).toFixed(2));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function hojeFortaleza() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ola.TIMEZONE });
}

// Meio-dia UTC evita que fuso empurre a data um dia.
function somarDias(dataStr, dias) {
  const d = new Date(`${dataStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fmtBR(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

// ──────────────────────────────────────────────
// Componentes de um dia de iFood.
//
// Lista os pedidos do dia e busca o detalhe de cada um — o detalhe é o
// único lugar que traz `discounts[].modality`, que diz QUEM bancou cada
// desconto. Sem isso, campanha paga pelo iFood parece prejuízo da loja:
// na semana medida eram R$ 555 de desconto, dos quais R$ 373,04 (67%)
// o iFood pagou.
//
// Pedido cancelado fica de fora, igual o orders-summary faz.
// ──────────────────────────────────────────────
async function componentesIfood(data) {
  const pedidos = await ola.listarPedidos({
    dataInicio: data,
    dataFim: data,
    sources: ["ifood"],
  });

  const validos = pedidos.filter((p) => !CANCELADO.test(p.status || ""));

  let total = 0;
  let taxaServico = 0;
  let reembolso = 0;
  let semDetalhe = 0;

  for (const p of validos) {
    total       += Number(p.total || 0);
    taxaServico += Number(p.service_fee_price || 0);

    try {
      const det = await ola.buscarPedido(p.id);
      reembolso += (det?.discounts || [])
        .filter((d) => String(d.modality || "").toUpperCase() === "IFOOD_IFOOD")
        .reduce((s, d) => s + Number(d.value || 0), 0);
    } catch (e) {
      // Sem o detalhe não sabemos o reembolso daquele pedido. Contar zero
      // subestima a receita, e isso é melhor que inventar: o aviso sobe
      // para quem chamou e a diferença entra na próxima rodada.
      semDetalhe++;
    }

    await pausa(PAUSA_MS);
  }

  const base     = total + reembolso - taxaServico;
  const aliquota = COMISSOES.Ifood || 0;

  return {
    pedidos: validos.length,
    cancelados: pedidos.length - validos.length,
    total: r2(total),
    taxaServico: r2(taxaServico),
    reembolso: r2(reembolso),
    base: r2(base),
    comissao: r2(base * aliquota),
    aliquota,
    semDetalhe,
  };
}

// ──────────────────────────────────────────────
// Componentes de um dia do canal próprio (cardápio, balcão, chatbot).
//
// Precisa do detalhe de cada pedido por um motivo só: a forma de
// pagamento. A listagem traz o total, mas `payments[]` só aparece no
// pedido individual — e é dali que sai quanto passou na maquineta.
//
// Pedido ainda sem pagamento registrado (entrega que paga na chegada,
// por exemplo) entra em `semPagamento` e NÃO paga taxa. Quando o
// pagamento for lançado, a próxima rodada enxerga e cobra a diferença —
// é a mesma autocorreção do resto do módulo.
// ──────────────────────────────────────────────
async function componentesCanalProprio(data, sources) {
  const pedidos = await ola.listarPedidos({ dataInicio: data, dataFim: data, sources });
  const validos = pedidos.filter((p) => !CANCELADO.test(p.status || ""));

  let total = 0;
  let card = 0;
  let semPagamento = 0;
  let semDetalhe = 0;

  for (const p of validos) {
    total += Number(p.total || 0);

    try {
      const det = await ola.buscarPedido(p.id);
      const pays = det?.payments || [];
      if (!pays.length) semPagamento += Number(p.total || 0);
      for (const x of pays) {
        if (String(x?.payment_method?.code || "").toLowerCase() === "card") {
          card += Number(x.bill_amount || 0);
        }
      }
    } catch (e) {
      // Sem o detalhe não sabemos a forma de pagamento. Contar zero de
      // cartão subestima a taxa, e é melhor que inventar.
      semDetalhe++;
    }

    await pausa(PAUSA_MS);
  }

  return {
    pedidos: validos.length,
    cancelados: pedidos.length - validos.length,
    total: r2(total),
    card: r2(card),
    semPagamento: r2(semPagamento),
    taxaMaquineta: r2(card * TAXA_MAQUINETA),
    aliquota: TAXA_MAQUINETA,
    semDetalhe,
  };
}

// ──────────────────────────────────────────────
// O que já está no financeiro naquele dia.
//
// Receita: soma TUDO da categoria, porque o webhook lança pedido por
// pedido e o que queremos é que o total feche.
// Despesa: soma só o que ESTE módulo lançou (filtra pela marca), porque
// "Taxas / Comissões" vai receber outros lançamentos — maquineta, por
// exemplo — que não têm nada a ver com a conciliação.
// ──────────────────────────────────────────────
async function registradoNoDia(data) {
  const [receitas, despesas] = await Promise.all([
    listarEntradas({ tipo: "receita", dataInicio: data, dataFim: data }),
    listarEntradas({ tipo: "despesa", dataInicio: data, dataFim: data }),
  ]);

  const receitaPorCategoria = {};
  for (const e of receitas) {
    receitaPorCategoria[e.categoria] = (receitaPorCategoria[e.categoria] || 0) + e.valor;
  }

  const taxaPorCanal = {};
  for (const e of despesas) {
    if (e.categoria !== CATEGORIA_TAXAS) continue;
    if (!(e.descricao || "").includes(MARCA)) continue;
    for (const c of CANAIS) {
      if ((e.descricao || "").includes(c.categoria)) {
        taxaPorCanal[c.categoria] = (taxaPorCanal[c.categoria] || 0) + e.valor;
      }
    }
  }

  return { receitaPorCategoria, taxaPorCanal };
}

// ──────────────────────────────────────────────
// Concilia UM dia.
// ──────────────────────────────────────────────
async function conciliarDia(data, { dryRun = false } = {}) {
  if (data < DATA_MINIMA) {
    return { data, ignorado: "antes_da_data_minima", canais: [] };
  }

  const { receitaPorCategoria, taxaPorCanal } = await registradoNoDia(data);
  const canais = [];

  for (const canal of CANAIS) {
    let esperadoReceita;
    let esperadoTaxa = 0;
    let detalhe = null;

    try {
      if (canal.detalhado === "ifood") {
        detalhe = await componentesIfood(data);
        esperadoReceita = r2(detalhe.total + detalhe.reembolso);
        esperadoTaxa    = r2(detalhe.comissao + detalhe.taxaServico);
      } else if (canal.detalhado === "proprio") {
        detalhe = await componentesCanalProprio(data, canal.sources);
        esperadoReceita = detalhe.total;
        esperadoTaxa    = detalhe.taxaMaquineta;
      } else {
        const r = await ola.buscarResumo({
          dataInicio: data,
          dataFim: data,
          sources: canal.sources,
        });
        esperadoReceita = r.total;
      }
    } catch (e) {
      canais.push({ categoria: canal.categoria, erro: e.message });
      continue;
    }

    const item = { categoria: canal.categoria, esperado: esperadoReceita };
    if (detalhe) item.detalhe = detalhe;

    // ── receita ──
    const regReceita = r2(receitaPorCategoria[canal.categoria] || 0);
    const difReceita = r2(esperadoReceita - regReceita);
    item.registrado = regReceita;
    item.diferenca  = difReceita;

    if (difReceita < -TOLERANCIA) {
      // Financeiro acima do OlaClick. Pode ser pedido cancelado depois de
      // lançado, ou lançamento manual duplicado. Não estorna sozinho:
      // avisa e deixa a decisão para uma pessoa.
      item.acao  = "nada";
      item.aviso = "financeiro acima do OlaClick — conferir na mão";
    } else if (difReceita <= TOLERANCIA) {
      item.acao = "em_dia";
    } else if (dryRun) {
      item.acao = "lancaria";
    } else {
      const desc = detalhe
        ? `${MARCA} — ${canal.categoria} em ${data} (cliente pagou R$ ${fmtBR(detalhe.total)} + reembolso iFood R$ ${fmtBR(detalhe.reembolso)}, menos já lançado R$ ${fmtBR(regReceita)})`
        : `${MARCA} — ${canal.categoria} em ${data} (OlaClick R$ ${fmtBR(esperadoReceita)} menos já lançado R$ ${fmtBR(regReceita)})`;

      const entrada = await adicionarEntrada({
        tipo: "receita",
        valor: difReceita,
        categoria: canal.categoria,
        descricao: desc,
        data,
      });
      item.acao = "lancado";
      item.entradaId = entrada.id;
    }

    // ── despesa: comissão + taxa de serviço ──
    if (esperadoTaxa > 0) {
      const regTaxa = r2(taxaPorCanal[canal.categoria] || 0);
      const difTaxa = r2(esperadoTaxa - regTaxa);
      item.taxaEsperada   = esperadoTaxa;
      item.taxaRegistrada = regTaxa;
      item.taxaDiferenca  = difTaxa;

      if (difTaxa > TOLERANCIA) {
        if (dryRun) {
          item.acaoTaxa = "lancaria";
        } else {
          const entradaTaxa = await adicionarEntrada({
            tipo: "despesa",
            valor: difTaxa,
            categoria: CATEGORIA_TAXAS,
            descricao: detalhe.taxaMaquineta !== undefined
              ? `${MARCA} — ${canal.categoria} em ${data}: maquineta ${(detalhe.aliquota * 100).toFixed(2)}% sobre R$ ${fmtBR(detalhe.card)} pagos no cartão`
              : `${MARCA} — ${canal.categoria} em ${data}: comissão ${(detalhe.aliquota * 100).toFixed(2)}% de R$ ${fmtBR(detalhe.base)} = R$ ${fmtBR(detalhe.comissao)} + taxa de serviço R$ ${fmtBR(detalhe.taxaServico)}`,
            data,
          });
          item.acaoTaxa = "lancado";
          item.taxaEntradaId = entradaTaxa.id;
        }
      } else if (difTaxa < -TOLERANCIA) {
        item.acaoTaxa  = "nada";
        item.avisoTaxa = "despesa de taxa acima do esperado — conferir na mão";
      } else {
        item.acaoTaxa = "em_dia";
      }
    }

    if (detalhe && detalhe.semDetalhe) {
      item.aviso = `${detalhe.semDetalhe} pedido(s) sem detalhe — reembolso pode estar subestimado`;
    }

    canais.push(item);
  }

  return { data, canais };
}

// ──────────────────────────────────────────────
// Concilia os últimos dias.
//
// Por padrão vai de ontem para trás: hoje ainda está acontecendo (a loja
// abre 18:30) e conciliar dia aberto só gera lançamento picado.
// ──────────────────────────────────────────────
async function conciliarPendentes({ dias = 3, dryRun = false, incluirHoje = false } = {}) {
  if (!ola.configurado()) {
    return { ignorado: "OLACLICK_API_TOKEN não configurado", dias: [] };
  }

  const limite = Math.min(dias, MAX_DIAS);
  const fim    = incluirHoje ? hojeFortaleza() : somarDias(hojeFortaleza(), -1);

  const resultados = [];
  for (let i = limite - 1; i >= 0; i--) {
    resultados.push(await conciliarDia(somarDias(fim, -i), { dryRun }));
  }

  const todosCanais = resultados.flatMap((r) => r.canais || []);
  const feitos = (campo) => todosCanais.filter((c) => c[campo] === "lancado" || c[campo] === "lancaria");

  const receitas = feitos("acao");
  const taxas    = feitos("acaoTaxa");

  return {
    dryRun,
    de: somarDias(fim, -(limite - 1)),
    ate: fim,
    diasVerificados: resultados.length,
    lancamentos: receitas.length + taxas.length,
    receitaLancada: r2(receitas.reduce((s, c) => s + c.diferenca, 0)),
    taxaLancada:    r2(taxas.reduce((s, c) => s + c.taxaDiferenca, 0)),
    valorTotal:     r2(receitas.reduce((s, c) => s + c.diferenca, 0)),
    avisos: todosCanais.filter((c) => c.aviso || c.avisoTaxa || c.erro),
    dias: resultados,
  };
}

// Canal do pedido → categoria de receita. Usado também pelo webhook, para
// que webhook e conciliação classifiquem igual — se divergirem, a
// conciliação passa a enxergar diferença que não existe.
function categoriaPorCanal(source) {
  const s = String(source || "").toLowerCase();
  const achado = CANAIS.find((c) => c.sources.includes(s));
  return achado ? achado.categoria : "Delivery";
}

// ──────────────────────────────────────────────
if (require.main === module) {
  const arg  = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || "").split("=")[1];
  const dry  = process.argv.includes("--dry");
  const data = arg("data");
  const dias = parseInt(arg("dias") || "3", 10);

  const exec = data
    ? conciliarDia(data, { dryRun: dry })
    : conciliarPendentes({ dias, dryRun: dry });

  exec
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message || e); process.exit(1); });
}

module.exports = {
  CANAIS,
  COMISSOES,
  TAXA_MAQUINETA,
  componentesCanalProprio,
  CATEGORIA_TAXAS,
  DATA_MINIMA,
  MARCA,
  componentesIfood,
  conciliarDia,
  conciliarPendentes,
  categoriaPorCanal,
};
