require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cron = require("node-cron");
const { publicarStory } = require("../scripts/postInstagram");
const { gerarTextoStory, sortearFotoStory } = require("../scripts/storyImage");
const { gerarStoryImagem } = require("../scripts/storyImageSharp");

const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";

// ──────────────────────────────────────────────
// FLAG DE PAUSA — começa SEMPRE pausado
// Ativar manualmente pelo dashboard quando quiser usar
// ──────────────────────────────────────────────
let _pausado = true;

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
      const url = await gerarStoryImagem(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor });
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
      const url = await gerarStoryImagem(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor, link: ORDER_LINK });
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
  console.log("  📊 Relatório:      Quinta às 9h");

  // ── Resumo financeiro no WhatsApp — toda terça às 10h ──
  cron.schedule("0 10 * * 2", async () => {
    console.log("\n📱 Enviando resumo semanal para WhatsApp...");
    try {
      const { enviarResumoSemanal } = require("../scripts/whatsappResumo");
      await enviarResumoSemanal();
    } catch (e) {
      console.error("❌ Erro no resumo WhatsApp:", e.message);
    }
  }, tz);
  console.log("  📱 Resumo WhatsApp: Terça às 10h");

  // ── Custos fixos — provisão semanal toda TERÇA às 00h05 ──
  // A semana reseta na terça (mesmo ciclo do resumo do WhatsApp), então
  // a provisão entra assim que ela vira. Bookkeeping: roda mesmo com o
  // agendador de stories pausado.
  //
  // Este cron é só o caminho feliz. Se o app estiver dormindo na terça
  // (free tier do Render), quem garante o lançamento é o recuperar no
  // boot, em server.js — ele preenche as semanas que ficaram pra trás.
  cron.schedule("5 0 * * 2", async () => {
    console.log("\n💰 Semana nova — lançando provisão de custos fixos...");
    try {
      const { recuperarSemanasPendentes } = require("../scripts/custosFixos");
      const r = await recuperarSemanasPendentes();
      if (r.lancadas) console.log(`✅ Custos fixos: ${r.lancadas} semana(s), R$ ${r.valorTotal} (até ${r.semanaAtual})`);
      else            console.log("ℹ️  Custos fixos já em dia.");
    } catch (e) {
      console.error("❌ Erro ao lançar custos fixos:", e.message);
    }
  }, tz);
  console.log("  💰 Custos fixos:   Terça às 00h05 (+ recuperação no boot)");

  // ── Conciliação da receita com o OlaClick — todo dia às 05h00 ──
  // Roda depois da loja fechar (23h) para pegar o dia inteiro fechado.
  // Confere os últimos 3 dias, não só ontem: pedido pode ser atualizado
  // com atraso no OlaClick, e a conciliação lança diferença — então
  // reconferir dia já conciliado é barato e não duplica nada.
  //
  // Como o app dorme no free tier do Render, este cron é só o caminho
  // feliz; a garantia é a conciliação no boot, em server.js.
  cron.schedule("0 5 * * *", async () => {
    console.log("\n🧾 Conciliando receita com o OlaClick...");
    try {
      const { conciliarPendentes } = require("../scripts/conciliacaoOlaClick");
      const r = await conciliarPendentes({ dias: 3 });
      if (r.ignorado)          console.log(`ℹ️  Ignorada: ${r.ignorado}`);
      else if (r.lancamentos)  console.log(`✅ Conciliação: ${r.lancamentos} lançamento(s) — receita R$ ${r.receitaLancada}, taxas R$ ${r.taxaLancada} (${r.de} a ${r.ate})`);
      else                     console.log("ℹ️  Receita já conciliada.");
      (r.avisos || []).forEach((a) => console.warn(`⚠️  ${a.categoria}: ${a.aviso || a.erro}`));
    } catch (e) {
      console.error("❌ Erro na conciliação OlaClick:", e.message);
    }
  }, tz);
  console.log("  🧾 Conciliação:    Todo dia às 05h00 (+ conciliação no boot)");

  // ── Gasto de anúncios — todo dia às 05h10 ──
  // Dez minutos depois da conciliação, para não disputar a mesma janela.
  // Olha 7 dias para trás de propósito: a Meta revisa o gasto de um dia
  // depois (atribuição, impressão inválida), e como lançamos diferença a
  // correção entra sozinha sem duplicar nada.
  cron.schedule("10 5 * * *", async () => {
    console.log("\n📣 Buscando gasto de anúncios na Meta...");
    try {
      const ga = require("../scripts/gastoAnuncios");
      const r = await ga.lancarPendentes({ dias: 7 });
      if (r.ignorado)          console.log(`ℹ️  Ignorado: ${r.ignorado}`);
      else if (r.erro)         console.warn(`⚠️  Meta respondeu: ${r.erro}`);
      else if (r.lancamentos)  console.log(`✅ Anúncios: ${r.lancamentos} dia(s), R$ ${r.valorTotal} (${r.de} a ${r.ate})`);
      else                     console.log("ℹ️  Gasto de anúncios já em dia.");
      (r.avisos || []).forEach((a) => console.warn(`⚠️  ${a.data}: ${a.aviso}`));
    } catch (e) {
      console.error("❌ Erro no gasto de anúncios:", e.message);
    }
  }, tz);
  console.log("  📣 Anúncios:       Todo dia às 05h10 (+ no boot)");

  // ── Recálculo diário de scores de clientes — 00h30 ──
  cron.schedule("30 0 * * *", async () => {
    console.log("\n🧮 Recalculando scores de clientes (cron diário)...");
    try {
      const { recalcularTodos } = require("../scripts/customerScoring");
      await recalcularTodos();
    } catch (e) {
      console.error("❌ Erro no recálculo:", e.message);
    }
  }, tz);
  console.log("  🧮 Recálculo scores: diário às 00h30");

  // ── Disparo semanal automático para "em_risco" — sextas 16h ──
  cron.schedule("0 16 * * 5", async () => {
    if (_pausado) { console.log("⏸️  Disparo em_risco ignorado — agendador pausado."); return; }
    console.log("\n📨 Disparo semanal de recuperação para em_risco...");
    try {
      const { dispararSegmento } = require("../scripts/customerCampaigns");
      const r = await dispararSegmento("em_risco", { limite: 30 });
      console.log(`✅ Disparo concluído: ${r.enviados} enviados / ${r.falhas} falhas`);
    } catch (e) {
      console.error("❌ Erro no disparo em_risco:", e.message);
    }
  }, tz);
  console.log("  📨 Disparo em_risco: Sexta às 16h\n");

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
  const url = await gerarStoryImagem(fotoId, { principal: texto.principal, secundario: texto.secundario, cor: texto.cor, ...linkOpts });

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
