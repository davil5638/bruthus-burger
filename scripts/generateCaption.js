require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";
const CUPOM_SEXTA = "SEXTAOFF10";

// ──────────────────────────────────────────────
// Bruthus abre: Quinta, Sexta, Sábado e Domingo
// ──────────────────────────────────────────────

const POST_TYPES = {
  SMASH:        "smash burger artesanal suculento com carne prensada na chapa",
  COMBO:        "combo completo com burger, batata crocante e refrigerante gelado",
  PROMOCAO:     "promoção especial de hoje, imperdível e por tempo limitado",
  FAMILIA:      "combo família para reunir todo mundo em volta da mesa",
  BATATA:       "batata frita artesanal crocante por fora e macia por dentro",
  SOBREMESA:    "sobremesa irresistível para adoçar o fim da refeição",
  SEXTA_CUPOM:  "smash burger com cupom de 10% OFF exclusivo de hoje",
  DOMINGO:      "domingo perfeito com burger artesanal para relaxar e aproveitar",
};

// Contexto de funcionamento — injetado no prompt para a IA não errar o dia
const CONTEXTO_FUNCIONAMENTO = `
IMPORTANTE: A ${BUSINESS_NAME} funciona APENAS de Quinta a Domingo.
- Quinta-feira: promoção "Quinta do Hambúrguer" com preço especial
- Sexta-feira: cupom de 10% OFF (código: ${CUPOM_SEXTA}) liberado no link de pedido
- Sábado: sem promoção fixa (exceto eventos especiais do mês)
- Domingo: dia de reunir família/casal, posts mais aconchegantes
`.trim();

const GATILHOS = [
  "escassez - poucas unidades disponíveis hoje",
  "urgência - só disponível hoje (qui a dom)",
  "fome - descrição sensorial: cheiro, textura, sabor",
  "social proof - o mais pedido da semana",
  "novidade - lançamento exclusivo",
  "exclusividade - edição de fim de semana",
];

// ──────────────────────────────────────────────
// GERAR LEGENDA
// ──────────────────────────────────────────────

async function generateCaption(tipo = "SMASH", gatilho = null) {
  const tipoDescricao = POST_TYPES[tipo] || POST_TYPES.SMASH;
  const gatilhoEscolhido = gatilho || GATILHOS[Math.floor(Math.random() * GATILHOS.length)];
  const isSexta = tipo === "SEXTA_CUPOM";

  const cupomInstrucao = isSexta
    ? `\nCUPOM DO DIA: "${CUPOM_SEXTA}" — mencione de forma animada que hoje tem 10% OFF com esse cupom no link!`
    : "";

  const prompt = `Você é copywriter especialista em marketing para hamburguerias artesanais brasileiras.

${CONTEXTO_FUNCIONAMENTO}

Crie uma legenda para o Instagram da "${BUSINESS_NAME}":

PRODUTO/TEMA: ${tipoDescricao}
GATILHO PSICOLÓGICO: ${gatilhoEscolhido}${cupomInstrucao}

REGRAS OBRIGATÓRIAS:
1. Comece com 1 frase curta e impactante que desperte fome (máx 10 palavras)
2. Use emojis estrategicamente (🍔🔥😍🤤) — no máximo 8 emojis no total
3. Descreva o produto de forma sensorial (cheiro, textura, sabor)
4. Aplique o gatilho psicológico de forma natural
5. CTA FORTE no final apontando APENAS para o link de pedido
6. Tom: casual, jovem, apetitoso, urgente
7. Máximo 150 palavras
8. NUNCA mencione WhatsApp — o pedido é 100% pelo site
9. Termine SEMPRE com:

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

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(__dirname, `../generated/captions/caption_${tipo}_${timestamp}.txt`);
    fs.writeFileSync(outputPath, caption, "utf-8");

    console.log("\n✅ Legenda gerada!\n");
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

// ──────────────────────────────────────────────
// GERAR EM LOTE
// ──────────────────────────────────────────────

async function generateBatchCaptions(quantidade = 5) {
  // Apenas tipos relevantes para Qui–Dom
  const tipos = ["SMASH", "COMBO", "SEXTA_CUPOM", "FAMILIA", "BATATA", "DOMINGO"];
  const legendas = [];

  console.log(`\n🚀 Gerando ${quantidade} legendas em lote...\n`);

  for (let i = 0; i < quantidade; i++) {
    const tipo = tipos[i % tipos.length];
    const gatilho = GATILHOS[i % GATILHOS.length];
    console.log(`[${i + 1}/${quantidade}] Tipo: ${tipo}...`);
    const caption = await generateCaption(tipo, gatilho);
    legendas.push({ tipo, caption });
    if (i < quantidade - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ ${quantidade} legendas geradas!\n`);
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

module.exports = { generateCaption, generateBatchCaptions, POST_TYPES, CUPOM_SEXTA };
