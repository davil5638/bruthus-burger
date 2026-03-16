require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;
const IG_USER_ID = process.env.IG_USER_ID;
const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";
const GRAPH_API = "https://graph.facebook.com/v18.0";

// ──────────────────────────────────────────────
// VALIDAÇÃO
// ──────────────────────────────────────────────

function validarConfig() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN.includes("SEU_")) throw new Error("❌ META_ACCESS_TOKEN não configurado");
  if (!AD_ACCOUNT_ID || AD_ACCOUNT_ID.includes("SEU_")) throw new Error("❌ AD_ACCOUNT_ID não configurado");
}

// ──────────────────────────────────────────────
// CONFIGURAÇÕES DE SEGMENTAÇÃO
// ──────────────────────────────────────────────

const SEGMENTACAO_PADRAO = {
  // Raio de 5km da hamburgueria (configurar com lat/lng real)
  geo_locations: {
    custom_locations: [
      {
        latitude: -3.7172,   // ← Substituir pela latitude real do restaurante
        longitude: -38.5434, // ← Substituir pela longitude real do restaurante
        radius: 5,
        distance_unit: "kilometer",
      },
    ],
  },
  age_min: 18,
  age_max: 45,
  // Interesses relacionados a hambúrguer e delivery
  flexible_spec: [
    {
      interests: [
        { id: "6003107902433", name: "Fast food" },
        { id: "6003349442621", name: "Hamburger" },
        { id: "6003020834693", name: "Food delivery" },
        { id: "6003107902434", name: "Restaurant" },
        { id: "6003395720496", name: "Cooking" },
      ],
    },
  ],
};

// ──────────────────────────────────────────────
// CRIAR CAMPANHA
// ──────────────────────────────────────────────

/**
 * Cria uma campanha de tráfego com objetivo de converter em pedidos
 */
async function criarCampanha(nomeCampanha, objetivo = "LINK_CLICKS") {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/campaigns`;

  console.log(`\n📣 Criando campanha: "${nomeCampanha}"...`);

  const response = await axios.post(url, null, {
    params: {
      name: nomeCampanha,
      objective: objetivo, // LINK_CLICKS ou CONVERSIONS
      status: "PAUSED",    // Inicia pausada para revisão
      special_ad_categories: [],
      access_token: ACCESS_TOKEN,
    },
  });

  console.log(`✅ Campanha criada: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// CRIAR CONJUNTO DE ANÚNCIOS (AD SET)
// ──────────────────────────────────────────────

/**
 * Cria o conjunto de anúncios com segmentação e orçamento
 */
async function criarAdSet(campanhaId, nomeAdSet, orcamentoDiario = 1000) {
  // orcamentoDiario em centavos (1000 = R$10,00)
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/adsets`;
  const amanhaCedo = new Date();
  amanhaCedo.setDate(amanhaCedo.getDate() + 1);
  amanhaCedo.setHours(8, 0, 0, 0);

  console.log(`\n🎯 Criando Ad Set: "${nomeAdSet}"...`);
  console.log(`   💰 Orçamento: R$${(orcamentoDiario / 100).toFixed(2)}/dia`);
  console.log(`   📍 Raio: 5km | Idade: 18-45 anos`);

  const response = await axios.post(url, {
    name: nomeAdSet,
    campaign_id: campanhaId,
    daily_budget: orcamentoDiario,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: SEGMENTACAO_PADRAO,
    start_time: Math.floor(amanhaCedo.getTime() / 1000),
    status: "PAUSED",
    access_token: ACCESS_TOKEN,
  }, {
    params: { access_token: ACCESS_TOKEN },
  });

  console.log(`✅ Ad Set criado: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// CRIAR CREATIVE (CRIATIVO DO ANÚNCIO)
// ──────────────────────────────────────────────

/**
 * Cria o criativo visual do anúncio
 */
async function criarCreativo(nomeCreativo, imageUrl, titulo, corpo, cta = "ORDER_NOW") {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/adcreatives`;

  console.log(`\n🎨 Criando criativo: "${nomeCreativo}"...`);

  const response = await axios.post(url, {
    name: nomeCreativo,
    object_story_spec: {
      page_id: process.env.FB_PAGE_ID || IG_USER_ID, // Usar Page ID do Facebook
      instagram_actor_id: IG_USER_ID,
      link_data: {
        image_url: imageUrl,
        link: ORDER_LINK,
        message: corpo,
        name: titulo,
        call_to_action: {
          type: cta, // ORDER_NOW, LEARN_MORE, SHOP_NOW
          value: { link: ORDER_LINK },
        },
      },
    },
    access_token: ACCESS_TOKEN,
  }, {
    params: { access_token: ACCESS_TOKEN },
  });

  console.log(`✅ Criativo criado: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// CRIAR ANÚNCIO (AD)
// ──────────────────────────────────────────────

/**
 * Cria o anúncio vinculando o criativo ao Ad Set
 */
async function criarAnuncio(adSetId, creativoId, nomeAnuncio) {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/ads`;

  console.log(`\n📱 Criando anúncio: "${nomeAnuncio}"...`);

  const response = await axios.post(url, {
    name: nomeAnuncio,
    adset_id: adSetId,
    creative: { creative_id: creativoId },
    status: "PAUSED",
    access_token: ACCESS_TOKEN,
  }, {
    params: { access_token: ACCESS_TOKEN },
  });

  console.log(`✅ Anúncio criado: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// FLUXO COMPLETO - CRIAR CAMPANHA COMPLETA
// ──────────────────────────────────────────────

/**
 * Cria uma campanha completa pronta para ativar
 * @param {object} config - Configurações do anúncio
 */
async function criarCampanhaCompleta(config = {}) {
  const {
    nomeCampanha = `${BUSINESS_NAME} - Pedidos Online`,
    imageUrl,
    titulo = "🍔 Peça seu Bruthus Burger Agora!",
    corpo = "Smash artesanal suculento esperando por você. Entrega rápida na sua região! Peça agora pelo site.",
    orcamentoDiario = 1000, // R$10,00/dia em centavos
  } = config;

  validarConfig();

  if (!imageUrl) {
    throw new Error("❌ imageUrl é obrigatório para criar o anúncio");
  }

  try {
    console.log("\n" + "═".repeat(55));
    console.log("📣 BRUTHUS BURGER - CRIAÇÃO DE CAMPANHA META ADS");
    console.log("═".repeat(55));

    const timestamp = new Date().toISOString().slice(0, 10);

    // 1. Campanha
    const campanhaId = await criarCampanha(`${nomeCampanha} - ${timestamp}`);

    // 2. Ad Set
    const adSetId = await criarAdSet(
      campanhaId,
      `AdSet Pedidos - 5km - 18-45 anos - ${timestamp}`,
      orcamentoDiario
    );

    // 3. Criativo
    const creativoId = await criarCreativo(
      `Criativo Burger - ${timestamp}`,
      imageUrl,
      titulo,
      corpo
    );

    // 4. Anúncio
    const anuncioId = await criarAnuncio(adSetId, creativoId, `Anúncio Bruthus - ${timestamp}`);

    const resultado = {
      campanhaId,
      adSetId,
      creativoId,
      anuncioId,
      status: "PAUSED - Pronto para ativar",
      orcamentoDiario: `R$${(orcamentoDiario / 100).toFixed(2)}/dia`,
      linkDestino: ORDER_LINK,
      criadoEm: new Date().toISOString(),
    };

    // Salva log
    const logPath = path.resolve(__dirname, "../generated/promotions/ads_log.json");
    const logs = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
    logs.push(resultado);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    console.log("\n" + "═".repeat(55));
    console.log("✅ CAMPANHA CRIADA COM SUCESSO! (status: PAUSADA)");
    console.log("─".repeat(55));
    console.log(`📣 Campanha ID  : ${campanhaId}`);
    console.log(`🎯 Ad Set ID    : ${adSetId}`);
    console.log(`🎨 Criativo ID  : ${creativoId}`);
    console.log(`📱 Anúncio ID   : ${anuncioId}`);
    console.log(`💰 Orçamento    : R$${(orcamentoDiario / 100).toFixed(2)}/dia`);
    console.log(`🔗 Destino      : ${ORDER_LINK}`);
    console.log("─".repeat(55));
    console.log("⚠️  ATIVAR no Gerenciador de Anúncios da Meta após revisão");
    console.log("═".repeat(55) + "\n");

    return resultado;
  } catch (error) {
    console.error("\n❌ ERRO AO CRIAR CAMPANHA:", error.response?.data || error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────
// RELATÓRIO DE PERFORMANCE
// ──────────────────────────────────────────────

/**
 * Busca métricas de performance dos anúncios ativos
 */
async function relatorioPerformance(diasAtras = 7) {
  validarConfig();

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - diasAtras);
  const dataFim = new Date();

  const formatDate = (d) => d.toISOString().slice(0, 10);

  console.log(`\n📊 Relatório de performance (últimos ${diasAtras} dias)...\n`);

  const response = await axios.get(`${GRAPH_API}/${AD_ACCOUNT_ID}/insights`, {
    params: {
      fields: "campaign_name,impressions,clicks,ctr,spend,actions",
      time_range: JSON.stringify({
        since: formatDate(dataInicio),
        until: formatDate(dataFim),
      }),
      level: "campaign",
      access_token: ACCESS_TOKEN,
    },
  });

  const dados = response.data.data;

  if (!dados || dados.length === 0) {
    console.log("📭 Nenhum dado de performance encontrado para o período.");
    return [];
  }

  console.log("═".repeat(55));
  dados.forEach((camp) => {
    const cliques = parseInt(camp.clicks || 0);
    const impressoes = parseInt(camp.impressions || 0);
    const gasto = parseFloat(camp.spend || 0);
    const cpc = cliques > 0 ? (gasto / cliques).toFixed(2) : "—";
    const ctr = camp.ctr ? `${parseFloat(camp.ctr).toFixed(2)}%` : "—";

    const linkClicks = (camp.actions || []).find((a) => a.action_type === "link_click");

    console.log(`\n📣 ${camp.campaign_name}`);
    console.log(`   👁️  Impressões: ${impressoes.toLocaleString("pt-BR")}`);
    console.log(`   🖱️  Cliques   : ${cliques.toLocaleString("pt-BR")}`);
    console.log(`   📈 CTR       : ${ctr}`);
    console.log(`   💰 Gasto     : R$${gasto.toFixed(2)}`);
    console.log(`   💵 CPC       : R$${cpc}`);
    if (linkClicks) console.log(`   🔗 Cliques no link: ${linkClicks.value}`);
  });
  console.log("\n" + "═".repeat(55));

  return dados;
}

// Execução direta
if (require.main === module) {
  const comando = process.argv[2];

  if (comando === "relatorio") {
    relatorioPerformance(7).catch(console.error);
  } else {
    const imageUrl = process.argv[2] || "https://via.placeholder.com/1080x1080";
    criarCampanhaCompleta({ imageUrl }).catch(console.error);
  }
}

module.exports = { criarCampanhaCompleta, relatorioPerformance, criarCampanha, criarAdSet };
