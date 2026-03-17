require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarStory } = require("../scripts/postInstagram");
const { buildStoryImageUrl, gerarTextoStory, sortearFotoStory } = require("../scripts/storyImage");

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";

// ──────────────────────────────────────────────
// FLAG DE PAUSA — controlada pelo dashboard
// ──────────────────────────────────────────────
let _pausado = false;

function pausarAgendador()  { _pausado = true;  console.log("⏸️  Agendador de stories PAUSADO."); }
function retomarAgendador() { _pausado = false; console.log("▶️  Agendador de stories RETOMADO."); }
function isAgendadorPausado() { return _pausado; }

// ──────────────────────────────────────────────
// Bruthus Burger — Stories automáticos
//
// Qui a Dom:
//   16h00 → Story teaser com texto gerado por IA (variado)
//   18h30 → Story abertura com texto gerado por IA + link clicável
//
// Quinta 9h → Relatório semanal de anúncios
// ──────────────────────────────────────────────

function getDiaAtual() {
  const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  return dias[new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" })).getDay()];
}

function iniciarAgendador() {
  console.log("\n" + "═".repeat(55));
  console.log("🍔 BRUTHUS BURGER — AGENDADOR DE STORIES");
  console.log("═".repeat(55));
  console.log(`📅 Iniciado: ${new Date().toLocaleString("pt-BR")}`);
  console.log("\n📋 Agenda:");

  const tz = { timezone: "America/Fortaleza" };

  // ── Story das 16h — Teaser ──
  cron.schedule("0 16 * * 4,5,6,0", async () => {
    if (_pausado) { console.log("⏸️  Story das 16h ignorado — agendador pausado."); return; }
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    console.log(`\n📱 [${agora}] Publicando story teaser das 16h...`);

    const fallbackId = process.env.CLOUDINARY_STORY_TEASER_ID;
    try {
      const [fotoId, texto] = await Promise.all([
        sortearFotoStory(fallbackId),
        gerarTextoStory("teaser", getDiaAtual()),
      ]);
      if (!fotoId) { console.warn("⚠️ Nenhuma foto disponível para o story das 16h."); return; }
      console.log(`✍️  Texto gerado: "${texto.principal}" | "${texto.secundario}"`);
      const url = buildStoryImageUrl(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor });
      await publicarStory(url, null);
      console.log("✅ Story teaser (16h) publicado!");
    } catch (e) {
      console.error("❌ Erro no story das 16h:", e.message);
    }
  }, tz);
  console.log("  📱 Story teaser:   Qui-Dom às 16h00");

  // ── Story das 18h30 — Abertura ──
  cron.schedule("30 18 * * 4,5,6,0", async () => {
    if (_pausado) { console.log("⏸️  Story das 18h30 ignorado — agendador pausado."); return; }
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    console.log(`\n📱 [${agora}] Publicando story de abertura das 18h30...`);

    const fallbackAberturaId = process.env.CLOUDINARY_STORY_ABERTO_ID;
    try {
      const [fotoId, texto] = await Promise.all([
        sortearFotoStory(fallbackAberturaId),
        gerarTextoStory("abertura", getDiaAtual()),
      ]);
      if (!fotoId) { console.warn("⚠️ Nenhuma foto disponível para o story das 18h30."); return; }
      console.log(`✍️  Texto gerado: "${texto.principal}" | "${texto.secundario}"`);
      const url = buildStoryImageUrl(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor, link: ORDER_LINK });
      // Story das 18h30 tem link clicável para pedido
      await publicarStory(url, ORDER_LINK);
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

  if (tipo !== "teaser" && tipo !== "abertura") {
    throw new Error(`Tipo "${tipo}" inválido. Use: teaser ou abertura`);
  }

  const fallbackId = tipo === "teaser"
    ? process.env.CLOUDINARY_STORY_TEASER_ID
    : process.env.CLOUDINARY_STORY_ABERTO_ID;

  const [fotoId, texto] = await Promise.all([
    sortearFotoStory(fallbackId),
    gerarTextoStory(tipo, getDiaAtual()),
  ]);

  if (!fotoId) throw new Error("Nenhuma foto disponível. Configure CLOUDINARY_STORY_TEASER_ID ou adicione fotos na pasta.");

  console.log(`✍️  Texto gerado: "${texto.principal}" | "${texto.secundario}"`);

  const linkOpts = tipo === "abertura" ? { link: ORDER_LINK } : {};
  const url = buildStoryImageUrl(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor, ...linkOpts });

  console.log("🔗 URL gerada:", url);
  await publicarStory(url, tipo === "abertura" ? ORDER_LINK : null);
  console.log(`✅ Story ${tipo} publicado!`);

  return { url, texto };
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

module.exports = { iniciarAgendador, testarStory, pausarAgendador, retomarAgendador, isAgendadorPausado };
