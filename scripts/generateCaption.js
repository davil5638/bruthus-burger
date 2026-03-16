require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";

// Tipos de post disponíveis
const POST_TYPES = {
  SMASH: "smash burger artesanal suculento",
  COMBO: "combo completo com batata e refrigerante",
  PROMOCAO: "promoção especial do dia",
  FAMILIA: "combo família para compartilhar",
  BATATA: "batata frita crocante",
  SOBREMESA: "sobremesa especial",
};

// Gatilhos de conversão para variar nas legendas
const GATILHOS = [
  "escassez - poucas unidades disponíveis hoje",
  "urgência - promoção só hoje",
  "fome - descrição sensorial detalhada",
  "social proof - o mais pedido da semana",
  "novidade - lançamento exclusivo",
  "exclusividade - edição limitada",
];

/**
 * Gera uma legenda otimizada para conversão no Instagram
 * @param {string} tipo - Tipo de post (SMASH, COMBO, PROMOCAO, etc.)
 * @param {string} gatilho - Gatilho psicológico a usar
 * @returns {Promise<string>} Legenda gerada
 */
async function generateCaption(tipo = "SMASH", gatilho = null) {
  const tipoDescricao = POST_TYPES[tipo] || POST_TYPES.SMASH;
  const gatilhoEscolhido = gatilho || GATILHOS[Math.floor(Math.random() * GATILHOS.length)];

  const prompt = `Você é um copywriter especialista em marketing para hamburguerias artesanais brasileiras.

Crie uma legenda para o Instagram da hamburgueria "${BUSINESS_NAME}" com as seguintes características:

PRODUTO: ${tipoDescricao}
GATILHO PSICOLÓGICO: ${gatilhoEscolhido}

REGRAS OBRIGATÓRIAS:
1. Comece com 1 frase curta e impactante que desperte fome (máx 10 palavras)
2. Use emojis estrategicamente (🍔🔥😍🤤) - no máximo 8 emojis no total
3. Descreva o produto de forma sensorial (cheiro, textura, sabor)
4. Inclua o gatilho psicológico de forma natural
5. CTA FORTE no final apontando para o link de pedido
6. Tom: casual, jovem, apetitoso, urgente
7. Máximo 150 palavras
8. NÃO mencione WhatsApp - apenas o link direto de pedido
9. Termine SEMPRE com esta estrutura:

Peça agora direto no site 👇
${ORDER_LINK}

Retorne APENAS a legenda, sem explicações.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.85,
    });

    const caption = response.choices[0].message.content.trim();

    // Salva a legenda gerada
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(__dirname, `../generated/captions/caption_${tipo}_${timestamp}.txt`);
    fs.writeFileSync(outputPath, caption, "utf-8");

    console.log("\n✅ Legenda gerada com sucesso!\n");
    console.log("─".repeat(50));
    console.log(caption);
    console.log("─".repeat(50));
    console.log(`\n📁 Salva em: ${outputPath}\n`);

    return caption;
  } catch (error) {
    console.error("❌ Erro ao gerar legenda:", error.message);
    throw error;
  }
}

/**
 * Gera múltiplas legendas de uma vez para estoque
 * @param {number} quantidade - Quantidade de legendas a gerar
 * @returns {Promise<string[]>} Array de legendas geradas
 */
async function generateBatchCaptions(quantidade = 5) {
  const tipos = Object.keys(POST_TYPES);
  const legendas = [];

  console.log(`\n🚀 Gerando ${quantidade} legendas em lote...\n`);

  for (let i = 0; i < quantidade; i++) {
    const tipo = tipos[i % tipos.length];
    const gatilho = GATILHOS[i % GATILHOS.length];

    console.log(`[${i + 1}/${quantidade}] Gerando legenda tipo: ${tipo}...`);
    const caption = await generateCaption(tipo, gatilho);
    legendas.push({ tipo, caption });

    // Aguarda 1s entre chamadas para não sobrecarregar a API
    if (i < quantidade - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ ${quantidade} legendas geradas com sucesso!\n`);
  return legendas;
}

// Execução direta
if (require.main === module) {
  const tipo = process.argv[2] || "SMASH";
  const lote = process.argv[3] === "--lote";

  if (lote) {
    generateBatchCaptions(6).catch(console.error);
  } else {
    generateCaption(tipo).catch(console.error);
  }
}

module.exports = { generateCaption, generateBatchCaptions, POST_TYPES };
