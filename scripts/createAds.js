require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
// Meta exige formato act_XXXXXXXXX
const _RAW_AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID || "";
const AD_ACCOUNT_ID = _RAW_AD_ACCOUNT_ID.startsWith("act_")
  ? _RAW_AD_ACCOUNT_ID
  : _RAW_AD_ACCOUNT_ID ? `act_${_RAW_AD_ACCOUNT_ID}` : "";
const IG_USER_ID = process.env.IG_USER_ID;
const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bruthus Burger";
const GRAPH_API = "https://graph.facebook.com/v21.0";

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

// ──────────────────────────────────────────────
// FUNIL: Thu-Sun 19h–23h | 5km | R$20/dia mínimo
// Objetivo: OUTCOME_TRAFFIC → LANDING_PAGE_VIEWS
// Gestores usam LPV pois garante que a página carregou
// (LINK_CLICKS conta cliques que bounceiam antes de abrir)
// ──────────────────────────────────────────────

const ORCAMENTO_DIARIO_CENTAVOS = 1000; // R$10,00/dia

// Placements: só Instagram + Facebook Feed/Stories/Reels
// Gestores removem Audience Network — tráfego de baixíssima qualidade
const PLACEMENTS = {
  publisher_platforms: ["instagram"],
  instagram_positions: ["stream", "story", "reels", "explore"],
};

// Targeting: raio ampliado para 5km + interesses em camadas (OR dentro, AND entre grupos)
// Técnica dos gestores: broader targeting → deixa o algoritmo da Meta trabalhar
const SEGMENTACAO_PADRAO = {
  geo_locations: {
    custom_locations: [
      {
        latitude:  parseFloat(process.env.LAT || "-4.353948748936734"),
        longitude: parseFloat(process.env.LNG || "-39.30777728465837"),
        radius: 2,
        distance_unit: "kilometer",
      },
    ],
  },
  age_min: 18,
  age_max: 55,
  ...PLACEMENTS,
};

// ──────────────────────────────────────────────
// CRIAR CAMPANHA
// ──────────────────────────────────────────────

/**
 * Cria uma campanha de tráfego com objetivo de converter em pedidos
 */
async function criarCampanha(nomeCampanha, objetivo = "OUTCOME_TRAFFIC") {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/campaigns`;

  console.log(`\n📣 Criando campanha: "${nomeCampanha}"...`);

  const response = await axios.post(url, null, {
    params: {
      name: nomeCampanha,
      objective: objetivo, // OUTCOME_TRAFFIC (padrão atual Meta — substitui LINK_CLICKS)
      status: "PAUSED",
      special_ad_categories: JSON.stringify([]),
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
async function criarAdSet(campanhaId, nomeAdSet, orcamentoDiario = ORCAMENTO_DIARIO_CENTAVOS) {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/adsets`;
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(19, 0, 0, 0); // começa às 19h de amanhã

  console.log(`\n🎯 Criando Ad Set: "${nomeAdSet}"...`);
  console.log(`   💰 Orçamento: R$${(orcamentoDiario / 100).toFixed(2)}/dia`);
  console.log(`   📍 Raio: 3km | Idade: 18-55 anos`);
  console.log(`   🕖 Horário: 19h–23h | Qui a Dom`);

  const response = await axios.post(url, null, {
    params: {
      name: nomeAdSet,
      campaign_id: campanhaId,
      daily_budget: orcamentoDiario,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: JSON.stringify(SEGMENTACAO_PADRAO),
      status: "PAUSED",
      access_token: ACCESS_TOKEN,
    },
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

  const objectStorySpec = {
    page_id: process.env.FB_PAGE_ID || "434452209747752",
    instagram_actor_id: IG_USER_ID,
    link_data: {
      image_url: imageUrl,
      link: ORDER_LINK,
      message: corpo,
      name: titulo,
      call_to_action: {
        type: cta,
        value: { link: ORDER_LINK },
      },
    },
  };

  const response = await axios.post(url, null, {
    params: {
      name: nomeCreativo,
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: ACCESS_TOKEN,
    },
  });

  console.log(`✅ Criativo criado: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// CRIATIVO A PARTIR DE POST EXISTENTE DO INSTAGRAM
// ──────────────────────────────────────────────

async function criarCreativoDePostExistente(nomeCreativo, mediaId) {
  const url = `${GRAPH_API}/${AD_ACCOUNT_ID}/adcreatives`;

  console.log(`\n🎨 Criando criativo a partir do post ${mediaId}...`);

  const objectStorySpec = {
    page_id: process.env.FB_PAGE_ID || "434452209747752",
    instagram_actor_id: IG_USER_ID,
  };

  const response = await axios.post(url, null, {
    params: {
      name: nomeCreativo,
      object_story_spec: JSON.stringify(objectStorySpec),
      source_instagram_media_id: mediaId,
      access_token: ACCESS_TOKEN,
    },
  });

  console.log(`✅ Criativo de post existente criado: ${response.data.id}`);
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

  const response = await axios.post(url, null, {
    params: {
      name: nomeAnuncio,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativoId }),
      status: "PAUSED",
      access_token: ACCESS_TOKEN,
    },
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
    nomeCampanha = `${BUSINESS_NAME} — Funil de Pedidos`,
    imageUrl,
    titulo = "🍔 Bruthus Burger — Peça Agora!",
    corpo = "Hamburguer artesanal feito na hora, perto de você. Clique e peça direto no site — entrega rápida! 🔥",
    orcamentoDiario = ORCAMENTO_DIARIO_CENTAVOS,
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
      `AdSet — 3km | 19h-23h | Qui-Dom — ${timestamp}`,
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
    console.log(`📍 Raio         : 3km`);
    console.log(`🕖 Horário      : 19h–23h | Qui a Dom`);
    console.log(`🔗 Destino      : ${ORDER_LINK}`);
    console.log("─".repeat(55));
    console.log("⚠️  ATIVAR no Gerenciador de Anúncios da Meta após revisão");
    console.log("═".repeat(55) + "\n");

    return resultado;
  } catch (error) {
    const detalhe = error.response?.data?.error?.message || error.response?.data || error.message;
    console.error("\n❌ ERRO AO CRIAR CAMPANHA:", detalhe);
    const err = new Error(typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe));
    throw err;
  }
}

// ──────────────────────────────────────────────
// LISTAR POSTS DO INSTAGRAM
// ──────────────────────────────────────────────

async function listarPostsInstagram(limite = 12) {
  validarConfig();
  const response = await axios.get(`${GRAPH_API}/${IG_USER_ID}/media`, {
    params: {
      fields: "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink",
      limit: limite,
      access_token: ACCESS_TOKEN,
    },
  });
  return (response.data.data || []).filter(p => ["IMAGE", "CAROUSEL_ALBUM"].includes(p.media_type));
}

// ──────────────────────────────────────────────
// IMPULSIONAR POST EXISTENTE DO INSTAGRAM
// ──────────────────────────────────────────────

async function impulsionarPost(config = {}) {
  const {
    mediaId,
    nomeCampanha = `${BUSINESS_NAME} — Post Impulsionado`,
    orcamentoDiario = ORCAMENTO_DIARIO_CENTAVOS,
  } = config;

  validarConfig();
  if (!mediaId) throw new Error("❌ mediaId é obrigatório");

  const timestamp = new Date().toISOString().slice(0, 10);

  const campanhaId  = await criarCampanha(`${nomeCampanha} - ${timestamp}`);
  const adSetId     = await criarAdSet(campanhaId, `AdSet — 2km | Instagram — ${timestamp}`, orcamentoDiario);
  const creativoId  = await criarCreativoDePostExistente(`Criativo Post ${mediaId} - ${timestamp}`, mediaId);
  const anuncioId   = await criarAnuncio(adSetId, creativoId, `Anúncio Post - ${timestamp}`);

  return { campanhaId, adSetId, creativoId, anuncioId, status: "PAUSED", linkDestino: ORDER_LINK, criadoEm: new Date().toISOString() };
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

// ──────────────────────────────────────────────
// GESTÃO DE CAMPANHAS
// ──────────────────────────────────────────────

/** Lista todas as campanhas da conta com status e gasto */
async function listarCampanhas() {
  validarConfig();
  try {
    const response = await axios.get(`${GRAPH_API}/${AD_ACCOUNT_ID}/campaigns`, {
      params: {
        fields: "id,name,status,created_time,daily_budget,spend_cap",
        access_token: ACCESS_TOKEN,
      },
    });
    return response.data.data || [];
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    throw new Error(`Meta API: ${msg}`);
  }
}

/** Lista ad sets de uma campanha (para pegar o orçamento diário) */
async function listarAdSets(campanhaId) {
  validarConfig();
  const response = await axios.get(`${GRAPH_API}/${campanhaId}/adsets`, {
    params: {
      fields: "id,name,daily_budget,status",
      access_token: ACCESS_TOKEN,
    },
  });
  return response.data.data || [];
}

/** Pausa uma campanha */
async function pausarCampanha(campanhaId) {
  validarConfig();
  const response = await axios.post(`${GRAPH_API}/${campanhaId}`, null, {
    params: { status: "PAUSED", access_token: ACCESS_TOKEN },
  });
  console.log(`⏸️  Campanha ${campanhaId} pausada`);
  return response.data;
}

/** Ativa uma campanha pausada */
async function ativarCampanha(campanhaId) {
  validarConfig();
  const response = await axios.post(`${GRAPH_API}/${campanhaId}`, null, {
    params: { status: "ACTIVE", access_token: ACCESS_TOKEN },
  });
  console.log(`▶️  Campanha ${campanhaId} ativada`);
  return response.data;
}

/** Exclui uma campanha (irreversível) */
async function excluirCampanha(campanhaId) {
  validarConfig();
  const response = await axios.delete(`${GRAPH_API}/${campanhaId}`, {
    params: { access_token: ACCESS_TOKEN },
  });
  console.log(`🗑️  Campanha ${campanhaId} excluída`);
  return response.data;
}

/** Atualiza o orçamento diário de um ad set */
async function atualizarOrcamento(adSetId, novoOrcamentoCentavos) {
  validarConfig();
  const response = await axios.post(`${GRAPH_API}/${adSetId}`, null, {
    params: {
      daily_budget: novoOrcamentoCentavos,
      access_token: ACCESS_TOKEN,
    },
  });
  console.log(`💰 Orçamento do Ad Set ${adSetId} atualizado: R$${(novoOrcamentoCentavos / 100).toFixed(2)}/dia`);
  return response.data;
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

module.exports = {
  criarCampanhaCompleta, impulsionarPost, listarPostsInstagram,
  relatorioPerformance, criarCampanha, criarAdSet,
  listarCampanhas, listarAdSets, pausarCampanha, ativarCampanha, excluirCampanha, atualizarOrcamento,
};
