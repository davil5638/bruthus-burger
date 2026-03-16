require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarPost } = require("../scripts/postInstagram");
const { generatePromotion, isSabadoPromo, getSabadoPromoTipo } = require("../scripts/generatePromotion");
const { generateCaption } = require("../scripts/generateCaption");
const { generateRotatingHashtags } = require("../scripts/generateHashtags");

// ──────────────────────────────────────────────
// Bruthus Burger — abre Quinta a Domingo
//
// Qui 18h  → Quinta do Hambúrguer (promo fixa)
// Sex 18h  → Cupom SEXTAOFF10 (10% OFF no link)
// Sáb 18h  → Promoção rotativa 2x/mês (sem. 1 e 3)
// Dom 17h  → Post aconchegante família/casal
// Qui 09h  → Relatório semanal automático
// ──────────────────────────────────────────────

const ESTRATEGIA_SEMANAL = {
  quinta: {
    cron: "0 18 * * 4",
    descricao: "Quinta 18h — Quinta do Hambúrguer 🍔",
    tipoCaptions: "PROMOCAO",
    tipoPromo: "QUINTA_BURGER",
    tipoHashtag: "promo",
    imageUrl: process.env.IMG_QUINTA || null,
    ativo: true,
  },

  sexta: {
    cron: "0 18 * * 5",
    descricao: "Sexta 18h — Cupom SEXTAOFF10 🔥",
    tipoCaptions: "SEXTA_CUPOM",
    tipoPromo: "SEXTA_CUPOM",
    tipoHashtag: "promo",
    imageUrl: process.env.IMG_SEXTA || null,
    ativo: true,
  },

  // Sábado roda todo sábado mas só publica nas semanas 1 e 3 do mês
  sabado: {
    cron: "0 18 * * 6",
    descricao: "Sábado 18h — Promoção Rotativa (2x/mês) 🎉",
    tipoCaptions: "SMASH",
    tipoPromo: null, // definido dinamicamente em executarSabado()
    tipoHashtag: "promo",
    imageUrl: process.env.IMG_SABADO || null,
    ativo: true,
  },

  domingo: {
    cron: "0 17 * * 0",
    descricao: "Domingo 17h — Post Família/Casal ❤️",
    tipoCaptions: "DOMINGO",
    tipoPromo: null,
    tipoHashtag: "produto",
    imageUrl: process.env.IMG_DOMINGO || null,
    ativo: true,
  },
};

// ──────────────────────────────────────────────
// PUBLICAÇÃO AGENDADA GENÉRICA
// ──────────────────────────────────────────────

async function executarPostAgendado(config) {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  console.log(`\n⏰ [${agora}] Executando: ${config.descricao}`);

  try {
    const hashtags = generateRotatingHashtags(config.tipoHashtag);
    let legenda;

    if (config.tipoPromo) {
      const promo = await generatePromotion(config.tipoPromo);
      legenda = promo.legenda + "\n\n" + hashtags;
    } else {
      const legendaGerada = await generateCaption(config.tipoCaptions);
      legenda = legendaGerada + "\n\n" + hashtags;
    }

    if (!config.imageUrl) {
      console.warn(`⚠️ imageUrl não configurada para ${config.descricao}`);
      console.log("📝 Legenda gerada (sem publicar):");
      console.log(legenda);
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
// SÁBADO — só publica nas semanas 1 e 3 do mês
// ──────────────────────────────────────────────

async function executarSabado() {
  if (!isSabadoPromo()) {
    const semana = Math.ceil(new Date().getDate() / 7);
    console.log(`\n📅 Sábado semana ${semana} — sem promoção programada. Pulando.`);
    return;
  }

  const tipoPromo = getSabadoPromoTipo();
  const config = {
    ...ESTRATEGIA_SEMANAL.sabado,
    tipoPromo,
    descricao: `Sábado Promoção: ${tipoPromo}`,
  };

  await executarPostAgendado(config);
}

// ──────────────────────────────────────────────
// INICIAR AGENDADOR
// ──────────────────────────────────────────────

function iniciarAgendador() {
  console.log("\n" + "═".repeat(55));
  console.log("🍔 BRUTHUS BURGER — AGENDADOR (Qui a Dom)");
  console.log("═".repeat(55));
  console.log(`📅 Iniciado: ${new Date().toLocaleString("pt-BR")}`);
  console.log("\n📋 Agendamentos:\n");

  const tz = { timezone: "America/Fortaleza" };

  // Quinta
  cron.schedule(ESTRATEGIA_SEMANAL.quinta.cron, () => executarPostAgendado(ESTRATEGIA_SEMANAL.quinta), tz);
  console.log(`  ✅ ${ESTRATEGIA_SEMANAL.quinta.descricao}`);

  // Sexta
  cron.schedule(ESTRATEGIA_SEMANAL.sexta.cron, () => executarPostAgendado(ESTRATEGIA_SEMANAL.sexta), tz);
  console.log(`  ✅ ${ESTRATEGIA_SEMANAL.sexta.descricao}`);

  // Sábado (condicional)
  cron.schedule(ESTRATEGIA_SEMANAL.sabado.cron, executarSabado, tz);
  console.log(`  ✅ ${ESTRATEGIA_SEMANAL.sabado.descricao}`);

  // Domingo
  cron.schedule(ESTRATEGIA_SEMANAL.domingo.cron, () => executarPostAgendado(ESTRATEGIA_SEMANAL.domingo), tz);
  console.log(`  ✅ ${ESTRATEGIA_SEMANAL.domingo.descricao}`);

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
  if (dia === "sabado") {
    await executarSabado();
    return;
  }
  const config = ESTRATEGIA_SEMANAL[dia];
  if (!config) {
    console.error(`❌ Dia "${dia}" não encontrado. Opções: quinta, sexta, sabado, domingo`);
    return;
  }
  console.log(`\n🧪 TESTANDO: ${config.descricao}`);
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

module.exports = { iniciarAgendador, testarAgora, executarSabado, ESTRATEGIA_SEMANAL };
