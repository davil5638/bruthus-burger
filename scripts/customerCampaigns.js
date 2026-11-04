const OpenAI = require("openai");
const {
  conectar, listarClientes, jaEnviouRecentemente, registrarEnvio, buscarClienteId,
} = require("./dbClientes");
const { enviarTexto } = require("./whatsappEvolution");

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";

// ──────────────────────────────────────────────
// Incentivo único: BRUTHUS15, 15% OFF no pedido.
//
// Antes havia um cupom diferente por segmento — VOLTA15, SAUDADE25,
// FAMILIA, BATATAFREE, HOJE12 e outros. Dava para calibrar a oferta por
// perfil, mas cada cupom é uma regra a cadastrar no OlaClick, uma exceção
// a lembrar e uma chance de errar na hora de aplicar no balcão. O dono
// pediu um só, e tem razão: desconto que ninguém consegue aplicar direito
// não vira venda, vira discussão no caixa.
//
// O TOM da mensagem continua mudando por segmento (ver mensagemFallback).
// É o cupom que é único, não o texto.
// ──────────────────────────────────────────────
const INCENTIVO_PADRAO = {
  id:     "bruthus15",
  // "pelo link" nao e enfeite: o cupom so vale no cardapio proprio, nao no
  // iFood. Sem isso o cliente tenta no app, leva erro e a campanha vira
  // irritacao. E empurrar para o link e o que a loja quer de qualquer jeito.
  rotulo: "15% OFF no pedido pelo link",
  // Versao curta para encaixar no meio de uma frase. O rotulo inteiro
  // trunca o texto ("Deixamos 15% OFF no pedido pelo link separado no seu
  // nome"), entao as variacoes usam esta e dizem "pelo link" por conta.
  rotuloCurto: "15% OFF",
  cupom:  "BRUTHUS15",
  tom:    "direto",
};

// Mantido como objeto para quem importa `INCENTIVOS`, mas agora todos os
// segmentos apontam para o mesmo incentivo.
const INCENTIVOS = { padrao: [INCENTIVO_PADRAO] };

function escolherIncentivo() {
  return INCENTIVO_PADRAO;
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

// Varia o texto de propósito. Cinco mensagens idênticas saindo do mesmo
// número em poucos minutos é o padrão que o WhatsApp usa para flagrar
// disparo em massa — e aqui o número é o da operação, o que recebe
// pedido. Cada cliente do lote recebe um texto diferente mesmo sem a
// OpenAI configurada (que é o caso hoje).
//
// `i` é o rótulo curto do incentivo ("15% OFF"). Cada frase diz "pelo
// link" por conta própria, porque o cupom não vale no iFood.
const VARIACOES = {
  vip: [
    (n, i, c) => `${n}, você é um dos nossos clientes mais especiais 🍔
Novidade saindo do forno, e você sabe primeiro: ${i} pedindo pelo link.${c}`,
    (n, i, c) => `${n}, cliente de casa merece tratamento de casa 🙌
Guardamos ${i} pro seu próximo pedido pelo link.${c}`,
    (n, i, c) => `Oi ${n}! Separamos ${i} pra quem é de casa — é só pedir pelo link.${c}`,
  ],
  em_risco: [
    (n, i, c) => `${n}, faz um tempinho que a gente não te vê por aqui 🙏
Separamos ${i} pro seu próximo pedido pelo link.${c}`,
    (n, i, c) => `Oi ${n}, tudo bem? Notamos que você sumiu um pouco.
Tem ${i} te esperando — é só pedir pelo link.${c}`,
    (n, i, c) => `${n}, que tal matar a saudade do nosso hambúrguer? 🍔
Deixamos ${i} no seu nome, pedindo pelo link.${c}`,
    (n, i, c) => `${n}, a chapa continua quente por aqui 🔥
${i} no seu pedido pelo link.${c}`,
    (n, i, c) => `Oi ${n}! Faz um tempo que você não pede com a gente.
Se quiser voltar hoje, ${i} pelo link.${c}`,
  ],
  perdido: [
    (n, i, c) => `${n}, sentimos saudade! 🍔
Pra te receber de volta, ${i} no pedido pelo link.${c}`,
    (n, i, c) => `${n}, quanto tempo! A Bruthus continua firme aqui.
Se quiser dar uma chance pra gente de novo, ${i} pelo link.${c}`,
    (n, i, c) => `Oi ${n}, tudo certo? Faz bastante tempo que você não aparece 🙏
Separamos ${i} pro reencontro, pedindo pelo link.${c}`,
    (n, i, c) => `${n}, a gente lembra de você por aqui.
Se bater vontade hoje, tem ${i} no seu nome pelo link.${c}`,
    (n, i, c) => `${n}, bora matar a saudade? 🔥 Tem ${i} te esperando no link.${c}`,
  ],
  novo: [
    (n, i, c) => `${n}, bem-vindo ao Bruthus! 🔥
Pra um 2º pedido inesquecível, ${i} pelo link.${c}`,
    (n, i, c) => `Oi ${n}! Que bom ter você com a gente 🍔
Pro próximo pedido, ${i} pelo link.${c}`,
    (n, i, c) => `${n}, gostou do primeiro? O segundo vai com ${i}, pedindo pelo link.${c}`,
  ],
  impulsivo: [
    (n, i, c) => `${n}, hoje rola ${i} no pedido pelo link 🔥${c}`,
    (n, i, c) => `${n}, bateu a fome? Tem ${i} liberado agora pelo link.${c}`,
    (n, i, c) => `Fala ${n}! Chapa quente e ${i} te esperando no link 🍔${c}`,
  ],
  sensivel_desconto: [
    (n, i, c) => `${n}, ${i} liberado pro seu pedido pelo link.${c}`,
    (n, i, c) => `${n}, seu desconto está de pé: ${i} pelo link.${c}`,
    (n, i, c) => `Oi ${n}, ${i} no seu nome, pedindo pelo link.${c}`,
  ],
  regular: [
    (n, i, c) => `${n}, passando pra lembrar que tem hambúrguer artesanal te esperando 🍔${c}`,
    (n, i, c) => `Oi ${n}! A chapa tá quente hoje 🔥${c}`,
    (n, i, c) => `${n}, bateu vontade de um hambúrguer de verdade? 🍔${c}`,
  ],
};

// Rodízio, não sorteio. Sorteando, um lote de 5 repetia texto — saíram
// duas mensagens iguais em 5 no primeiro teste, que é justamente o que a
// variação existe para evitar. O ponteiro começa num ponto aleatório para
// os lotes não abrirem sempre com a mesma frase, e avança a cada envio.
const ponteiroVariacao = {};

function proximaVariacao(segmento, opcoes) {
  if (ponteiroVariacao[segmento] === undefined) {
    ponteiroVariacao[segmento] = Math.floor(Math.random() * opcoes.length);
  }
  const i = ponteiroVariacao[segmento] % opcoes.length;
  ponteiroVariacao[segmento] = (i + 1) % opcoes.length;
  return opcoes[i];
}

function mensagemFallback(segmento, cliente, incentivo) {
  const nome = cliente.nome?.split(" ")[0] || "amigo";
  const cupomTxt = incentivo.cupom ? `
Cupom: *${incentivo.cupom}*` : "";
  const rotulo = incentivo.rotuloCurto || incentivo.rotulo;
  const opcoes = VARIACOES[segmento] || VARIACOES.regular;
  const escolhida = proximaVariacao(segmento, opcoes);
  return `${escolhida(nome, rotulo, cupomTxt)}
${ORDER_LINK}`;
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
    // Mesma regra: simulação não escreve histórico.
    const envio = dryRun ? null : await registrarEnvio({
      clienteId: c.id, segmento, template: segmento + "_" + incentivo.id,
      incentivo: incentivo.id, cupom: incentivo.cupom, mensagem, status, erro,
    });
    resultados.push({ clienteId: c.id, nome: c.nome, telefone: c.telefone, status, envioId: envio ? envio.id : null, erro });
  }

  const ok = resultados.filter(r => r.status === "enviado").length;
  console.log(`📨 [${segmento}] enviados=${ok} falhas=${resultados.length - ok} (dryRun=${dryRun})`);
  return { segmento, total: resultados.length, enviados: ok, falhas: resultados.length - ok, dryRun, resultados };
}

// opções:
//   dryRun       → não envia
//   registrar    → false não grava nada em campanhas_envios
//   rotuloStatus → sobrescreve o status gravado (ex: "lista_manual")
//
// Antes, dryRun pulava o envio mas gravava assim mesmo, com status
// "enviado". Mentia no histórico e, pior, bloqueava o cliente pela janela
// anti-spam por causa de um teste que nunca saiu.
async function dispararParaCliente(clienteId, { dryRun = false, registrar = true, rotuloStatus = null } = {}) {
  const cliente = await buscarClienteId(clienteId);
  if (!cliente) throw new Error("Cliente não encontrado");
  const segmento = cliente.segmento || "regular";
  const incentivo = escolherIncentivo(segmento, cliente);
  const mensagem  = await gerarMensagem(segmento, cliente, incentivo);

  let status = "enviado", erro = null;
  try {
    if (!dryRun) await enviarTexto(cliente.telefone, mensagem);
  } catch (e) { status = "falhou"; erro = e.message; }
  if (rotuloStatus) status = rotuloStatus;

  const envio = registrar
    ? await registrarEnvio({
        clienteId, segmento, template: segmento + "_" + incentivo.id,
        incentivo: incentivo.id, cupom: incentivo.cupom, mensagem, status, erro,
      })
    : null;
  return { envio, mensagem, incentivo: incentivo.rotulo, status, registrado: Boolean(envio) };
}

module.exports = {
  INCENTIVOS,
  INCENTIVO_PADRAO,
  escolherIncentivo,
  gerarMensagem,
  mensagemFallback,
  previewSegmento,
  dispararSegmento,
  dispararParaCliente,
};
