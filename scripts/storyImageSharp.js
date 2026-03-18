// ──────────────────────────────────────────────
// storyImageSharp.js — Gera stories com Sharp + SVG
// ──────────────────────────────────────────────

const sharp    = require("sharp");
const axios    = require("axios");
const crypto   = require("crypto");
const FormData = require("form-data");

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "duchjjeaw";
const CLOUD_KEY  = process.env.CLOUDINARY_API_KEY;
const CLOUD_SEC  = process.env.CLOUDINARY_API_SECRET;
const IG_HANDLE  = process.env.INSTAGRAM_HANDLE || "@bruthus_burger";

// ──────────────────────────────────────────────
// 1. Baixa foto do Cloudinary
// ──────────────────────────────────────────────
async function baixarFoto(publicId) {
  const tentativas = [
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_jpg/${publicId}`,
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}.jpg`,
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}`,
  ];

  for (const url of tentativas) {
    try {
      console.log(`   📥 Baixando: ${url}`);
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
      if (res.data && res.data.byteLength > 500) {
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
// 2. Escapa XML
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
// 3. SVG premium — layout de grande hamburgueria
// ──────────────────────────────────────────────
function gerarSVG({ principal, secundario, tipo = "teaser" }) {
  const W = 1080;
  const H = 1920;

  // ── Gradientes ──
  const defs = `
    <defs>
      <!-- Gradiente suave na parte inferior -->
      <linearGradient id="gradBottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
        <stop offset="50%"  stop-color="#000000" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.90"/>
      </linearGradient>
      <!-- Gradiente sutil no topo -->
      <linearGradient id="gradTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>`;

  // ── Overlays ──
  const gradBottom = `<rect x="0" y="${H - 820}" width="${W}" height="820" fill="url(#gradBottom)"/>`;
  const gradTop    = `<rect x="0" y="0" width="${W}" height="260" fill="url(#gradTop)"/>`;

  // ── Badge topo: BRUTHUS BURGER ──
  const topBadge = `
    <rect x="340" y="110" width="400" height="58" rx="29"
      fill="#f97316" opacity="0.95"/>
    <text x="${W/2}" y="148"
      text-anchor="middle"
      font-family="'DejaVu Sans', Arial, sans-serif"
      font-size="26" font-weight="bold" letter-spacing="4"
      fill="#ffffff">BRUTHUS BURGER</text>`;

  // ── Linha divisória decorativa ──
  const divider = `
    <line x1="160" y1="${H - 430}" x2="${W - 160}" y2="${H - 430}"
      stroke="#f97316" stroke-width="2" opacity="0.6"/>`;

  // ── Texto principal (headline) ──
  // textLength garante que nunca ultrapassa a largura segura
  const headline = principal ? `
    <text x="${W/2}" y="${H - 360}"
      text-anchor="middle"
      font-family="'DejaVu Sans', Arial, sans-serif"
      font-size="100" font-weight="bold"
      textLength="940" lengthAdjust="spacingAndGlyphs"
      fill="#f97316"
      stroke="#000000" stroke-width="6" paint-order="stroke"
    >${esc(principal)}</text>` : "";

  // ── Texto secundário ──
  const subtitulo = secundario ? `
    <text x="${W/2}" y="${H - 240}"
      text-anchor="middle"
      font-family="'DejaVu Sans', Arial, sans-serif"
      font-size="48"
      textLength="880" lengthAdjust="spacingAndGlyphs"
      fill="#ffffff"
      stroke="#000000" stroke-width="3" paint-order="stroke"
    >${esc(secundario)}</text>` : "";

  // ── Instagram handle ──
  const handle = `
    <rect x="330" y="${H - 185}" width="420" height="62" rx="31"
      fill="rgba(0,0,0,0.55)" stroke="#f97316" stroke-width="2.5"/>
    <text x="${W/2}" y="${H - 146}"
      text-anchor="middle"
      font-family="'DejaVu Sans', Arial, sans-serif"
      font-size="34" font-weight="bold"
      fill="#f97316">${esc(IG_HANDLE)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs}
    ${gradTop}
    ${gradBottom}
    ${topBadge}
    ${divider}
    ${headline}
    ${subtitulo}
    ${handle}
  </svg>`;
}

// ──────────────────────────────────────────────
// 4. Upload para Cloudinary
// ──────────────────────────────────────────────
async function uploadCloudinary(buffer, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign    = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}${CLOUD_SEC}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file",      buffer, { filename: "story.jpg", contentType: "image/jpeg" });
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key",   CLOUD_KEY);
  form.append("signature", signature);
  form.append("overwrite", "true");

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

  const fotoBuffer  = await baixarFoto(publicId);
  const svg         = gerarSVG(opts);
  const svgBuffer   = Buffer.from(svg);

  const finalBuffer = await sharp(fotoBuffer)
    .resize(1080, 1920, { fit: "cover", position: "centre" })
    .composite([{ input: svgBuffer, blend: "over" }])
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log("   ✅ Imagem composta");

  const storyId = `bruthus/stories/story_${Date.now()}`;
  const url     = await uploadCloudinary(finalBuffer, storyId);
  console.log(`   ✅ Upload feito: ${url}`);

  return url;
}

module.exports = { gerarStoryImagem };
