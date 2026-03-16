require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";

// Formatos de reels disponíveis
const REELS_FORMATS = {
  MAKING_OF: "making of do burger sendo montado passo a passo",
  CLOSE_UP: "close ups sensuais de ingredientes e burger pronto",
  MORDIDA: "reação e mordida no burger suculento",
  PROMO: "anúncio de promoção irresistível do dia",
  BASTIDORES: "bastidores da cozinha, preparo artesanal",
  UNBOXING: "unboxing do pedido chegando em casa",
};

/**
 * Gera roteiro completo de Reels para Instagram
 * @param {string} formato - Formato do reels
 * @param {number} duracaoSegundos - Duração alvo do reels (15, 30 ou 60s)
 * @returns {Promise<object>} Roteiro completo
 */
async function generateReelsScript(formato = "CLOSE_UP", duracaoSegundos = 30) {
  const formatoDescricao = REELS_FORMATS[formato] || REELS_FORMATS.CLOSE_UP;
  const numeroCenas = duracaoSegundos <= 15 ? 4 : duracaoSegundos <= 30 ? 7 : 12;

  const prompt = `Você é diretor criativo de vídeos virais para hamburguerias no Instagram.

Crie um roteiro COMPLETO de Reels para "${BUSINESS_NAME}":

FORMATO: ${formatoDescricao}
DURAÇÃO ALVO: ${duracaoSegundos} segundos
NÚMERO DE CENAS: ${numeroCenas}
OBJETIVO: Levar o espectador a clicar no link de pedido

ESTRUTURA OBRIGATÓRIA DO ROTEIRO:

1. HOOK (primeiros 3 segundos) - cena que prende a atenção imediatamente
2. DESENVOLVIMENTO - cenas que geram desejo
3. CTA FINAL - chamada clara para o link de pedido

Para cada cena informe:
- Número e duração em segundos
- Descrição do que filmar (ângulo, iluminação, movimento)
- Texto/legenda na tela (se houver)
- Música/som sugerido

TEXTO DA LEGENDA FINAL DO REELS para a bio:
Deve terminar com: "${ORDER_LINK}"

Formate a resposta como JSON com esta estrutura:
{
  "titulo": "título criativo do reels",
  "formato": "${formato}",
  "duracao": ${duracaoSegundos},
  "hook": "frase do hook em texto na tela",
  "cenas": [
    {
      "numero": 1,
      "duracao": 3,
      "filmagem": "descrição do que filmar",
      "texto_tela": "texto que aparece na tela",
      "som": "sugestão de som/música"
    }
  ],
  "texto_tela_final": "texto CTA final na tela",
  "legenda_post": "legenda completa do post",
  "musica_sugerida": "estilo ou nome de música trending",
  "dicas_edicao": ["dica 1", "dica 2"],
  "hashtags": ["tag1", "tag2"]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.9,
    });

    let roteiro;
    const content = response.choices[0].message.content.trim();

    try {
      // Extrai JSON da resposta
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      roteiro = jsonMatch ? JSON.parse(jsonMatch[0]) : { roteiro_raw: content };
    } catch {
      roteiro = { roteiro_raw: content };
    }

    // Garante que a legenda termina com o link de pedido
    if (roteiro.legenda_post && !roteiro.legenda_post.includes(ORDER_LINK)) {
      roteiro.legenda_post += `\n\nPeça agora 👇\n${ORDER_LINK}`;
    }

    // Salva o roteiro
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(
      __dirname,
      `../generated/captions/reels_${formato}_${duracaoSegundos}s_${timestamp}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(roteiro, null, 2), "utf-8");

    console.log("\n✅ Roteiro de Reels gerado!\n");
    console.log("═".repeat(50));
    printRoteiro(roteiro);
    console.log("═".repeat(50));
    console.log(`\n📁 Salvo em: ${outputPath}\n`);

    return roteiro;
  } catch (error) {
    console.error("❌ Erro ao gerar roteiro:", error.message);
    throw error;
  }
}

/**
 * Imprime o roteiro de forma legível no console
 */
function printRoteiro(roteiro) {
  if (roteiro.roteiro_raw) {
    console.log(roteiro.roteiro_raw);
    return;
  }

  console.log(`\n🎬 TÍTULO: ${roteiro.titulo}`);
  console.log(`⏱️  DURAÇÃO: ${roteiro.duracao}s`);
  console.log(`🪝 HOOK: "${roteiro.hook}"\n`);
  console.log("📹 CENAS:");

  if (roteiro.cenas) {
    roteiro.cenas.forEach((cena) => {
      console.log(`\n  [Cena ${cena.numero} - ${cena.duracao}s]`);
      console.log(`  📷 ${cena.filmagem}`);
      if (cena.texto_tela) console.log(`  📝 Texto: "${cena.texto_tela}"`);
      if (cena.som) console.log(`  🎵 Som: ${cena.som}`);
    });
  }

  if (roteiro.texto_tela_final) {
    console.log(`\n🎯 CTA FINAL: "${roteiro.texto_tela_final}"`);
  }

  if (roteiro.musica_sugerida) {
    console.log(`\n🎵 MÚSICA: ${roteiro.musica_sugerida}`);
  }

  if (roteiro.dicas_edicao) {
    console.log("\n💡 DICAS DE EDIÇÃO:");
    roteiro.dicas_edicao.forEach((dica) => console.log(`  • ${dica}`));
  }

  if (roteiro.legenda_post) {
    console.log("\n📋 LEGENDA DO POST:");
    console.log(roteiro.legenda_post);
  }
}

/**
 * Gera pacote completo de conteúdo: roteiros para a semana
 */
async function generateWeeklyReels() {
  const formatos = [
    { formato: "MAKING_OF", duracao: 30 },
    { formato: "CLOSE_UP", duracao: 15 },
    { formato: "PROMO", duracao: 30 },
    { formato: "MORDIDA", duracao: 15 },
  ];

  console.log("\n🚀 Gerando roteiros da semana...\n");
  const roteiros = [];

  for (const { formato, duracao } of formatos) {
    console.log(`Gerando roteiro: ${formato} (${duracao}s)...`);
    const roteiro = await generateReelsScript(formato, duracao);
    roteiros.push(roteiro);
    await new Promise((r) => setTimeout(r, 1500));
  }

  return roteiros;
}

// Execução direta
if (require.main === module) {
  const formato = process.argv[2] || "CLOSE_UP";
  const duracao = parseInt(process.argv[3]) || 30;
  const semana = process.argv[4] === "--semana";

  if (semana) {
    generateWeeklyReels().catch(console.error);
  } else {
    generateReelsScript(formato, duracao).catch(console.error);
  }
}

module.exports = { generateReelsScript, generateWeeklyReels, REELS_FORMATS };
