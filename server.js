require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { publicarPost, listarPostsPublicados } = require("./scripts/postInstagram");
const { generateCaption, generateBatchCaptions } = require("./scripts/generateCaption");
const { generatePromotion, generateWeeklyPromotions, getPromocaoDoDia, PROMOCOES } = require("./scripts/generatePromotion");
const { generateReelsScript } = require("./scripts/generateReelsScript");
const { generateHashtags } = require("./scripts/generateHashtags");
const { criarCampanhaCompleta, relatorioPerformance } = require("./scripts/createAds");
const { iniciarAgendador, testarAgora, ESTRATEGIA_SEMANAL } = require("./scheduler/scheduler");
const { generateStory, STORY_TYPES } = require("./scripts/generateStories");
const fin = require("./scripts/financeiro");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: ["http://localhost:3001", "http://127.0.0.1:3001"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// MIDDLEWARE DE LOG
// ──────────────────────────────────────────────

app.use((req, res, next) => {
  const agora = new Date().toLocaleString("pt-BR");
  console.log(`[${agora}] ${req.method} ${req.path}`);
  next();
});

// ──────────────────────────────────────────────
// ROTA PRINCIPAL - DASHBOARD
// ──────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    sistema: "🍔 Bruthus Burger - Marketing Automation",
    versao: "1.0.0",
    status: "online",
    rotas: {
      "GET  /status": "Status do sistema",
      "POST /post": "Publicar post no Instagram",
      "POST /caption": "Gerar legenda com IA",
      "POST /caption/batch": "Gerar múltiplas legendas",
      "POST /promotion": "Gerar promoção",
      "POST /reels": "Gerar roteiro de Reels",
      "GET  /hashtags": "Gerar hashtags",
      "GET  /posts": "Listar posts publicados",
      "POST /ads": "Criar campanha Meta Ads",
      "GET  /ads/relatorio": "Relatório de performance",
      "POST /scheduler/testar": "Testar agendamento",
      "GET  /scheduler/config": "Ver configuração do agendador",
    },
  });
});

// ──────────────────────────────────────────────
// STATUS
// ──────────────────────────────────────────────

app.get("/status", (req, res) => {
  const config = {
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? "✅ Configurado" : "❌ Não configurado",
    IG_USER_ID: process.env.IG_USER_ID ? "✅ Configurado" : "❌ Não configurado",
    AD_ACCOUNT_ID: process.env.AD_ACCOUNT_ID ? "✅ Configurado" : "❌ Não configurado",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ Configurado" : "❌ Não configurado",
    ORDER_LINK: process.env.ORDER_LINK || "❌ Não configurado",
  };

  const fotosPath = path.resolve(__dirname, "content/fotos");
  const totalFotos = fs.existsSync(fotosPath)
    ? fs.readdirSync(fotosPath).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).length
    : 0;

  res.json({
    status: "✅ Online",
    configuracoes: config,
    conteudo: { fotosNaFila: totalFotos },
    agendamentos: Object.keys(ESTRATEGIA_SEMANAL).length,
    horario: new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }),
  });
});

// ──────────────────────────────────────────────
// PUBLICAR POST
// ──────────────────────────────────────────────

app.post("/post", async (req, res) => {
  try {
    const { imageUrl, tipoCaptions, legendaCustom, incluirHashtags, comentarLink } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ erro: "imageUrl é obrigatório" });
    }

    const resultado = await publicarPost({
      imageUrl,
      tipoCaptions: tipoCaptions || "SMASH",
      legendaCustom,
      incluirHashtags: incluirHashtags !== false,
      comentarLink: comentarLink !== false,
    });

    res.json({ sucesso: true, resultado });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// LEGENDAS
// ──────────────────────────────────────────────

app.post("/caption", async (req, res) => {
  try {
    const { tipo, gatilho } = req.body;
    const legenda = await generateCaption(tipo || "SMASH", gatilho);
    res.json({ sucesso: true, legenda });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/caption/batch", async (req, res) => {
  try {
    const { quantidade } = req.body;
    const legendas = await generateBatchCaptions(quantidade || 5);
    res.json({ sucesso: true, total: legendas.length, legendas });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// PROMOÇÕES
// ──────────────────────────────────────────────

app.post("/promotion", async (req, res) => {
  try {
    const { tipo } = req.body;
    const tipoPromo = tipo || getPromocaoDoDia();
    const resultado = await generatePromotion(tipoPromo);
    res.json({ sucesso: true, resultado });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/promotion/tipos", (req, res) => {
  res.json({
    tipos: Object.entries(PROMOCOES).map(([key, val]) => ({
      id: key,
      nome: val.nome,
      descricao: val.descricao,
      preco: val.preco,
      dia: val.dia,
    })),
  });
});

// ──────────────────────────────────────────────
// REELS
// ──────────────────────────────────────────────

app.post("/reels", async (req, res) => {
  try {
    const { formato, duracao } = req.body;
    const roteiro = await generateReelsScript(formato || "CLOSE_UP", duracao || 30);
    res.json({ sucesso: true, roteiro });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// HASHTAGS
// ──────────────────────────────────────────────

app.get("/hashtags", (req, res) => {
  const { tipo } = req.query;
  const hashtags = generateHashtags(tipo || "produto");
  res.json({ sucesso: true, hashtags, total: hashtags.split(" ").length });
});

// ──────────────────────────────────────────────
// POSTS PUBLICADOS
// ──────────────────────────────────────────────

app.get("/posts", async (req, res) => {
  try {
    const { limite } = req.query;
    const posts = await listarPostsPublicados(parseInt(limite) || 10);
    res.json({ sucesso: true, total: posts.length, posts });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// META ADS
// ──────────────────────────────────────────────

app.post("/ads", async (req, res) => {
  try {
    const { imageUrl, titulo, corpo, orcamentoDiario } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ erro: "imageUrl é obrigatório" });
    }

    const resultado = await criarCampanhaCompleta({
      imageUrl,
      titulo,
      corpo,
      orcamentoDiario: orcamentoDiario || 1000,
    });

    res.json({ sucesso: true, resultado });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/ads/relatorio", async (req, res) => {
  try {
    const { dias } = req.query;
    const dados = await relatorioPerformance(parseInt(dias) || 7);
    res.json({ sucesso: true, dados });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// AGENDADOR
// ──────────────────────────────────────────────

app.post("/scheduler/testar", async (req, res) => {
  try {
    const { dia } = req.body;
    await testarAgora(dia || "quinta");
    res.json({ sucesso: true, mensagem: `Teste do agendamento "${dia}" executado` });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/scheduler/config", (req, res) => {
  const config = Object.entries(ESTRATEGIA_SEMANAL).map(([dia, cfg]) => ({
    dia,
    descricao: cfg.descricao,
    cron: cfg.cron,
    tipoCaptions: cfg.tipoCaptions,
    tipoPromo: cfg.tipoPromo,
    imagemConfigurada: !!cfg.imageUrl,
  }));

  res.json({ agendamentos: config });
});

// ──────────────────────────────────────────────
// STORIES
// ──────────────────────────────────────────────

app.post("/stories", async (req, res) => {
  try {
    const { tipo, dia } = req.body;
    const resultado = await generateStory(tipo || "PRODUTO", dia || "quinta");
    res.json({ sucesso: true, resultado });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/stories/tipos", (req, res) => {
  const tipos = Object.entries(STORY_TYPES).map(([key, val]) => ({
    id: key, label: val.label, desc: val.desc, cor: val.cor,
  }));
  res.json({ tipos });
});

// ──────────────────────────────────────────────
// FINANCEIRO
// ──────────────────────────────────────────────

app.get("/financeiro", (req, res) => {
  try {
    const { dataInicio, dataFim, tipo } = req.query;
    const entradas = fin.listarEntradas({ dataInicio, dataFim, tipo });
    res.json({ sucesso: true, total: entradas.length, entradas });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/financeiro/resumo", (req, res) => {
  try {
    const { dias } = req.query;
    const resumo = fin.calcularResumo(parseInt(dias) || 7);
    res.json({ sucesso: true, resumo });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/financeiro/categorias", (req, res) => {
  res.json({
    receita:  fin.CATEGORIAS_RECEITA,
    despesa: fin.CATEGORIAS_DESPESA,
  });
});

app.post("/financeiro", (req, res) => {
  try {
    const entrada = fin.adicionarEntrada(req.body);
    res.json({ sucesso: true, entrada });
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

app.delete("/financeiro/:id", (req, res) => {
  try {
    const resultado = fin.removerEntrada(req.params.id);
    res.json({ sucesso: true, ...resultado });
  } catch (error) {
    res.status(404).json({ erro: error.message });
  }
});

// ──────────────────────────────────────────────
// INICIALIZAÇÃO
// ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("\n" + "═".repeat(55));
  console.log("🍔  BRUTHUS BURGER - MARKETING AUTOMATION");
  console.log("═".repeat(55));
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log(`📋 Status  : http://localhost:${PORT}/status`);
  console.log(`📅 Horário : ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`);
  console.log("═".repeat(55) + "\n");

  // Inicia o agendador automático
  iniciarAgendador();
});

module.exports = app;
