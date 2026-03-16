require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";

// Promoções fixas da hamburgueria
const PROMOCOES = {
  QUINTA_BURGER: {
    nome: "Quinta do Hambúrguer",
    descricao: "2 Smash Burgers + Batata + 2 Refrigerantes",
    preco: "R$47,99",
    emoji: "🍔",
    dia: "quinta-feira",
  },
  COMBO_CASAL: {
    nome: "Combo Casal",
    descricao: "2 Burgers + 2 Batatas + 2 Bebidas",
    preco: "R$59,99",
    emoji: "❤️",
    dia: null,
  },
  SMASH_DIA: {
    nome: "Smash do Dia",
    descricao: "Smash duplo + Batata média",
    preco: "R$32,99",
    emoji: "🔥",
    dia: null,
  },
  COMBO_FAMILIA: {
    nome: "Combo Família",
    descricao: "4 Burgers + 2 Batatas grandes + 4 Refrigerantes",
    preco: "R$99,99",
    emoji: "👨‍👩‍👧‍👦",
    dia: "domingo",
  },
  SEXTA_SMASH: {
    nome: "Sexta do Smash",
    descricao: "Smash artesanal + Batata + Bebida",
    preco: "R$38,99",
    emoji: "🍟",
    dia: "sexta-feira",
  },
  SEGUNDA_ESPECIAL: {
    nome: "Segunda Especial",
    descricao: "Burger clássico + Batata",
    preco: "R$28,99",
    emoji: "⚡",
    dia: "segunda-feira",
  },
};

/**
 * Gera post de promoção com legenda e artes de texto formatados
 * @param {string} tipoPromocao - Chave da promoção (QUINTA_BURGER, COMBO_CASAL, etc.)
 * @returns {Promise<object>} Post completo da promoção
 */
async function generatePromotion(tipoPromocao = "QUINTA_BURGER") {
  const promo = PROMOCOES[tipoPromocao];

  if (!promo) {
    throw new Error(`Promoção "${tipoPromocao}" não encontrada. Opções: ${Object.keys(PROMOCOES).join(", ")}`);
  }

  // Gera o texto artístico da promoção (para usar no Story/Post)
  const textoArtistico = formatarTextoPromocao(promo);

  // Gera a legenda com IA
  const prompt = `Você é copywriter especialista em hamburguerias brasileiras.

Crie uma legenda URGENTE para o Instagram da "${BUSINESS_NAME}" para a promoção:

PROMOÇÃO: ${promo.nome}
ITENS: ${promo.descricao}
PREÇO: ${promo.preco}
EMOJI DA PROMO: ${promo.emoji}

REGRAS:
1. Primeira linha: título impactante da promoção em MAIÚSCULAS
2. Liste os itens do combo com emojis
3. Destaque o preço de forma chamativa
4. Use gatilho de escassez ou urgência
5. CTA direto para o link de pedido - SEM mencionar WhatsApp
6. Máx 120 palavras
7. Termine com:

${promo.emoji} Peça agora: ${ORDER_LINK}

Retorne APENAS a legenda.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 250,
      temperature: 0.8,
    });

    const legenda = response.choices[0].message.content.trim();

    const resultado = {
      promocao: promo,
      textoArtistico,
      legenda,
      comentarioFixado: `${promo.emoji} ${promo.nome} por apenas ${promo.preco}! Peça aqui 👇\n${ORDER_LINK}`,
    };

    // Salva o resultado
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(
      __dirname,
      `../generated/promotions/promo_${tipoPromocao}_${timestamp}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2), "utf-8");

    console.log("\n✅ Promoção gerada!\n");
    console.log("═".repeat(50));
    console.log(textoArtistico);
    console.log("═".repeat(50));
    console.log("\n📝 LEGENDA:\n");
    console.log(legenda);
    console.log("\n📌 COMENTÁRIO FIXADO:\n");
    console.log(resultado.comentarioFixado);
    console.log("\n" + "═".repeat(50));
    console.log(`\n📁 Salvo em: ${outputPath}\n`);

    return resultado;
  } catch (error) {
    console.error("❌ Erro ao gerar promoção:", error.message);
    throw error;
  }
}

/**
 * Formata o texto artístico da promoção para usar em posts/stories
 */
function formatarTextoPromocao(promo) {
  return `
${promo.emoji} ${promo.nome.toUpperCase()} ${promo.emoji}

${promo.descricao}

POR APENAS
${promo.preco}

Peça agora ${promo.emoji}
${ORDER_LINK}
`.trim();
}

/**
 * Retorna a promoção do dia baseada no dia da semana
 */
function getPromocaoDoDia() {
  const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const hoje = diasSemana[new Date().getDay()];

  const promosDia = Object.entries(PROMOCOES).filter(([, promo]) => promo.dia === hoje);

  if (promosDia.length > 0) {
    return promosDia[0][0];
  }

  // Promoção padrão se não houver do dia
  return "SMASH_DIA";
}

/**
 * Gera todas as promoções da semana
 */
async function generateWeeklyPromotions() {
  const promosParaGerar = ["SEGUNDA_ESPECIAL", "QUINTA_BURGER", "SEXTA_SMASH", "COMBO_FAMILIA", "COMBO_CASAL", "SMASH_DIA"];
  const resultados = [];

  console.log("\n🚀 Gerando promoções da semana...\n");

  for (const tipoPromo of promosParaGerar) {
    console.log(`Gerando: ${PROMOCOES[tipoPromo].nome}...`);
    const resultado = await generatePromotion(tipoPromo);
    resultados.push(resultado);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n✅ Todas as promoções da semana geradas!\n");
  return resultados;
}

// Execução direta
if (require.main === module) {
  const tipo = process.argv[2] || getPromocaoDoDia();
  const semana = process.argv[3] === "--semana";

  if (semana) {
    generateWeeklyPromotions().catch(console.error);
  } else {
    console.log(`Gerando promoção: ${tipo}`);
    generatePromotion(tipo).catch(console.error);
  }
}

module.exports = { generatePromotion, generateWeeklyPromotions, getPromocaoDoDia, PROMOCOES };
