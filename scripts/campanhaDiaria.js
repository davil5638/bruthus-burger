// ──────────────────────────────────────────────
// campanhaDiaria.js — recuperação de cliente em doses pequenas
//
// O PROBLEMA:
// 491 dos 792 clientes compraram UMA vez e nunca voltaram (62%). Outros
// 101 sumiram nos últimos 30 a 120 dias depois de já terem gastado
// R$ 14.451. O motor de campanha (`customerCampaigns`) sabe quem chamar e
// escreve a mensagem, mas ninguém o aciona — 5 envios em toda a história.
//
// O QUE ISTO FAZ:
// Uma vez por dia, escolhe POUCOS clientes e manda a mensagem deles. A
// ideia não é varrer a base, é pingar. Quem já foi chamado não é chamado
// de novo por bastante tempo, e quem voltou a comprar sai da fila sozinho
// (o webhook do OlaClick marca a recuperação quando o pedido chega).
//
// SE O WHATSAPP NÃO ESTIVER CONFIGURADO:
// Em vez de não fazer nada, manda a lista do dia para o Telegram com um
// link `wa.me` por cliente, já com a mensagem preenchida. Um toque e você
// envia do seu próprio número. É o mesmo trabalho que o robô faria, só
// que com o seu dedo — e sem risco nenhum de ban.
//
// Quando o WhatsApp for configurado, o envio passa a ser automático e
// nada mais muda.
//
// Uso direto:
//   node scripts/campanhaDiaria.js          → roda o dia de hoje
//   node scripts/campanhaDiaria.js --dry    → não envia nem registra envio
//   node scripts/campanhaDiaria.js --qtd=3
// ──────────────────────────────────────────────

if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const campanhas = require("./customerCampaigns");
const whats     = require("./whatsappEvolution");
const telegram  = require("./telegramBot");
const olaclick  = require("./olaclickApi");
const { listarClientes, jaEnviouRecentemente, limparPendentes, diaPausado } = require("./dbClientes");

// Qualquer canal serve como prova de que a loja abriu — um pedido no iFood
// significa cozinha ligada tanto quanto um pelo cardápio próprio.
const SOURCES_LOJA = ["inbound", "outbound", "chatbot", "ifood", "rappi", "uber_eats"];

// Quantos clientes por dia. Começa pequeno de propósito: é melhor
// descobrir que a mensagem não funciona com 5 pessoas do que com 100.
const POR_DIA = 5;

// Dias sem chamar o mesmo cliente de novo. O padrão do disparador é 7,
// curto demais — quem não respondeu em uma semana não quer ser lembrado
// em uma semana. 30 dias, escolhido pelo dono: cerca de uma vez por mês
// por pessoa, raro o bastante para não virar incômodo.
const JANELA_DIAS = 30;

// Só manda em dia que a loja abre. Chamar alguém para vir hoje quando a
// loja está fechada é pior que não chamar. 0=domingo.
// Hoje: quinta a domingo. A partir de 11/11 a quarta entra — basta somar 3.
// Quarta a domingo. A quarta entra a partir de 11/11, mas já pode ficar
// ligada aqui: a checagem de pedido abaixo cala a campanha em qualquer dia
// sem movimento, então uma quarta fechada não dispara nada.
const DIAS_DE_ENVIO = [3, 4, 5, 6, 0];

// Segmentos elegíveis, na ordem em que são esvaziados. "perdido" primeiro
// porque é o maior grupo e o que tem mais a ganhar; "em_risco" depois,
// porque ainda dá para evitar que vire perdido.
const SEGMENTOS = ["em_risco", "perdido"];

// Telefone com menos dígitos que isto é registro de teste do POS, não
// cliente. A base tem vários ("teste", "ana", "aline" com números falsos).
const MIN_DIGITOS = 12;

// O Telegram usa parse_mode Markdown, e underscore solto abre itálico que
// nunca fecha — a API recusa a mensagem INTEIRA com 400. "em_risco" tem um,
// e com 5 clientes na lista são 5 underscores. Rótulo legível resolve o
// problema e ainda fica melhor de ler.
const ROTULO_SEGMENTO = {
  em_risco: "em risco",
  perdido:  "sumiu faz tempo",
  novo:     "cliente novo",
  vip:      "VIP",
  regular:  "regular",
  impulsivo: "compra por impulso",
};

// Escapa o que o Markdown do Telegram interpreta. Nome de cliente pode ter
// qualquer coisa, e um "_" no meio quebra a mensagem toda.
function escaparMarkdown(txt) {
  return String(txt || "").replace(/([_*`\[\]])/g, "\\$1");
}

const TZ = "America/Fortaleza";

function hojeFortaleza() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function diaDaSemana() {
  const nome = new Date().toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
}

function telefoneValido(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length < MIN_DIGITOS || d.length > 13) return false;
  // Número repetido tipo 5512321321321312 é lixo de cadastro.
  if (/^(\d)\1+$/.test(d.slice(2))) return false;
  return true;
}

// Link que abre o WhatsApp com a mensagem já escrita.
function linkWhatsapp(telefone, mensagem) {
  const num = String(telefone).replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`;
}

// A IA às vezes devolve o link em Markdown — [url](url) — e o WhatsApp
// mostra os colchetes na cara do cliente. Também normaliza o negrito,
// que no WhatsApp é *asterisco simples*, não **duplo**.
function limparParaWhatsapp(texto) {
  return String(texto || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$2")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .trim();
}

// ──────────────────────────────────────────────
// Monta a fila do dia: percorre os segmentos na ordem, pega quem tem
// telefone de verdade e quem não foi chamado dentro da janela.
// ──────────────────────────────────────────────
async function filaDoDia(qtd) {
  const escolhidos = [];
  const vistos = new Set();

  for (const segmento of SEGMENTOS) {
    if (escolhidos.length >= qtd) break;

    const candidatos = await listarClientes({ segmento, limite: qtd * 10 });
    for (const c of candidatos) {
      if (escolhidos.length >= qtd) break;
      if (vistos.has(c.id)) continue;
      if (!telefoneValido(c.telefone)) continue;
      if (await jaEnviouRecentemente(c.id, JANELA_DIAS)) continue;

      vistos.add(c.id);
      escolhidos.push({ ...c, segmento });
    }
  }
  return escolhidos;
}

// ──────────────────────────────────────────────
// Roda o dia.
// ──────────────────────────────────────────────
async function rodarHoje({ qtd = POR_DIA, dryRun = false, ignorarDia = false } = {}) {
  const hoje = hojeFortaleza();

  if (!ignorarDia && !DIAS_DE_ENVIO.includes(diaDaSemana())) {
    return { data: hoje, ignorado: "loja_fechada_hoje", enviados: 0, fila: [] };
  }

  // Fechamento avulso — feriado, falta de insumo, o que for. O dono avisa
  // pelo Telegram com /fechado. Chamar cliente para uma loja fechada é
  // pior do que não chamar: queima o contato e a janela de 30 dias.
  //
  // Esta checagem NÃO respeita `ignorarDia`, de propósito. `--forcar`
  // existe para driblar a regra de dia da semana em teste; a pausa é uma
  // afirmação explícita de alguém que sabe que hoje não abre, e nenhum
  // disparo — nem manual — deve passar por cima dela.
  const pausa = await diaPausado(hoje);
  if (pausa.pausado) {
    return { data: hoje, ignorado: "dia_pausado", motivo: pausa.motivo, enviados: 0, fila: [] };
  }

  // Loja aberta? Pergunta indireta, mas honesta: se já entrou pedido hoje,
  // a loja está aberta. Não existe jeito direto — o get_store_status do
  // OlaClick só enxerga iFood e Rappi, e devolve UNKNOWN para todos.
  //
  // Medido em 30 dias de operação: o primeiro pedido cai por volta das
  // 18h30, e em apenas 1 desses dias (3%) não havia pedido nenhum às 19h.
  // Quando erra, erra para o lado seguro — não envia, e os clientes ficam
  // na fila para o próximo dia.
  //
  // Se o OlaClick não responder, segue em frente em vez de emudecer a
  // campanha por tempo indeterminado. A API fora do ar não é motivo para
  // ninguém mais ser chamado; o /fechado continua valendo nesse caso.
  let pedidosHoje = null;
  if (!ignorarDia && olaclick.configurado()) {
    try {
      const resumo = await olaclick.buscarResumo({
        dataInicio: hoje, dataFim: hoje, sources: SOURCES_LOJA,
      });
      pedidosHoje = resumo.pedidos;
      if (!pedidosHoje) {
        return { data: hoje, ignorado: "loja_sem_movimento", enviados: 0, fila: [] };
      }
    } catch (e) {
      console.warn("[CampanhaDiaria] não consegui conferir se a loja abriu:", e.message);
    }
  }

  // A lista de ontem que não foi enviada é descartada. Como a fila é
  // montada por prioridade, as mesmas pessoas reaparecem — é isso que faz
  // o cliente ficar na fila até a mensagem sair de verdade.
  if (!dryRun) await limparPendentes();

  const fila = await filaDoDia(qtd);
  if (!fila.length) {
    return { data: hoje, ignorado: "ninguem_elegivel", enviados: 0, fila: [] };
  }

  // Estado real, nao so "tem variavel". Se o chip caiu, a lista volta
  // para o Telegram e os mesmos clientes continuam na fila ate serem
  // contatados de verdade.
  const automatico = await whats.conectado();
  const resultados = [];

  for (const cliente of fila) {
    let r;
    try {
      // dispararParaCliente gera a mensagem, envia (ou não, se dryRun) e
      // registra em campanhas_envios — o registro é o que impede o
      // cliente de voltar para a fila amanhã.
      // Três casos distintos:
      //   simulação  → não envia, não grava
      //   automático → envia pelo WhatsApp e grava normalmente
      //   manual     → não envia, mas grava como "lista_manual" para o
      //                cliente não reaparecer na lista de amanhã
      const opcoes = dryRun
        ? { dryRun: true, registrar: false }
        : automatico
          ? { dryRun: false }
          : { dryRun: true, rotuloStatus: "pendente" };
      r = await campanhas.dispararParaCliente(cliente.id, opcoes);
    } catch (e) {
      resultados.push({ nome: cliente.nome, erro: e.message });
      continue;
    }

    const mensagem = limparParaWhatsapp(r.mensagem);
    resultados.push({
      nome: cliente.nome,
      telefone: cliente.telefone,
      segmento: cliente.segmento,
      incentivo: r.incentivo,
      mensagem,
      link: linkWhatsapp(cliente.telefone, mensagem),
      status: r.status,
    });
  }

  // Sem WhatsApp configurado, a lista vai para o Telegram para envio manual.
  let telegramStatus = null;
  if (!automatico && !dryRun) {
    telegramStatus = await avisarNoTelegram(resultados, hoje);
  }

  return {
    data: hoje,
    automatico,
    dryRun,
    enviados: automatico && !dryRun ? resultados.filter((r) => r.status === "enviado").length : 0,
    telegram: telegramStatus,
    fila: resultados,
  };
}

// Devolve o que aconteceu em vez de falhar calado. Sem isso, "não chegou
// nada" vira adivinhação: pode ser chat id ausente, token ausente ou a API
// recusando a formatação — e os três somem no mesmo catch mudo.
async function avisarNoTelegram(resultados, data) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { ok: false, motivo: "TELEGRAM_CHAT_ID não configurado" };

  const linhas = [
    `🔔 *${resultados.length} cliente(s) para chamar hoje*`,
    `_${data} — toque no link, confira e envie_`,
    "",
  ];
  const rodape = [
    "─────────────",
    "Quando terminar, responda */enviei*",
    "_Sem isso, os mesmos clientes voltam amanhã._",
  ];
  resultados.forEach((r, i) => {
    if (r.erro) { linhas.push(`${i + 1}. ${r.nome} — erro: ${r.erro}`); return; }
    const rotulo = ROTULO_SEGMENTO[r.segmento] || r.segmento.replace(/_/g, " ");
    linhas.push(`${i + 1}. *${escaparMarkdown(r.nome)}* — ${rotulo}`);
    linhas.push(r.link);
    linhas.push("");
  });

  try {
    await telegram.enviar(chatId, linhas.concat(rodape).join("\n"));
    return { ok: true };
  } catch (e) {
    const detalhe = e.response?.data?.description || e.message;
    console.warn("[CampanhaDiaria] não consegui avisar no Telegram:", detalhe);
    return { ok: false, motivo: detalhe };
  }
}

// ──────────────────────────────────────────────
if (require.main === module) {
  const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
  rodarHoje({
    qtd: parseInt(arg("qtd") || POR_DIA, 10),
    dryRun: process.argv.includes("--dry"),
    ignorarDia: process.argv.includes("--forcar"),
  })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("❌", e.message || e); process.exit(1); });
}

module.exports = {
  POR_DIA,
  JANELA_DIAS,
  DIAS_DE_ENVIO,
  SEGMENTOS,
  limparParaWhatsapp,
  telefoneValido,
  linkWhatsapp,
  filaDoDia,
  rodarHoje,
};
