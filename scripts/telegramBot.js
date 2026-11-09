// ──────────────────────────────────────────────
// telegramBot.js — Bot de gastos via Telegram
// Fluxo: mensagem com valor → cadastra despesa no financeiro
// ──────────────────────────────────────────────

const axios = require("axios");
const { adicionarEntrada, calcularResumo } = require("./financeiro");

const TOKEN        = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_CHAT_ID; // segurança: só aceita do seu chat
const BASE         = () => `https://api.telegram.org/bot${TOKEN}`;

// Mapa de palavras → categoria
const CATEGORIAS_MAP = {
  ingrediente:  "Ingredientes / Insumos",
  insumo:       "Ingredientes / Insumos",
  carne:        "Ingredientes / Insumos",
  pao:          "Ingredientes / Insumos",
  queijo:       "Ingredientes / Insumos",
  embalagem:    "Embalagens",
  caixa:        "Embalagens",
  saco:         "Embalagens",
  marketing:    "Marketing / Anúncios",
  anuncio:      "Marketing / Anúncios",
  trafego:      "Marketing / Anúncios",
  funcionario:  "Funcionários",
  salario:      "Funcionários",
  aluguel:      "Aluguel",
  gas:          "Gás / Energia",
  energia:      "Gás / Energia",
  luz:          "Gás / Energia",
  equipamento:  "Equipamentos",
  maquina:      "Equipamentos",
};

function detectarCategoria(texto) {
  const lower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [chave, cat] of Object.entries(CATEGORIAS_MAP)) {
    if (lower.includes(chave)) return cat;
  }
  return "Outros";
}

function parsearMensagem(texto) {
  // Extrai todos os números (inteiros ou decimais com , ou .)
  const matches = texto.match(/\d+([.,]\d{1,2})?/g) || [];
  const valores = matches.map(n => parseFloat(n.replace(",", ".")));
  const categoria = detectarCategoria(texto);
  return { valores, categoria };
}

async function enviar(chatId, texto) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN não configurado");
  await axios.post(`${BASE()}/sendMessage`, {
    chat_id:    chatId,
    text:       texto,
    parse_mode: "Markdown",
  });
}

// Datas sempre no fuso de Fortaleza. O Render roda em UTC: depois das 21h
// locais um `new Date()` sem fuso já virou o dia seguinte, e um /fechado
// mandado à noite marcaria amanhã em vez de hoje. Foi exatamente esse bug
// que fez o webhook lançar 32% dos pedidos no dia errado.
const TZ_BR = "America/Fortaleza";

function hojeBR() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ_BR });
}

// Aceita vazio (hoje), DD/MM e DD/MM/AAAA. Devolve YYYY-MM-DD, ou null se
// não entendeu — melhor recusar e perguntar do que pausar o dia errado.
function interpretarData(arg) {
  if (!arg) return hojeBR();
  const m = String(arg).match(new RegExp("^([0-9]{1,2})/([0-9]{1,2})(?:/([0-9]{2,4}))?$"));
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let ano = m[3] ? Number(m[3]) : Number(hojeBR().slice(0, 4));
  if (ano < 100) ano += 2000;
  return ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
}

function formatarBR(iso) {
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

async function processarMensagem(msg) {
  const chatId = String(msg.chat.id);
  const texto  = (msg.text || "").trim();

  // Segurança: ignora mensagens de outros chats
  if (ALLOWED_CHAT && chatId !== String(ALLOWED_CHAT)) {
    await enviar(chatId, "❌ Acesso não autorizado.");
    return;
  }

  // ── /start ──
  // ATENÇÃO: na prática /start e /ajuda não chegam mais aqui. O webhook
  // do Telegram passa pelo atendente na VM (infra/bot/index.js), que
  // responde a ajuda ele mesmo, porque é o único que conhece também os
  // comandos de IA (/semia, /comia). Este texto ficou como reserva: se o
  // webhook voltar a apontar para o Render, ele volta a valer. Mudou
  // comando de gasto aqui? Atualize TG_TEXTO_AJUDA lá também.
  if (texto === "/start" || texto === "/ajuda") {
    await enviar(chatId, [
      "🍔 *Bruthus Burger — Bot de Gastos*",
      "",
      "Mande o valor e vou registrar como despesa.",
      "",
      "*Exemplos:*",
      "`150` → R$150 em Outros",
      "`200 ingredientes` → R$200 em Ingredientes",
      "`20 45 80` → 3 despesas de R$20, R$45 e R$80",
      "`1572 ingredientes` → R$1.572 em Ingredientes",
      "",
      "*Categorias reconhecidas:*",
      "ingrediente, embalagem, marketing, funcionario, aluguel, gas, equipamento",
      "",
      "/resumo → Gastos dos últimos 7 dias",
      "/enviei → Confirma que você mandou a lista de clientes do dia",
      "/fechado → Hoje não abre (ou `/fechado 11/11`)",
      "/abrir → Desfaz o /fechado",
    ].join("\n"));
    return;
  }

  // ── /resumo ──
  if (texto === "/resumo") {
    try {
      const r = await calcularResumo(7);
      await enviar(chatId, [
        "📊 *Resumo — últimos 7 dias*",
        `📈 Faturamento: R$${Number(r.faturamento).toFixed(2).replace(".", ",")} (líquido)`,
        `📉 Gastos:      R$${Number(r.gastos).toFixed(2).replace(".", ",")}`,
        `💵 Lucro:       R$${Number(r.lucro).toFixed(2).replace(".", ",")}`,
        `📊 Margem:      ${r.margem}%`,
      ].join("\n"));
    } catch (e) {
      await enviar(chatId, `❌ Erro ao buscar resumo: ${e.message}`);
    }
    return;
  }

  // ── /enviei — confirma que a lista de recuperação foi enviada ──
  if (texto === "/enviei" || texto === "/enviado") {
    try {
      const { confirmarPendentes } = require("./dbClientes");
      const n = await confirmarPendentes();
      await enviar(chatId, n
        ? `✅ *${n} cliente(s) marcado(s) como contatado(s)*\nEles não voltam na lista por 30 dias.`
        : "ℹ️ Não havia lista pendente. Nada a confirmar.");
    } catch (e) {
      await enviar(chatId, `❌ Erro ao confirmar: ${e.message}`);
    }
    return;
  }

  // ── /fechado — hoje (ou a data informada) a loja não abre ──
  // O OlaClick não sabe dizer isso: `get_store_status` só enxerga iFood,
  // Rappi e 99Food, e devolve UNKNOWN para todos. Quem sabe é o dono.
  // Fica no banco porque o Render reinicia o processo a qualquer momento
  // e uma flag em memória sumiria junto.
  if (texto === "/fechado" || texto.startsWith("/fechado ")) {
    try {
      const { pausarDia, listarPausasFuturas } = require("./dbClientes");
      const arg = texto.slice("/fechado".length).trim();
      const data = interpretarData(arg);
      if (!data) {
        await enviar(chatId, "❌ Não entendi a data.\nUse */fechado* para hoje, ou */fechado 11/11*.");
        return;
      }
      await pausarDia(data, arg ? null : "avisado no dia");
      const futuras = await listarPausasFuturas();
      const lista = futuras.map((f) => formatarBR(f.data)).join(", ");
      await enviar(chatId,
        `🚫 *${formatarBR(data)} marcado como fechado*\n` +
        "Nenhuma mensagem de recuperação sai nesse dia.\n\n" +
        `Dias fechados: ${lista}\n` +
        "_Para desfazer, mande */abrir*_");
    } catch (e) {
      await enviar(chatId, `❌ Erro ao marcar como fechado: ${e.message}`);
    }
    return;
  }

  // ── /abrir — desfaz o /fechado ──
  if (texto === "/abrir" || texto.startsWith("/abrir ")) {
    try {
      const { despausarDia } = require("./dbClientes");
      const arg = texto.slice("/abrir".length).trim();
      const data = interpretarData(arg);
      if (!data) {
        await enviar(chatId, "❌ Não entendi a data.\nUse */abrir* para hoje, ou */abrir 11/11*.");
        return;
      }
      const tinha = await despausarDia(data);
      await enviar(chatId, tinha
        ? `✅ *${formatarBR(data)} liberado*\nA campanha volta a enviar nesse dia.`
        : `ℹ️ ${formatarBR(data)} não estava marcado como fechado.`);
    } catch (e) {
      await enviar(chatId, `❌ Erro: ${e.message}`);
    }
    return;
  }

  // ── Registrar gasto(s) ──
  const { valores, categoria } = parsearMensagem(texto);

  if (valores.length === 0) {
    await enviar(chatId, "❓ Não encontrei valores.\n\nMande um número como `150` ou `200 ingredientes`.\n\n/ajuda para ver exemplos.");
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  let total = 0;

  try {
    for (const valor of valores) {
      await adicionarEntrada({
        tipo:      "despesa",
        valor,
        categoria,
        descricao: "Via Telegram",
        data:      hoje,
      });
      total += valor;
    }

    const qtd = valores.length;
    const detalhes = valores.length > 1
      ? `\n📋 Valores: ${valores.map(v => `R$${v.toFixed(2).replace(".", ",")}`).join(" + ")}`
      : "";

    await enviar(chatId, [
      `✅ *${qtd} gasto${qtd > 1 ? "s" : ""} registrado${qtd > 1 ? "s" : ""}*`,
      `💸 Total: *R$${total.toFixed(2).replace(".", ",")}*`,
      `📂 Categoria: ${categoria}`,
      detalhes,
    ].filter(Boolean).join("\n"));

  } catch (e) {
    await enviar(chatId, `❌ Erro ao registrar: ${e.message}`);
  }
}

async function configurarWebhook(serverUrl) {
  if (!TOKEN) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN não configurado — bot inativo.");
    return;
  }
  try {
    const webhookUrl = `${serverUrl}/webhook/telegram`;
    await axios.post(`${BASE()}/setWebhook`, { url: webhookUrl, drop_pending_updates: false });
    console.log(`✅ Telegram webhook configurado: ${webhookUrl}`);
  } catch (e) {
    console.error("❌ Erro ao configurar webhook Telegram:", e.message);
  }
}

// `enviar` é exportado para a campanha diária poder mandar a lista de
// clientes do dia quando o WhatsApp ainda não está configurado.
module.exports = { processarMensagem, configurarWebhook, enviar };
