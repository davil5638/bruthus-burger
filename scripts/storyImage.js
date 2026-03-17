// ──────────────────────────────────────────────
// storyImage.js — Gera URLs de stories com texto
// overlay via Cloudinary (sem SDK, só URL)
//
// O Cloudinary aceita transformações direto na URL,
// então não precisamos de token/secret para isso.
// ──────────────────────────────────────────────

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "duchjjeaw";
const ORDER_LINK = process.env.ORDER_LINK || "bruthus-burger.ola.click/products";

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

  // Redimensiona para formato story 9:16
  layers.push("w_1080,h_1920,c_fill,q_auto,f_jpg");

  // Faixa escura semi-transparente no centro para legibilidade
  // (retângulo preto 60% opacidade, cobre a faixa do texto)
  layers.push("l_fetch:aHR0cHM6Ly9yZXMuY2xvdWRpbmFyeS5jb20vc2FtcGxlcy9ibGFja3BuZy5wbmc/dj0x,w_1080,h_700,g_center,o_55,fl_layer_apply");

  // Texto principal — impacto grande no centro
  if (principal) {
    layers.push(
      `l_text:Impact_95_bold_center:${encodeTexto(principal)},co_white,g_center,y_-80,w_960,fl_layer_apply`
    );
  }

  // Texto secundário — menor, logo abaixo do principal
  if (secundario) {
    layers.push(
      `l_text:Arial_52_center:${encodeTexto(secundario)},co_white,g_center,y_60,w_920,fl_layer_apply`
    );
  }

  // Link do pedido — laranja na parte inferior
  if (link) {
    const linkDisplay = link.replace("https://", "").replace("http://", "");
    layers.push(
      `l_text:Arial_44_bold_center:${encodeTexto(linkDisplay)},co_rgb:f97316,g_south,y_220,w_920,fl_layer_apply`
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
