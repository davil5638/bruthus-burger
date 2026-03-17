require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarStory } = require("../scripts/postInstagram");
const { storyTeaser, storyAbertura } = require("../scripts/storyImage");

// ──────────────────────────────────────────────
// Bruthus Burger — Stories automáticos
//
// Qui a Dom:
//   16h00 → Story teaser "Hoje tem Bruthus! Das 18h30..."
//   18h30 → Story abertura "Estamos abertos! [link]"
//
// Quinta 9h → Relatório semanal de anúncios
// ──────────────────────────────────────────────

function iniciarAgendador() {
  console.log("\n" + "═".repeat(55));
  console.log("🍔 BRUTHUS BURGER — AGENDADOR DE STORIES");
  console.log("═".repeat(55));
  console.log(`📅 Iniciado: ${new Date().toLocaleString("pt-BR")}`);
  console.log("\n📋 Agenda:");

  const tz = { timezone: "America/Fortaleza" };

  // ── Story das 16h — Teaser ──
  cron.schedule("0 16 * * 4,5,6,0", async () => {
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    console.log(`\n📱 [${agora}] Publicando story teaser das 16h...`);

    const teaserId = process.env.CLOUDINARY_STORY_TEASER_ID;
    if (!teaserId) {
      console.warn("⚠️ CLOUDINARY_STORY_TEASER_ID não configurado. Configure no dashboard.");
      return;
    }
    try {
      await publicarStory(storyTeaser(teaserId));
      console.log("✅ Story teaser (16h) publicado!");
    } catch (e) {
      console.error("❌ Erro no story das 16h:", e.message);
    }
  }, tz);
  console.log("  📱 Story teaser:   Qui-Dom às 16h00");

  // ── Story das 18h30 — Abertura ──
  cron.schedule("30 18 * * 4,5,6,0", async () => {
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    console.log(`\n📱 [${agora}] Publicando story de abertura das 18h30...`);

    const aberturaId = process.env.CLOUDINARY_STORY_ABERTO_ID;
    if (!aberturaId) {
      console.warn("⚠️ CLOUDINARY_STORY_ABERTO_ID não configurado. Configure no dashboard.");
      return;
    }
    try {
      await publicarStory(storyAbertura(aberturaId));
      console.log("✅ Story abertura (18h30) publicado!");
    } catch (e) {
      console.error("❌ Erro no story das 18h30:", e.message);
    }
  }, tz);
  console.log("  🚪 Story abertura: Qui-Dom às 18h30");

  // ── Relatório semanal — toda quinta às 9h ──
  cron.schedule("0 9 * * 4", async () => {
    console.log("\n📊 Gerando relatório semanal de anúncios...");
    try {
      const { relatorioPerformance } = require("../scripts/createAds");
      await relatorioPerformance(7);
    } catch (e) {
      console.error("❌ Erro no relatório:", e.message);
    }
  }, tz);
  console.log("  📊 Relatório:      Quinta às 9h\n");

  console.log("═".repeat(55));
  console.log("🚀 Rodando! Pressione Ctrl+C para parar.\n");
}

// ──────────────────────────────────────────────
// TESTAR STORIES MANUALMENTE
// ──────────────────────────────────────────────

async function testarStory(tipo = "teaser") {
  console.log(`\n🧪 TESTANDO STORY: ${tipo}`);

  if (tipo === "teaser") {
    const id = process.env.CLOUDINARY_STORY_TEASER_ID;
    if (!id) { console.warn("⚠️ CLOUDINARY_STORY_TEASER_ID não configurado."); return; }
    const url = storyTeaser(id);
    console.log("🔗 URL gerada:", url);
    await publicarStory(url);
    console.log("✅ Story teaser publicado!");
  } else if (tipo === "abertura") {
    const id = process.env.CLOUDINARY_STORY_ABERTO_ID;
    if (!id) { console.warn("⚠️ CLOUDINARY_STORY_ABERTO_ID não configurado."); return; }
    const url = storyAbertura(id);
    console.log("🔗 URL gerada:", url);
    await publicarStory(url);
    console.log("✅ Story abertura publicado!");
  } else {
    console.error(`❌ Tipo "${tipo}" inválido. Use: teaser ou abertura`);
  }
}

// Execução direta
if (require.main === module) {
  const comando = process.argv[2];
  if (comando === "testar-story") {
    const tipo = process.argv[3] || "teaser";
    testarStory(tipo).then(() => process.exit(0)).catch(console.error);
  } else {
    iniciarAgendador();
  }
}

module.exports = { iniciarAgendador, testarStory };
