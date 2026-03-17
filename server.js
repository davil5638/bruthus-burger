require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { publicarPost, publicarStory, listarPostsPublicados } = require("./scripts/postInstagram");
const { generateCaption, generateBatchCaptions } = require("./scripts/generateCaption");
const { generatePromotion, generateWeeklyPromotions, getPromocaoDoDia, PROMOCOES } = require("./scripts/generatePromotion");
const { generateReelsScript } = require("./scripts/generateReelsScript");
const { generateHashtags } = require("./scripts/generateHashtags");
const {
  criarCampanhaCompleta, relatorioPerformance,
  listarCampanhas, listarAdSets, pausarCampanha, ativarCampanha, excluirCampanha, atualizarOrcamento,
} = require("./scripts/createAds");
const { iniciarAgendador, testarStory } = require("./scheduler/scheduler");
const { storyTeaser, storyAbertura } = require("./scripts/storyImage");
const { generateStory, STORY_TYPES } = require("./scripts/generateStories");
const fin = require("./scripts/financeiro");

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// CRIAR PASTAS NECESSÁRIAS (Render não persiste filesystem)
// Garante que as pastas existam antes de qualquer script tentar escrever
// ──────────────────────────────────────────────
const PASTAS = [
  "generated/captions",
  "generated/hashtags",
  "generated/promotions",
  "content/fotos",
  "content/fotos_usadas",
  "data",
];
PASTAS.forEach(p => {
  const fullPath = path.resolve(__dirname, p);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 Pasta criada: ${p}`);
  }
});

const allowedOrigins = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : []),
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / Postman
      if (
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin)
      )
        return cb(null, true);
      cb(new Error(`CORS: origem não permitida — ${origin}`));
    },
    credentials: true,
  })
);
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

// Gera título e corpo do anúncio com IA
app.post("/ads/gerar-texto", async (req, res) => {
  try {
    const OpenAI = require("openai");
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const { tipo = "SMASH" } = req.body;
    const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
    const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";

    const tiposDesc = {
      SMASH:    "Smash Burger artesanal prensado na chapa",
      COMBO:    "Combo completo (burger + batata + refri)",
      FAMILIA:  "Combo família para o final de semana",
      QUINTA:   "Promoção especial da Quinta do Hambúrguer",
      SEXTA:    "Cupom SEXTAOFF10 — 10% OFF sexta-feira",
    };

    const prompt = `Crie um anúncio de Meta Ads para uma hamburgueria artesanal brasileira chamada "${BUSINESS_NAME}".

Produto/Tema: ${tiposDesc[tipo] || tipo}
Link de destino: ${ORDER_LINK}

Retorne um JSON com:
{
  "titulo": "título do anúncio — máx 40 caracteres, impactante, com emoji",
  "corpo": "texto do anúncio — máx 125 caracteres, apetitoso e urgente, termina com CTA"
}

Sem explicações. Só o JSON.`;

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.85,
    });

    const content = response.choices[0].message.content.trim();
    const match = content.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : { titulo: "", corpo: content };

    res.json({ sucesso: true, ...data });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/ads", async (req, res) => {
  try {
    const { imageUrl, titulo, corpo, orcamentoDiario, registrarFinanceiro } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ erro: "imageUrl é obrigatório" });
    }

    const orcamento = orcamentoDiario || 1000;

    const resultado = await criarCampanhaCompleta({
      imageUrl,
      titulo,
      corpo,
      orcamentoDiario: orcamento,
    });

    // Registra o gasto no sistema financeiro automaticamente
    if (registrarFinanceiro !== false) {
      try {
        const valorDiario = orcamento / 100; // converte centavos para reais
        fin.adicionarEntrada({
          tipo: "despesa",
          valor: valorDiario,
          categoria: "Marketing/Anúncios",
          descricao: `Meta Ads — campanha criada (R$${valorDiario.toFixed(2)}/dia) ID: ${resultado.campanhaId}`,
        });
        resultado.registradoFinanceiro = true;
      } catch (finErr) {
        console.warn("⚠️ Não registrou no financeiro:", finErr.message);
        resultado.registradoFinanceiro = false;
      }
    }

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

// Lista campanhas com status atual
app.get("/ads/campanhas", async (req, res) => {
  try {
    const campanhas = await listarCampanhas();
    // Para cada campanha, busca os ad sets (para pegar orçamento diário)
    const campanhasComAdSets = await Promise.all(
      campanhas.map(async (c) => {
        try {
          const adSets = await listarAdSets(c.id);
          return { ...c, adSets };
        } catch {
          return { ...c, adSets: [] };
        }
      })
    );
    res.json({ sucesso: true, campanhas: campanhasComAdSets });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Pausar campanha
app.post("/ads/:id/pausar", async (req, res) => {
  try {
    await pausarCampanha(req.params.id);
    res.json({ sucesso: true, mensagem: "Campanha pausada" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Ativar campanha
app.post("/ads/:id/ativar", async (req, res) => {
  try {
    await ativarCampanha(req.params.id);
    res.json({ sucesso: true, mensagem: "Campanha ativada" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Excluir campanha
app.delete("/ads/:id", async (req, res) => {
  try {
    await excluirCampanha(req.params.id);
    res.json({ sucesso: true, mensagem: "Campanha excluída" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Atualizar orçamento de um ad set
app.patch("/ads/adset/:id/orcamento", async (req, res) => {
  try {
    const { orcamentoDiario } = req.body;
    if (!orcamentoDiario) return res.status(400).json({ erro: "orcamentoDiario é obrigatório (em centavos)" });
    await atualizarOrcamento(req.params.id, orcamentoDiario);
    res.json({ sucesso: true, mensagem: `Orçamento atualizado: R$${(orcamentoDiario / 100).toFixed(2)}/dia` });
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

  const stories = {
    teaser: {
      horario: "16:00",
      dias: "Qui, Sex, Sáb, Dom",
      cron: "0 16 * * 4,5,6,0",
      descricao: "Avisa que hoje tem Bruthus às 18h30",
      imagemConfigurada: !!process.env.CLOUDINARY_STORY_TEASER_ID,
      publicId: process.env.CLOUDINARY_STORY_TEASER_ID || null,
    },
    abertura: {
      horario: "18:30",
      dias: "Qui, Sex, Sáb, Dom",
      cron: "30 18 * * 4,5,6,0",
      descricao: "Avisa que já estão entregando + link do pedido",
      imagemConfigurada: !!process.env.CLOUDINARY_STORY_ABERTO_ID,
      publicId: process.env.CLOUDINARY_STORY_ABERTO_ID || null,
    },
  };

  res.json({ agendamentos: config, stories });
});

// Salva o public_id das imagens de story (vem do upload via Cloudinary no dashboard)
const schedulerConfigPath = path.resolve(__dirname, "data/scheduler-config.json");

function lerSchedulerConfig() {
  if (!fs.existsSync(schedulerConfigPath)) return {};
  try { return JSON.parse(fs.readFileSync(schedulerConfigPath, "utf-8")); }
  catch { return {}; }
}

app.post("/scheduler/story-config", (req, res) => {
  try {
    const { tipo, publicId } = req.body;

    if (!tipo || !publicId) {
      return res.status(400).json({ erro: "tipo e publicId são obrigatórios" });
    }
    if (!["teaser", "abertura"].includes(tipo)) {
      return res.status(400).json({ erro: "tipo deve ser 'teaser' ou 'abertura'" });
    }

    const config = lerSchedulerConfig();
    config[tipo] = publicId;
    fs.writeFileSync(schedulerConfigPath, JSON.stringify(config, null, 2));

    // Atualiza process.env em tempo de execução (sem precisar reiniciar)
    const envKey = tipo === "teaser" ? "CLOUDINARY_STORY_TEASER_ID" : "CLOUDINARY_STORY_ABERTO_ID";
    process.env[envKey] = publicId;

    res.json({
      sucesso: true,
      mensagem: `Imagem de story ${tipo} configurada com sucesso`,
      publicId,
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Preview da URL de story que será usada
app.get("/scheduler/story-preview/:tipo", (req, res) => {
  try {
    const { tipo } = req.params;
    const { publicId } = req.query;

    if (!publicId) return res.status(400).json({ erro: "publicId é obrigatório" });

    let url;
    if (tipo === "teaser") url = storyTeaser(publicId);
    else if (tipo === "abertura") url = storyAbertura(publicId);
    else return res.status(400).json({ erro: "tipo inválido. Use: teaser ou abertura" });

    res.json({ sucesso: true, url });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Testar story manualmente (publica agora)
app.post("/scheduler/testar-story", async (req, res) => {
  try {
    const { tipo } = req.body;
    await testarStory(tipo || "teaser");
    res.json({ sucesso: true, mensagem: `Story "${tipo}" publicado para teste` });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
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
    const diasNum = dias !== undefined ? parseInt(dias) : 7;
    const resumo = fin.calcularResumo(isNaN(diasNum) ? 7 : diasNum);
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
