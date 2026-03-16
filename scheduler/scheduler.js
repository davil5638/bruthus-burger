require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarPost } = require("../scripts/postInstagram");
const { generateCaption } = require("../scripts/generateCaption");
const { generateRotatingHashtags } = require("../scripts/generateHashtags");

// ──────────────────────────────────────────────
// Bruthus Burger — 1 post por semana, rotativo
//
// Semana 1 do mês → Quinta 18h
// Semana 2 do mês → Sexta 18h
// Semana 3 do mês → Sábado 18h
// Semana 4 do mês → Domingo 17h
// Promoções são feitas via Stories (não no post)
// Qui 09h → Relatório semanal automático
// ──────────────────────────────────────────────

// Retorna o número da semana no mês (1–4, semana 5+ vira semana 1)
function semanaDoMes(date = new Date()) {
  return ((Math.ceil(date.getDate() / 7) - 1) % 4) + 1;
}

// Qual dia da semana deve postar essa semana?
// semana 1 → 4 (qui), semana 2 → 5 (sex), semana 3 → 6 (sáb), semana 4 → 0 (dom)
const DIA_POR_SEMANA = { 1: 4, 2: 5, 3: 6, 4: 0 };

const ESTRATEGIA_SEMANAL = {
  quinta: {
    cron: "0 18 * * 4",
    diaSemana: 4,
    descricao: "Quinta 18h — Post semanal 🍔",
    tipoCaptions: "SMASH",
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_QUINTA || null,
  },
  sexta: {
    cron: "0 18 * * 5",
    diaSemana: 5,
    descricao: "Sexta 18h — Post semanal 🔥",
    tipoCaptions: "COMBO",
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_SEXTA || null,
  },
  sabado: {
    cron: "0 18 * * 6",
    diaSemana: 6,
    descricao: "Sábado 18h — Post semanal 🎉",
    tipoCaptions: "BATATA",
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_SABADO || null,
  },
  domingo: {
    cron: "0 17 * * 0",
    diaSemana: 0,
    descricao: "Domingo 17h — Post semanal ❤️",
    tipoCaptions: "DOMINGO",
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_DOMINGO || null,
  },
};

// ──────────────────────────────────────────────
// PUBLICAÇÃO AGENDADA GENÉRICA
// ──────────────────────────────────────────────

async function executarPostAgendado(config) {
  const now = new Date();
  const agora = now.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

  // Verifica se hoje é o dia certo da rotação semanal
  const semana = semanaDoMes(now);
  const diaEsperado = DIA_POR_SEMANA[semana];
  if (config.diaSemana !== diaEsperado) {
    console.log(`\n📅 [${agora}] Semana ${semana} → post programado para outro dia. Pulando ${config.descricao}.`);
    return;
  }

  console.log(`\n⏰ [${agora}] Executando: ${config.descricao} (semana ${semana} do mês)`);

  try {
    const hashtags = generateRotatingHashtags(config.tipoHashtag);
    const legendaGerada = await generateCaption(config.tipoCaptions);
    const legenda = legendaGerada + "\n\n" + hashtags;

    if (!config.imageUrl) {
      console.warn(`⚠️ imageUrl não configurada para ${config.descricao}`);
      console.log("📝 Legenda gerada (sem publicar):\n" + legenda);
      return;
    }

    await publicarPost({
      imageUrl: config.imageUrl,
      legendaCustom: legenda,
      incluirHashtags: false,
      comentarLink: true,
    });

    console.log(`✅ Publicado: ${config.descricao}`);
  } catch (error) {
    console.error(`❌ Erro [${config.descricao}]:`, error.message);
  }
}

// ──────────────────────────────────────────────
// INICIAR AGENDADOR
// ──────────────────────────────────────────────

function iniciarAgendador() {
  console.log("\n" + "═".repeat(55));
  console.log("🍔 BRUTHUS BURGER — AGENDADOR (1 post/semana)");
  console.log("═".repeat(55));
  console.log(`📅 Iniciado: ${new Date().toLocaleString("pt-BR")}`);
  console.log("\n📋 Rotação semanal:");
  console.log("  Semana 1 → Quinta 18h");
  console.log("  Semana 2 → Sexta 18h");
  console.log("  Semana 3 → Sábado 18h");
  console.log("  Semana 4 → Domingo 17h\n");

  const tz = { timezone: "America/Fortaleza" };

  Object.values(ESTRATEGIA_SEMANAL).forEach(config => {
    cron.schedule(config.cron, () => executarPostAgendado(config), tz);
  });

  // Relatório toda quinta às 9h
  cron.schedule("0 9 * * 4", async () => {
    console.log("\n📊 Gerando relatório semanal...");
    try {
      const { relatorioPerformance } = require("../scripts/createAds");
      await relatorioPerformance(7);
    } catch (e) {
      console.error("❌ Erro no relatório:", e.message);
    }
  }, tz);
  console.log("  📊 Relatório: Quinta 9h\n");

  console.log("═".repeat(55));
  console.log("🚀 Rodando! Pressione Ctrl+C para parar.\n");
}

// ──────────────────────────────────────────────
// TESTAR MANUALMENTE
// ──────────────────────────────────────────────

async function testarAgora(dia = "quinta") {
  const config = ESTRATEGIA_SEMANAL[dia];
  if (!config) {
    console.error(`❌ Dia "${dia}" não encontrado. Opções: quinta, sexta, sabado, domingo`);
    return;
  }
  // No teste, ignora a verificação de rotação e publica direto
  console.log(`\n🧪 TESTANDO (força publicar): ${config.descricao}`);
  try {
    const hashtags = generateRotatingHashtags(config.tipoHashtag);
    const legendaGerada = await generateCaption(config.tipoCaptions);
    const legenda = legendaGerada + "\n\n" + hashtags;
    if (!config.imageUrl) {
      console.log("📝 Legenda gerada (sem publicar):\n" + legenda);
      return;
    }
    await publicarPost({ imageUrl: config.imageUrl, legendaCustom: legenda, incluirHashtags: false, comentarLink: true });
    console.log(`✅ Teste publicado: ${config.descricao}`);
  } catch (e) {
    console.error(`❌ Erro no teste:`, e.message);
  }
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

module.exports = { iniciarAgendador, testarAgora, semanaDoMes, DIA_POR_SEMANA, ESTRATEGIA_SEMANAL };
