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
  if (!TOKEN) return;
  await axios.post(`${BASE()}/sendMessage`, {
    chat_id:    chatId,
    text:       texto,
    parse_mode: "Markdown",
  });
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
    ].join("\n"));
    return;
  }

  // ── /resumo ──
  if (texto === "/resumo") {
    try {
      const r = await calcularResumo(7);
      await enviar(chatId, [
        "📊 *Resumo — últimos 7 dias*",
        `📈 Faturamento: R$${Number(r.faturamento).toFixed(2).replace(".", ",")}`,
        `📉 Gastos:      R$${Number(r.gastos).toFixed(2).replace(".", ",")}`,
        `💵 Lucro:       R$${Number(r.lucro).toFixed(2).replace(".", ",")}`,
        `📊 Margem:      ${r.margem}%`,
      ].join("\n"));
    } catch (e) {
      await enviar(chatId, `❌ Erro ao buscar resumo: ${e.message}`);
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
    await axios.post(`${BASE()}/setWebhook`, { url: webhookUrl, drop_pending_updates: true });
    console.log(`✅ Telegram webhook configurado: ${webhookUrl}`);
  } catch (e) {
    console.error("❌ Erro ao configurar webhook Telegram:", e.message);
  }
}

module.exports = { processarMensagem, configurarWebhook };
