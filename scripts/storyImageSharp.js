// ──────────────────────────────────────────────
// storyImageSharp.js — Gera stories com Sharp + SVG
// Fluxo: baixa foto do Cloudinary → compõe com Sharp → faz upload → retorna URL
// ──────────────────────────────────────────────

const sharp   = require("sharp");
const axios   = require("axios");
const crypto  = require("crypto");
const FormData = require("form-data");

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "duchjjeaw";
const CLOUD_KEY  = process.env.CLOUDINARY_API_KEY;
const CLOUD_SEC  = process.env.CLOUDINARY_API_SECRET;

// ──────────────────────────────────────────────
// 1. Baixa foto do Cloudinary já redimensionada
// ──────────────────────────────────────────────
async function baixarFoto(publicId) {
  // Baixa imagem original sem transformações — Sharp cuida do redimensionamento
  // Tenta com .jpg primeiro, depois sem extensão
  const tentativas = [
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_jpg/${publicId}`,
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}.jpg`,
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}`,
  ];

  for (const url of tentativas) {
    try {
      console.log(`   📥 Baixando: ${url}`);
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
      if (res.data && res.data.byteLength > 0) {
        console.log(`   ✅ Imagem baixada (${(res.data.byteLength / 1024).toFixed(0)} KB)`);
        return Buffer.from(res.data);
      }
    } catch (e) {
      console.warn(`   ⚠️ Falhou: ${url} — ${e.message}`);
    }
  }
  throw new Error(`Não foi possível baixar a imagem: ${publicId}`);
}

// ──────────────────────────────────────────────
// 2. Escapa caracteres especiais XML
// ──────────────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ──────────────────────────────────────────────
// 3. Gera SVG overlay com gradiente + textos
// ──────────────────────────────────────────────
function gerarSVG({ principal, secundario, link, cor = "white" }) {
  const W = 1080;
  const H = 1920;

  const corHex = cor === "white"         ? "#ffffff"
               : cor.startsWith("rgb:") ? `#${cor.slice(4)}`
               : `#${cor}`;

  const svgParts = [];

  // Gradiente escuro na parte inferior
  svgParts.push(`
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${H - 750}" width="${W}" height="750" fill="url(#grad)"/>
  `);

  // Texto principal
  if (principal) {
    svgParts.push(`
      <text
        x="${W / 2}" y="${H - 380}"
        text-anchor="middle"
        font-family="'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"
        font-size="88" font-weight="bold"
        fill="${corHex}"
        stroke="#000000" stroke-width="4" paint-order="stroke"
      >${esc(principal)}</text>
    `);
  }

  // Texto secundário
  if (secundario) {
    svgParts.push(`
      <text
        x="${W / 2}" y="${H - 255}"
        text-anchor="middle"
        font-family="'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"
        font-size="50" font-weight="bold"
        fill="#ffffff"
        stroke="#000000" stroke-width="3" paint-order="stroke"
      >${esc(secundario)}</text>
    `);
  }

  // Link clicável (laranja)
  if (link) {
    const linkDisplay = link.replace(/^https?:\/\//, "");
    svgParts.push(`
      <text
        x="${W / 2}" y="${H - 140}"
        text-anchor="middle"
        font-family="'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"
        font-size="40" font-weight="bold"
        fill="#f97316"
        stroke="#000000" stroke-width="2" paint-order="stroke"
      >${esc(linkDisplay)}</text>
    `);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svgParts.join("")}</svg>`;
}

// ──────────────────────────────────────────────
// 4. Faz upload do buffer para o Cloudinary
// ──────────────────────────────────────────────
async function uploadCloudinary(buffer, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign    = `public_id=${publicId}&timestamp=${timestamp}${CLOUD_SEC}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file",       buffer, { filename: "story.jpg", contentType: "image/jpeg" });
  form.append("public_id",  publicId);
  form.append("timestamp",  String(timestamp));
  form.append("api_key",    CLOUD_KEY);
  form.append("signature",  signature);
  form.append("overwrite",  "true");

  const res = await axios.post(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    form,
    { headers: form.getHeaders() }
  );

  return res.data.secure_url;
}

// ──────────────────────────────────────────────
// 5. Função principal
// ──────────────────────────────────────────────
async function gerarStoryImagem(publicId, opts = {}) {
  console.log(`\n🎨 Gerando imagem do story com Sharp...`);
  console.log(`   📸 Foto: ${publicId}`);

  // Baixa a foto
  const fotoBuffer = await baixarFoto(publicId);
  console.log("   ✅ Foto baixada");

  // Gera SVG overlay
  const svg       = gerarSVG(opts);
  const svgBuffer = Buffer.from(svg);

  // Redimensiona para 1080x1920 e compõe com Sharp
  const finalBuffer = await sharp(fotoBuffer)
    .resize(1080, 1920, { fit: "cover", position: "north" })
    .composite([{ input: svgBuffer, blend: "over" }])
    .jpeg({ quality: 88 })
    .toBuffer();
  console.log("   ✅ Imagem composta");

  // Faz upload no Cloudinary
  const storyId = `bruthus/stories/story_${Date.now()}`;
  const url     = await uploadCloudinary(finalBuffer, storyId);
  console.log(`   ✅ Upload feito: ${url}`);

  return url;
}

module.exports = { gerarStoryImagem };
