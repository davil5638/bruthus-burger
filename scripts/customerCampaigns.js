const OpenAI = require("openai");
const {
  conectar, listarClientes, jaEnviouRecentemente, registrarEnvio, buscarClienteId,
} = require("./dbClientes");
const { enviarTexto } = require("./whatsappEvolution");

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";

// ──────────────────────────────────────────────
// Catálogo de incentivos por segmento
// (chave = segmento; cada item: prioridade, texto humano e cupom opcional)
// ──────────────────────────────────────────────
const INCENTIVOS = {
  vip: [
    { id: "novidade",        rotulo: "novidade exclusiva (sem cupom)", cupom: null,         tom: "exclusivo" },
    { id: "brinde_vip",      rotulo: "brinde exclusivo no próximo pedido", cupom: "VIP_BRUTHUS", tom: "premiar" },
  ],
  em_risco: [
    { id: "cupom_15",        rotulo: "cupom de 15% OFF",               cupom: "VOLTA15",    tom: "saudade_leve" },
    { id: "frete_gratis",    rotulo: "frete grátis",                   cupom: "FRETE0",     tom: "praticidade" },
  ],
  perdido: [
    { id: "cupom_25",        rotulo: "cupom de 25% OFF",               cupom: "SAUDADE25",  tom: "saudade_forte" },
    { id: "combo_familia",   rotulo: "combo família em condição única", cupom: "FAMILIA",    tom: "evento" },
  ],
  novo: [
    { id: "ganhe_2pedido",   rotulo: "10% OFF no 2º pedido",           cupom: "BEMVINDO10", tom: "boas_vindas" },
    { id: "brinde_2pedido",  rotulo: "batata grátis no 2º pedido",     cupom: "BATATAFREE", tom: "boas_vindas" },
  ],
  impulsivo: [
    { id: "flash_hoje",      rotulo: "promo relâmpago válida só hoje", cupom: "HOJE12",     tom: "urgencia" },
    { id: "combo_noite",     rotulo: "combo da madrugada",             cupom: "NOITE15",    tom: "noturno" },
  ],
  sensivel_desconto: [
    { id: "cupom_direto",    rotulo: "cupom de 20% OFF",               cupom: "DESCONTO20", tom: "direto" },
    { id: "leve_3_pague_2",  rotulo: "leve 3 pague 2 em smash",        cupom: "SMASH3X2",   tom: "direto" },
  ],
  regular: [
    { id: "nada",            rotulo: "lembrete gentil (sem desconto)", cupom: null,         tom: "lembrete" },
  ],
};

function escolherIncentivo(segmento, cliente) {
  const opcoes = INCENTIVOS[segmento] || INCENTIVOS.regular;
  // heurística: se ticket alto, evita o cupom mais agressivo
  if (segmento === "perdido" && Number(cliente.ticket_medio) > 80) return opcoes[1] || opcoes[0];
  if (segmento === "em_risco" && Number(cliente.ticket_medio) > 70) return opcoes[1] || opcoes[0];
  // alterna pelo id do cliente para distribuir os incentivos
  return opcoes[cliente.id % opcoes.length];
}

// ──────────────────────────────────────────────
// Geração da mensagem por OpenAI (com fallback estático)
// ──────────────────────────────────────────────
const PROMPT_BASE = {
  vip: `Você é o atendimento do Bruthus Burger falando com um cliente VIP.
Tom: caloroso, premium, sem clichê, sem emoji excessivo (no máximo 2).
Objetivo: agradecer fidelidade e convidar a experimentar uma novidade.`,
  em_risco: `Você é o atendimento do Bruthus Burger falando com um cliente que estava ativo e diminuiu o consumo.
Tom: sentimos sua falta, leve, sem dramatizar. No máximo 2 emojis.
Objetivo: trazer ele de volta com um incentivo gentil.`,
  perdido: `Você é o atendimento do Bruthus Burger falando com um cliente que sumiu há tempos.
Tom: saudade real, honesto, sem culpa. No máximo 2 emojis.
Objetivo: oferecer um motivo forte para o reencontro.`,
  novo: `Você é o atendimento do Bruthus Burger falando com um cliente novo (1-2 pedidos).
Tom: receptivo, próximo, dando boas-vindas. No máximo 2 emojis.
Objetivo: estimular o 2º pedido.`,
  impulsivo: `Você é o atendimento do Bruthus Burger falando com um cliente que pede por impulso (fins de semana, à noite).
Tom: empolgado, direto, com urgência. No máximo 2 emojis.
Objetivo: provocar o pedido AGORA.`,
  sensivel_desconto: `Você é o atendimento do Bruthus Burger falando com um cliente que sempre pede com cupom.
Tom: direto ao ponto, sem rodeios. No máximo 1 emoji.
Objetivo: entregar o desconto e fechar.`,
  regular: `Você é o atendimento do Bruthus Burger falando com um cliente regular.
Tom: simples e amigo. No máximo 2 emojis.
Objetivo: lembrar do restaurante sem ser invasivo.`,
};

function mensagemFallback(segmento, cliente, incentivo) {
  const nome = cliente.nome?.split(" ")[0] || "amigo";
  const cupomTxt = incentivo.cupom ? `\nCupom: *${incentivo.cupom}*` : "";
  const base = {
    vip:               `${nome}, você é um dos nossos clientes mais especiais 🍔\nQueremos te avisar em primeira mão: novidade saindo! ${incentivo.rotulo}.${cupomTxt}\n${ORDER_LINK}`,
    em_risco:          `${nome}, faz um tempinho que a gente não te vê por aqui 🙏\nSeparamos ${incentivo.rotulo} pra você.${cupomTxt}\n${ORDER_LINK}`,
    perdido:           `${nome}, sentimos saudade! 🍔 Pra te receber de volta, liberamos ${incentivo.rotulo}.${cupomTxt}\n${ORDER_LINK}`,
    novo:              `${nome}, bem-vindo ao Bruthus! 🔥 Pra um 2º pedido inesquecível, garantimos ${incentivo.rotulo}.${cupomTxt}\n${ORDER_LINK}`,
    impulsivo:         `${nome}, hoje rola ${incentivo.rotulo} 🔥 só por algumas horas!${cupomTxt}\nPedir agora: ${ORDER_LINK}`,
    sensivel_desconto: `${nome}, ${incentivo.rotulo} liberado pra você.${cupomTxt}\n${ORDER_LINK}`,
    regular:           `${nome}, passando aqui pra lembrar que tem hambúrguer artesanal te esperando 🍔\n${ORDER_LINK}`,
  };
  return base[segmento] || base.regular;
}

async function gerarMensagem(segmento, cliente, incentivo) {
  if (!process.env.OPENAI_API_KEY) return mensagemFallback(segmento, cliente, incentivo);
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const nome = cliente.nome?.split(" ")[0] || "";
    const ticket = Number(cliente.ticket_medio || 0).toFixed(2);
    const ultimo = cliente.ultimo_pedido_em ? new Date(cliente.ultimo_pedido_em).toLocaleDateString("pt-BR") : "—";
    const totalPedidos = cliente.total_pedidos || 0;

    const prompt = `${PROMPT_BASE[segmento] || PROMPT_BASE.regular}

Contexto do cliente:
- Nome: ${nome || "desconhecido"}
- Último pedido: ${ultimo}
- Total de pedidos: ${totalPedidos}
- Ticket médio: R$ ${ticket}
- Recência: ${cliente.recencia_dias ?? "?"} dias

Incentivo a oferecer: ${incentivo.rotulo}${incentivo.cupom ? ` (cupom ${incentivo.cupom})` : " (sem cupom)"}
Link de pedido: ${ORDER_LINK}

Regras:
- Mensagem de WhatsApp curta (3 a 5 linhas).
- Sem assinatura formal, sem "atenciosamente".
- Não cite "campanha", "marketing" ou "automação".
- Se houver cupom, exiba em negrito (*CUPOM*).
- Inclua o link de pedido no final.
- Português do Brasil, regional (Fortaleza).
- NUNCA invente desconto diferente do informado.

Devolva SOMENTE o texto da mensagem.`;

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 220,
      temperature: 0.8,
    });
    const txt = res.choices[0]?.message?.content?.trim();
    return txt || mensagemFallback(segmento, cliente, incentivo);
  } catch (e) {
    console.warn("⚠️ OpenAI falhou, usando fallback:", e.message);
    return mensagemFallback(segmento, cliente, incentivo);
  }
}

// ──────────────────────────────────────────────
// Preview (sem enviar) — útil para dashboard
// ──────────────────────────────────────────────
async function previewSegmento(segmento, limite = 5) {
  await conectar();
  const clientes = await listarClientes({ segmento, limite });
  const previews = [];
  for (const c of clientes) {
    const incentivo = escolherIncentivo(segmento, c);
    const mensagem  = await gerarMensagem(segmento, c, incentivo);
    previews.push({
      clienteId: c.id, nome: c.nome, telefone: c.telefone,
      scoreRisco: c.score_risco, scoreValor: c.score_valor,
      incentivo: incentivo.rotulo, cupom: incentivo.cupom, mensagem,
    });
  }
  return { segmento, total: clientes.length, previews };
}

// ──────────────────────────────────────────────
// Dispatcher
// opções: limite (max envios), dryRun (não envia, só registra), janelaAntiSpamDias
// ──────────────────────────────────────────────
async function dispararSegmento(segmento, { limite = 50, dryRun = false, janelaAntiSpamDias = 7 } = {}) {
  await conectar();
  const clientes = await listarClientes({ segmento, limite: limite * 3 });
  const elegiveis = [];
  for (const c of clientes) {
    if (!c.telefone) continue;
    if (await jaEnviouRecentemente(c.id, janelaAntiSpamDias)) continue;
    elegiveis.push(c);
    if (elegiveis.length >= limite) break;
  }

  const resultados = [];
  for (const c of elegiveis) {
    const incentivo = escolherIncentivo(segmento, c);
    const mensagem  = await gerarMensagem(segmento, c, incentivo);
    let status = "enviado";
    let erro   = null;
    try {
      if (!dryRun) await enviarTexto(c.telefone, mensagem);
    } catch (e) {
      status = "falhou"; erro = e.message;
    }
    const envio = await registrarEnvio({
      clienteId: c.id, segmento, template: segmento + "_" + incentivo.id,
      incentivo: incentivo.id, cupom: incentivo.cupom, mensagem, status, erro,
    });
    resultados.push({ clienteId: c.id, nome: c.nome, telefone: c.telefone, status, envioId: envio.id, erro });
  }

  const ok = resultados.filter(r => r.status === "enviado").length;
  console.log(`📨 [${segmento}] enviados=${ok} falhas=${resultados.length - ok} (dryRun=${dryRun})`);
  return { segmento, total: resultados.length, enviados: ok, falhas: resultados.length - ok, dryRun, resultados };
}

async function dispararParaCliente(clienteId, { dryRun = false } = {}) {
  const cliente = await buscarClienteId(clienteId);
  if (!cliente) throw new Error("Cliente não encontrado");
  const segmento = cliente.segmento || "regular";
  const incentivo = escolherIncentivo(segmento, cliente);
  const mensagem  = await gerarMensagem(segmento, cliente, incentivo);

  let status = "enviado", erro = null;
  try {
    if (!dryRun) await enviarTexto(cliente.telefone, mensagem);
  } catch (e) { status = "falhou"; erro = e.message; }
  const envio = await registrarEnvio({
    clienteId, segmento, template: segmento + "_" + incentivo.id,
    incentivo: incentivo.id, cupom: incentivo.cupom, mensagem, status, erro,
  });
  return { envio, mensagem, incentivo: incentivo.rotulo, status };
}

module.exports = {
  INCENTIVOS,
  escolherIncentivo,
  gerarMensagem,
  mensagemFallback,
  previewSegmento,
  dispararSegmento,
  dispararParaCliente,
};
