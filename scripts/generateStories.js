require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";
const CUPOM_SEXTA = "SEXTAOFF10";

// ──────────────────────────────────────────────
// TIPOS DE STORY — Bruthus abre Qui a Dom
// ──────────────────────────────────────────────
const STORY_TYPES = {
  ABERTURA: {
    label: "🚪 Abertura do Dia",
    desc: "Avisa que abriu hoje e qual o horário",
    cor: "#f97316",
    corTexto: "#ffffff",
    stickers: ["📍 Localização", "⏰ Horário", "🔥 Enquete"],
  },
  QUINTA_BURGER: {
    label: "🍔 Quinta do Hambúrguer",
    desc: "Destaca a promoção fixa de quinta",
    cor: "#92400e",
    corTexto: "#fde68a",
    stickers: ["🔥 Contagem regressiva", "🍔 Produto", "📲 Link"],
  },
  CUPOM_SEXTA: {
    label: "🔥 Cupom da Sexta",
    desc: `Divulga o cupom ${CUPOM_SEXTA} — 10% OFF`,
    cor: "#dc2626",
    corTexto: "#ffffff",
    stickers: ["🏷️ Sticker de cupom", "⏰ Só hoje", "📲 Link"],
  },
  SABADO_PROMO: {
    label: "🎉 Promoção de Sábado",
    desc: "Divulga a promo rotativa do sábado",
    cor: "#7c3aed",
    corTexto: "#ffffff",
    stickers: ["🎉 Balão", "⏰ Só hoje", "📲 Link"],
  },
  PRODUTO: {
    label: "🍔 Close do Produto",
    desc: "Mostra o burger de forma apetitosa",
    cor: "#1c1917",
    corTexto: "#f97316",
    stickers: ["🤤 Enquete: você toparia?", "⭐ Avaliação", "📲 Link"],
  },
  ENQUETE: {
    label: "📊 Enquete Interativa",
    desc: "Engaja com pergunta sobre o cardápio",
    cor: "#0f172a",
    corTexto: "#f97316",
    stickers: ["📊 Enquete", "❓ Pergunta", "💬 Resposta rápida"],
  },
  BASTIDORES: {
    label: "🍳 Bastidores da Cozinha",
    desc: "Mostra o preparo artesanal",
    cor: "#1c1917",
    corTexto: "#ffffff",
    stickers: ["🔥 GIF fogo", "👨‍🍳 Localização", "❤️ Curtir"],
  },
  CTA_PEDIDO: {
    label: "📲 CTA Direto para Pedido",
    desc: "Story com único objetivo: levar ao link",
    cor: "#f97316",
    corTexto: "#ffffff",
    stickers: ["📲 Link do pedido", "👆 Arrasta pra cima", "🛒 Comprar"],
  },
};

// ──────────────────────────────────────────────
// GERAR CONTEÚDO DO STORY
// ──────────────────────────────────────────────
async function generateStory(tipo = "PRODUTO", diaFuncionamento = "quinta") {
  const story = STORY_TYPES[tipo];
  if (!story) throw new Error(`Tipo "${tipo}" inválido. Opções: ${Object.keys(STORY_TYPES).join(", ")}`);

  const cupomInfo = tipo === "CUPOM_SEXTA"
    ? `O cupom é "${CUPOM_SEXTA}" — 10% de desconto. Mencione com destaque total.`
    : "";

  const prompt = `Você é especialista em criar conteúdo viral para Instagram Stories de hamburguerias brasileiras.

Crie o conteúdo completo de um Story para "${BUSINESS_NAME}":

TIPO: ${story.label}
OBJETIVO: ${story.desc}
DIA: ${diaFuncionamento}
${cupomInfo}

REGRAS DE STORIES (diferente do feed!):
1. Texto PRINCIPAL: máx 6 palavras — impactante, grande na tela
2. Texto SECUNDÁRIO: máx 15 palavras — complemento rápido
3. CTA do link: sempre "${ORDER_LINK}"
4. Tom: urgente, animado, direto — sem enrolação
5. Emojis: máx 3 no total

Retorne um JSON com esta estrutura exata:
{
  "texto_principal": "máx 6 palavras impactantes",
  "texto_secundario": "frase curta complementar",
  "cta": "texto do botão de link (ex: Peça agora 🍔)",
  "enquete": "pergunta curta para sticker de enquete (ou null se não aplicável)",
  "opcao_sim": "opção positiva da enquete (ou null)",
  "opcao_nao": "opção negativa da enquete (ou null)",
  "sugestao_musica": "estilo de música trending para o story",
  "dica_visual": "dica curta de como montar visualmente o story"
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.9,
    });

    const content = response.choices[0].message.content.trim();
    let storyData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      storyData = jsonMatch ? JSON.parse(jsonMatch[0]) : { texto_principal: content };
    } catch {
      storyData = { texto_principal: content };
    }

    const resultado = {
      tipo,
      config: story,
      conteudo: storyData,
      link: ORDER_LINK,
      geradoEm: new Date().toISOString(),
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(__dirname, `../generated/captions/story_${tipo}_${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

    console.log("\n✅ Story gerado!\n");
    console.log(`📱 TEXTO PRINCIPAL: "${storyData.texto_principal}"`);
    console.log(`📝 SECUNDÁRIO: "${storyData.texto_secundario}"`);
    console.log(`🔗 CTA: "${storyData.cta}"`);
    if (storyData.enquete) console.log(`📊 ENQUETE: "${storyData.enquete}" | ${storyData.opcao_sim} / ${storyData.opcao_nao}`);
    console.log(`🎵 MÚSICA: ${storyData.sugestao_musica}`);
    console.log(`💡 VISUAL: ${storyData.dica_visual}`);

    return resultado;
  } catch (error) {
    console.error("❌ Erro ao gerar story:", error.message);
    throw error;
  }
}

if (require.main === module) {
  const tipo = process.argv[2] || "PRODUTO";
  const dia  = process.argv[3] || "quinta";
  generateStory(tipo, dia).catch(console.error);
}

module.exports = { generateStory, STORY_TYPES };
