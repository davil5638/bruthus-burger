// ──────────────────────────────────────────────
// storyImage.js — Gera URLs de stories com texto
// overlay via Cloudinary (sem SDK, só URL)
// ──────────────────────────────────────────────

const axios = require("axios");
const CLOUD_NAME    = process.env.CLOUDINARY_CLOUD_NAME || "duchjjeaw";
const CLOUD_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUD_SECRET  = process.env.CLOUDINARY_API_SECRET;
const ORDER_LINK    = process.env.ORDER_LINK || "bruthus-burger.ola.click/products";

// Pasta no Cloudinary com as fotos dos burgers
const STORY_FOLDER  = process.env.CLOUDINARY_STORY_FOLDER || "midias bruthus geral";

// Cache em memória para não bater na API do Cloudinary a cada story
let _fotoCache = [];
let _fotoCacheTs = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

/**
 * Busca todos os public_ids da pasta de stories no Cloudinary.
 * Usa cache de 1h para não sobrecarregar a API.
 */
async function listarFotosStory() {
  const agora = Date.now();
  if (_fotoCache.length > 0 && agora - _fotoCacheTs < CACHE_TTL) {
    return _fotoCache;
  }

  if (!CLOUD_API_KEY || !CLOUD_SECRET) {
    console.warn("⚠️ CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET não configurados — usando foto fixa.");
    return null;
  }

  try {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image`;
    const res = await axios.get(url, {
      auth: { username: CLOUD_API_KEY, password: CLOUD_SECRET },
      params: { type: "upload", prefix: STORY_FOLDER, max_results: 100 },
    });

    const fotos = (res.data.resources || []).map(r => r.public_id);
    if (fotos.length === 0) {
      console.warn("⚠️ Nenhuma foto encontrada na pasta:", STORY_FOLDER);
      return null;
    }

    _fotoCache = fotos;
    _fotoCacheTs = agora;
    console.log(`📸 ${fotos.length} fotos carregadas da pasta "${STORY_FOLDER}"`);
    return fotos;
  } catch (e) {
    console.error("❌ Erro ao listar fotos do Cloudinary:", e.message);
    return null;
  }
}

/**
 * Retorna um public_id aleatório da pasta de stories.
 * Se não conseguir, usa a foto de fallback configurada.
 */
async function sortearFotoStory(fallbackId) {
  const fotos = await listarFotosStory();
  if (!fotos || fotos.length === 0) {
    // Auto-adiciona o prefixo da pasta se o fallback não inclui pasta
    if (fallbackId && !fallbackId.includes('/') && STORY_FOLDER) {
      return `${STORY_FOLDER}/${fallbackId}`;
    }
    return fallbackId;
  }
  return fotos[Math.floor(Math.random() * fotos.length)];
}

// Paleta de cores para variar o texto principal a cada story
const CORES_TEXTO = ["white", "rgb:f97316", "rgb:fbbf24", "rgb:fb923c", "rgb:fdba74"];

/**
 * Gera texto criativo e variado para o story usando OpenAI.
 * Cada chamada retorna textos diferentes — estilos, tons e abordagens distintas.
 *
 * @param {"teaser"|"abertura"} tipo
 * @param {"quinta"|"sexta"|"sabado"|"domingo"} dia
 */
async function gerarTextoStory(tipo, dia) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const DIAS_INFO = {
    quinta:  { label: "quinta-feira", promo: "Quinta do Hambúrguer — promoção especial de hoje" },
    sexta:   { label: "sexta-feira",  promo: "10% OFF com cupom SEXTAOFF10 no site" },
    sabado:  { label: "sábado",       promo: "" },
    domingo: { label: "domingo",      promo: "" },
  };
  const cfg = DIAS_INFO[dia] || DIAS_INFO.quinta;
  const promoTexto = cfg.promo ? `\nPromoção do dia: ${cfg.promo}` : "";

  const instrucaoTipo = tipo === "teaser"
    ? "Avise que hoje tem Bruthus Burger e que abrimos às 18h30. Gere curiosidade, fome, expectativa."
    : "Avise que JÁ ESTAMOS ABERTOS e entregando agora. Tom urgente e animado para o cliente pedir logo.";

  const estilosDisponiveis = [
    "pergunta provocativa curta",
    "exclamação animada e energética",
    "tom quente e acolhedor",
    "humor leve e descontraído",
    "urgência e escassez",
    "descrição sensorial que dá fome",
    "direto e objetivo sem frescura",
  ];
  const estiloEscolhido = estilosDisponiveis[Math.floor(Math.random() * estilosDisponiveis.length)];

  const prompt = `Você cria conteúdo para Instagram Stories de hamburguerias brasileiras. Inspire-se em hamburguerias conhecidas como Madero, Bullguer, Black Skull, Sal Grosso — textos variados, modernos e criativos.

Hamburguria: Bruthus Burger (Fortaleza, CE)
Dia: ${cfg.label}${promoTexto}

Objetivo: ${instrucaoTipo}
Estilo desta vez: ${estiloEscolhido}

REGRAS:
- texto_principal: MÁXIMO 5 palavras — impactante, em maiúsculas, que chame atenção
- texto_secundario: MÁXIMO 12 palavras — complementa o principal com info prática
- Varie bastante: não use sempre "HOJE TEM" ou "ESTAMOS ABERTOS" — seja criativo
- NÃO mencione WhatsApp, só o site
- NÃO use hashtags

Retorne APENAS JSON:
{"texto_principal": "...", "texto_secundario": "..."}`;

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
      temperature: 1.0,
    });
    const content = res.choices[0].message.content.trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      // Cor aleatória da paleta para o texto principal
      const cor = CORES_TEXTO[Math.floor(Math.random() * CORES_TEXTO.length)];
      return { principal: data.texto_principal, secundario: data.texto_secundario, cor };
    }
  } catch (e) {
    console.error("❌ Erro ao gerar texto do story:", e.message);
  }

  // Fallback caso a IA falhe
  const fallbacks = {
    teaser:   { principal: "HOJE TEM BRUTHUS!", secundario: "Das 18h30 — Delivery e Retirada" },
    abertura: { principal: "ESTAMOS ABERTOS!", secundario: "Já entregando agora — peça no site" },
  };
  return { ...fallbacks[tipo], cor: "white" };
}

/**
 * Encode texto para usar em URL do Cloudinary.
 * O Cloudinary usa underscore no lugar de espaço
 * e precisa de alguns caracteres escapados.
 */
function encodeTexto(text) {
  // encodeURIComponent trata acentos e caracteres especiais corretamente
  return encodeURIComponent(text)
    .replace(/%20/g, "_")   // espaço → underscore (padrão Cloudinary)
    .replace(/'/g, "%27");  // apóstrofo extra
}

/**
 * Monta a URL completa com overlays de texto.
 * @param {string} publicId  — public_id da imagem no Cloudinary
 * @param {object} opts
 *   principal    {string} — texto grande, centro da tela
 *   secundario   {string} — texto menor, logo abaixo
 *   link         {string} — URL de pedido, embaixo em laranja
 */
function buildStoryImageUrl(publicId, opts = {}) {
  const { principal, secundario, link, cor = "white" } = opts;

  const base = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;
  const layers = [];

  // Redimensiona para formato story 9:16 — foto visível no topo
  layers.push("w_1080,h_1920,c_fill,g_north,q_auto,f_jpg");

  // Faixa escura na PARTE INFERIOR — fundo preto semitransparente
  layers.push("l_text:Arial_1:x,co_rgb:000000,b_rgb:000000,c_fill,w_1080,h_620,g_south,o_75,fl_layer_apply");

  // Texto principal — grande, cor variável
  if (principal) {
    layers.push(
      `l_text:Impact_88_bold_center:${encodeTexto(principal)},co_${cor},g_south,y_400,w_960,fl_layer_apply`
    );
  }

  // Texto secundário — branco sempre (legibilidade)
  if (secundario) {
    layers.push(
      `l_text:Arial_52_center:${encodeTexto(secundario)},co_white,g_south,y_260,w_920,fl_layer_apply`
    );
  }

  // Link do pedido — laranja, no rodapé
  if (link) {
    const linkDisplay = link.replace("https://", "").replace("http://", "");
    layers.push(
      `l_text:Arial_42_bold_center:${encodeTexto(linkDisplay)},co_rgb:f97316,g_south,y_140,w_920,fl_layer_apply`
    );
  }

  return `${base}/${layers.join("/")}/${publicId}`;
}

/**
 * Story das 16h — Teaser "Hoje tem Bruthus!"
 * Avisa que a loja abre às 18h30
 */
function storyTeaser(publicId) {
  return buildStoryImageUrl(publicId, {
    principal: "HOJE TEM BRUTHUS!",
    secundario: "Das 18h30 - Delivery e Retirada",
    link: null,
  });
}

/**
 * Story das 18h30 — Abertura "Estamos abertos!"
 * Avisa que já estão entregando + link do pedido
 */
function storyAbertura(publicId) {
  const link = ORDER_LINK.replace("https://", "").replace("http://", "");
  return buildStoryImageUrl(publicId, {
    principal: "ESTAMOS ABERTOS!",
    secundario: "Ja estamos entregando",
    link: link,
  });
}

// Teste via terminal: node scripts/storyImage.js meu_public_id
if (require.main === module) {
  const publicId = process.argv[2] || "sample";
  console.log("\n📱 URL Story Teaser (16h):");
  console.log(storyTeaser(publicId));
  console.log("\n📱 URL Story Abertura (18h30):");
  console.log(storyAbertura(publicId));
}

module.exports = { buildStoryImageUrl, storyTeaser, storyAbertura, gerarTextoStory, sortearFotoStory };
