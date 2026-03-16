require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarPost } = require("../scripts/postInstagram");
const { generatePromotion, getPromocaoDoDia, PROMOCOES } = require("../scripts/generatePromotion");
const { generateCaption } = require("../scripts/generateCaption");
const { generateRotatingHashtags } = require("../scripts/generateHashtags");

// ──────────────────────────────────────────────
// CONFIGURAÇÃO DA ESTRATÉGIA SEMANAL
// ──────────────────────────────────────────────
// Para cada dia: tipo de conteúdo, horário, tipo de legenda
// Substitua imageUrl com URLs públicas das suas fotos

const ESTRATEGIA_SEMANAL = {
  // Segunda-feira 18h → burger clássico
  segunda: {
    cron: "0 18 * * 1",
    descricao: "Segunda 18h - Burger Clássico",
    tipoCaptions: "SMASH",
    tipoPromo: null,
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_SEGUNDA || null,
  },

  // Quarta-feira 18h → batata ou combo
  quarta: {
    cron: "0 18 * * 3",
    descricao: "Quarta 18h - Batata ou Combo",
    tipoCaptions: "COMBO",
    tipoPromo: null,
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_QUARTA || null,
  },

  // Quinta-feira 18h → promoção Quinta do Hambúrguer
  quinta: {
    cron: "0 18 * * 4",
    descricao: "Quinta 18h - Promoção Quinta do Hambúrguer",
    tipoCaptions: "PROMOCAO",
    tipoPromo: "QUINTA_BURGER",
    tipoHashtag: "promo",
    imageUrl: process.env.IMG_QUINTA || null,
  },

  // Sexta-feira 19h → smash burger
  sexta: {
    cron: "0 19 * * 5",
    descricao: "Sexta 19h - Smash Burger",
    tipoCaptions: "SMASH",
    tipoPromo: null,
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_SEXTA || null,
  },

  // Domingo 17h → combo família
  domingo: {
    cron: "0 17 * * 0",
    descricao: "Domingo 17h - Combo Família",
    tipoCaptions: "FAMILIA",
    tipoPromo: "COMBO_FAMILIA",
    tipoHashtag: "promo",
    imageUrl: process.env.IMG_DOMINGO || null,
  },
};

// ──────────────────────────────────────────────
// FUNÇÃO DE PUBLICAÇÃO AGENDADA
// ──────────────────────────────────────────────

async function executarPostAgendado(config) {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  console.log(`\n⏰ [${agora}] Executando: ${config.descricao}`);

  try {
    let legenda;
    let hashtags = generateRotatingHashtags(config.tipoHashtag);

    if (config.tipoPromo) {
      // Post de promoção
      const promo = await generatePromotion(config.tipoPromo);
      legenda = promo.legenda + "\n\n" + hashtags;
    } else {
      // Post de produto normal
      const legendaGerada = await generateCaption(config.tipoCaptions);
      legenda = legendaGerada + "\n\n" + hashtags;
    }

    if (!config.imageUrl) {
      console.warn(`⚠️ imageUrl não configurada para ${config.descricao}. Adicione no .env!`);
      console.log("📝 Legenda que seria publicada:");
      console.log(legenda);
      return;
    }

    await publicarPost({
      imageUrl: config.imageUrl,
      legendaCustom: legenda,
      incluirHashtags: false, // já incluídas na legenda acima
      comentarLink: true,
    });

    console.log(`✅ Post agendado publicado: ${config.descricao}`);
  } catch (error) {
    console.error(`❌ Erro no post agendado [${config.descricao}]:`, error.message);
  }
}

// ──────────────────────────────────────────────
// REGISTRAR TODOS OS AGENDAMENTOS
// ──────────────────────────────────────────────

function iniciarAgendador() {
  console.log("\n" + "═".repeat(55));
  console.log("🍔 BRUTHUS BURGER - AGENDADOR DE POSTS INSTAGRAM");
  console.log("═".repeat(55));
  console.log(`📅 Iniciado em: ${new Date().toLocaleString("pt-BR")}`);
  console.log("\n📋 Agendamentos ativos:\n");

  Object.entries(ESTRATEGIA_SEMANAL).forEach(([dia, config]) => {
    const tarefaValida = cron.validate(config.cron);

    if (!tarefaValida) {
      console.error(`❌ Cron inválido para ${dia}: ${config.cron}`);
      return;
    }

    cron.schedule(
      config.cron,
      () => executarPostAgendado(config),
      {
        timezone: "America/Fortaleza", // Fuso horário de Fortaleza/CE
      }
    );

    console.log(`  ✅ ${config.descricao}`);
    console.log(`     Cron: ${config.cron}`);
    console.log(`     Conteúdo: ${config.tipoPromo || config.tipoCaptions}\n`);
  });

  // Agendamento extra: Relatório semanal toda segunda às 9h
  cron.schedule(
    "0 9 * * 1",
    async () => {
      console.log("\n📊 Gerando relatório semanal...");
      try {
        const { relatorioPerformance } = require("../scripts/createAds");
        await relatorioPerformance(7);
      } catch (error) {
        console.error("❌ Erro no relatório:", error.message);
      }
    },
    { timezone: "America/Fortaleza" }
  );
  console.log("  📊 Relatório semanal: Segunda 9h\n");

  console.log("═".repeat(55));
  console.log("🚀 Agendador rodando! Pressione Ctrl+C para parar.\n");
}

// ──────────────────────────────────────────────
// TESTAR AGENDADOR (postar agora)
// ──────────────────────────────────────────────

async function testarAgora(dia = "quinta") {
  const config = ESTRATEGIA_SEMANAL[dia];
  if (!config) {
    console.error(`❌ Dia "${dia}" não encontrado. Opções: ${Object.keys(ESTRATEGIA_SEMANAL).join(", ")}`);
    return;
  }
  console.log(`\n🧪 TESTANDO agendamento de: ${config.descricao}`);
  await executarPostAgendado(config);
}

// Execução direta
if (require.main === module) {
  const comando = process.argv[2];

  if (comando === "testar") {
    const dia = process.argv[3] || "quinta";
    testarAgora(dia).then(() => process.exit(0)).catch(console.error);
  } else {
    iniciarAgendador();
  }
}

module.exports = { iniciarAgendador, testarAgora, ESTRATEGIA_SEMANAL };
