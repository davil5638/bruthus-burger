require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";
const CUPOM_SEXTA = "SEXTAOFF10";

// ──────────────────────────────────────────────
// PROMOÇÕES — Bruthus abre Quinta a Domingo
// ──────────────────────────────────────────────
const PROMOCOES = {
  // ── QUINTA ──────────────────────────────────
  QUINTA_BURGER: {
    nome: "Quinta do Hambúrguer",
    descricao: "2 Smash Burgers + Batata + 2 Refrigerantes",
    preco: "R$47,99",
    emoji: "🍔",
    dia: "quinta-feira",
    destaque: "Preço promocional toda quinta!",
    cupom: null,
  },

  // ── SEXTA ────────────────────────────────────
  SEXTA_CUPOM: {
    nome: "Sexta com Desconto",
    descricao: "Qualquer combo com 10% OFF usando o cupom",
    preco: "10% de desconto",
    emoji: "🔥",
    dia: "sexta-feira",
    destaque: `Use o cupom ${CUPOM_SEXTA} no link e pague menos hoje!`,
    cupom: CUPOM_SEXTA,
  },

  // ── SÁBADO (2x por mês — rotativo) ──────────
  SABADO_BATATA_GRATIS: {
    nome: "Sábado da Batata Grátis",
    descricao: "Qualquer burger + Batata GRÁTIS",
    preco: "Batata grátis no combo!",
    emoji: "🍟",
    dia: "sábado",
    destaque: "Só hoje: peça qualquer burger e ganhe a batata!",
    cupom: null,
  },
  SABADO_SMASH_PROMO: {
    nome: "Sábado do Smash Promocional",
    descricao: "Smash artesanal por preço especial",
    preco: "Preço surpresa no site!",
    emoji: "💥",
    dia: "sábado",
    destaque: "Smash com preço de sábado — corre antes de acabar!",
    cupom: null,
  },
  SABADO_REFRI_GRATIS: {
    nome: "Sábado do Refri Grátis",
    descricao: "Qualquer burger + Refrigerante GRÁTIS",
    preco: "Refri grátis no combo!",
    emoji: "🥤",
    dia: "sábado",
    destaque: "Sábado gelado: refri por conta da casa!",
    cupom: null,
  },

  // ── DOMINGO ──────────────────────────────────
  DOMINGO_FAMILIA: {
    nome: "Domingo em Família",
    descricao: "4 Burgers + 2 Batatas grandes + 4 Refrigerantes",
    preco: "R$99,99",
    emoji: "👨‍👩‍👧‍👦",
    dia: "domingo",
    destaque: "Domingo é dia de reunir a família!",
    cupom: null,
  },
  DOMINGO_CASAL: {
    nome: "Combo Casal de Domingo",
    descricao: "2 Burgers + 2 Batatas + 2 Bebidas",
    preco: "R$59,99",
    emoji: "❤️",
    dia: "domingo",
    destaque: "Domingo perfeito pra dois!",
    cupom: null,
  },
};

// ──────────────────────────────────────────────
// GERAR PROMOÇÃO
// ──────────────────────────────────────────────

async function generatePromotion(tipoPromocao = "QUINTA_BURGER") {
  const promo = PROMOCOES[tipoPromocao];

  if (!promo) {
    throw new Error(
      `Promoção "${tipoPromocao}" não encontrada. Opções: ${Object.keys(PROMOCOES).join(", ")}`
    );
  }

  const textoArtistico = formatarTextoPromocao(promo);

  const cupomInfo = promo.cupom
    ? `\nCUPOM DE DESCONTO: Use "${promo.cupom}" no link para 10% OFF — mencione isso na legenda de forma animada!`
    : "";

  const prompt = `Você é copywriter especialista em hamburguerias brasileiras.

Crie uma legenda URGENTE para o Instagram da "${BUSINESS_NAME}" para a promoção:

PROMOÇÃO: ${promo.nome}
ITENS: ${promo.descricao}
PREÇO/BENEFÍCIO: ${promo.preco}
DESTAQUE: ${promo.destaque}
DIA DA SEMANA: ${promo.dia}${cupomInfo}

REGRAS:
1. Primeira linha: título impactante em MAIÚSCULAS (máx 8 palavras)
2. Liste os itens com emojis
3. Destaque o benefício/preço de forma animada
4. Use gatilho de urgência — só disponível hoje!
5. Jamais mencione WhatsApp — o pedido é SOMENTE pelo link
6. Máx 130 palavras
7. Termine com:

${promo.emoji} Peça agora no site 👇
${ORDER_LINK}

Retorne APENAS a legenda.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 280,
      temperature: 0.85,
    });

    const legenda = response.choices[0].message.content.trim();

    const comentarioFixado = promo.cupom
      ? `${promo.emoji} Use o cupom ${promo.cupom} e ganhe 10% OFF! 👇\n${ORDER_LINK}`
      : `${promo.emoji} ${promo.nome}! Peça aqui 👇\n${ORDER_LINK}`;

    const resultado = { promocao: promo, textoArtistico, legenda, comentarioFixado };

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
    console.log(comentarioFixado);
    console.log(`\n📁 Salvo em: ${outputPath}\n`);

    return resultado;
  } catch (error) {
    console.error("❌ Erro ao gerar promoção:", error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────
// TEXTO ARTÍSTICO
// ──────────────────────────────────────────────

function formatarTextoPromocao(promo) {
  const linhaExtra = promo.cupom ? `\n🏷️ CUPOM: ${promo.cupom}\n` : "";
  return `
${promo.emoji} ${promo.nome.toUpperCase()} ${promo.emoji}

${promo.descricao}

${promo.preco}
${linhaExtra}
Peça agora ${promo.emoji}
${ORDER_LINK}
`.trim();
}

// ──────────────────────────────────────────────
// PROMOÇÃO DO DIA (automático)
// ──────────────────────────────────────────────

function getPromocaoDoDia() {
  const diasSemana = [
    "domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado",
  ];
  const hoje = diasSemana[new Date().getDay()];

  // Quinta: sempre Quinta do Hambúrguer
  if (hoje === "quinta-feira") return "QUINTA_BURGER";

  // Sexta: cupom
  if (hoje === "sexta-feira") return "SEXTA_CUPOM";

  // Sábado: rotativo (1ª e 3ª semana do mês)
  if (hoje === "sábado") return getSabadoPromoTipo();

  // Domingo: alterna casal e família
  if (hoje === "domingo") {
    const semana = Math.ceil(new Date().getDate() / 7);
    return semana % 2 === 0 ? "DOMINGO_CASAL" : "DOMINGO_FAMILIA";
  }

  return "QUINTA_BURGER"; // fallback
}

/**
 * Retorna qual promoção de sábado usar com base na semana do mês
 * 1ª semana → batata grátis | 2ª → smash promo | 3ª → refri grátis | 4ª → batata grátis
 */
function getSabadoPromoTipo() {
  const semana = Math.ceil(new Date().getDate() / 7);
  const tipos = ["SABADO_BATATA_GRATIS", "SABADO_SMASH_PROMO", "SABADO_REFRI_GRATIS", "SABADO_BATATA_GRATIS"];
  return tipos[(semana - 1) % tipos.length];
}

/**
 * Verifica se o sábado atual é um dos 2 sábados promocionais do mês (1ª e 3ª semana)
 */
function isSabadoPromo() {
  const semana = Math.ceil(new Date().getDate() / 7);
  return semana === 1 || semana === 3;
}

// ──────────────────────────────────────────────
// GERAR SEMANA COMPLETA (Qui–Dom)
// ──────────────────────────────────────────────

async function generateWeeklyPromotions() {
  const promosParaGerar = [
    "QUINTA_BURGER",
    "SEXTA_CUPOM",
    "SABADO_BATATA_GRATIS",
    "SABADO_SMASH_PROMO",
    "SABADO_REFRI_GRATIS",
    "DOMINGO_FAMILIA",
    "DOMINGO_CASAL",
  ];
  const resultados = [];

  console.log("\n🚀 Gerando promoções da semana (Qui–Dom)...\n");

  for (const tipo of promosParaGerar) {
    console.log(`Gerando: ${PROMOCOES[tipo].nome}...`);
    const resultado = await generatePromotion(tipo);
    resultados.push(resultado);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n✅ Todas as promoções geradas!\n");
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

module.exports = {
  generatePromotion,
  generateWeeklyPromotions,
  getPromocaoDoDia,
  getSabadoPromoTipo,
  isSabadoPromo,
  PROMOCOES,
  CUPOM_SEXTA,
};
