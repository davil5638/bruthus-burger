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
  if (!fotos || fotos.length === 0) return fallbackId;
  return fotos[Math.floor(Math.random() * fotos.length)];
}

/**
 * Encode texto para usar em URL do Cloudinary.
 * O Cloudinary usa underscore no lugar de espaço
 * e precisa de alguns caracteres escapados.
 */
function encodeTexto(text) {
  return text
    .replace(/ /g, "_")
    .replace(/,/g, "%2C")
    .replace(/\//g, "%2F")
    .replace(/:/g, "%3A")
    .replace(/!/g, "\\!")
    .replace(/\?/g, "%3F")
    .replace(/&/g, "%26")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
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
  const { principal, secundario, link } = opts;

  const base = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

  const layers = [];

  // Redimensiona para formato story 9:16 — foto visível no topo
  layers.push("w_1080,h_1920,c_fill,g_north,q_auto,f_jpg");

  // Faixa escura na PARTE INFERIOR — foto do burger fica limpa em cima
  layers.push("l_fetch:aHR0cHM6Ly9yZXMuY2xvdWRpbmFyeS5jb20vc2FtcGxlcy9ibGFja3BuZy5wbmc/dj0x,w_1080,h_620,g_south,o_80,fl_layer_apply");

  // Texto principal — grande, na faixa inferior
  if (principal) {
    layers.push(
      `l_text:Impact_88_bold_center:${encodeTexto(principal)},co_white,g_south,y_400,w_960,fl_layer_apply`
    );
  }

  // Texto secundário — menor, abaixo do principal
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

module.exports = { buildStoryImageUrl, storyTeaser, storyAbertura };
