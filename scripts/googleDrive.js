// ──────────────────────────────────────────────
// googleDrive.js — Sincroniza fotos do Google Drive para o Cloudinary
//
// SETUP:
// 1. Crie um projeto no Google Cloud Console
// 2. Ative a Google Drive API
// 3. Crie uma Service Account e baixe o JSON de credenciais
// 4. Defina GOOGLE_SERVICE_ACCOUNT_JSON=<conteúdo do JSON> no Render
// 5. Defina GOOGLE_DRIVE_FOLDER_ID=<ID da pasta do Drive> no Render
// 6. Compartilhe a pasta do Drive com o e-mail da Service Account
// ──────────────────────────────────────────────

const { google } = require("googleapis");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CLOUD_NAME   = process.env.CLOUDINARY_CLOUD_NAME  || "duchjjeaw";
const CLOUD_KEY    = process.env.CLOUDINARY_API_KEY;
const CLOUD_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUD_FOLDER = process.env.CLOUDINARY_STORY_FOLDER || "midias bruthus geral";

const SYNC_FILE = path.resolve(__dirname, "../data/drive_sync.json");

// ── Helpers de estado de sincronização ─────────────────────────────────────

function lerSync() {
  try {
    if (fs.existsSync(SYNC_FILE)) return JSON.parse(fs.readFileSync(SYNC_FILE, "utf-8"));
  } catch { /* ignora */ }
  return { sincronizados: [], ultimaSync: null };
}

function salvarSync(estado) {
  fs.writeFileSync(SYNC_FILE, JSON.stringify(estado, null, 2));
}

// ── Auth Google Drive via Service Account ─────────────────────────────────

function criarAuthDrive() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado no Render");

  let creds;
  try {
    creds = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

// ── Lista arquivos de imagem na pasta do Drive ────────────────────────────

async function listarArquivosDrive(folderId) {
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID não configurado");

  const drive = criarAuthDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType, size, createdTime, modifiedTime)",
    orderBy: "createdTime desc",
    pageSize: 200,
  });
  return res.data.files || [];
}

// ── Faz upload de um arquivo Drive para o Cloudinary ──────────────────────

async function uploadParaCloudinary(drive, arquivo) {
  if (!CLOUD_KEY || !CLOUD_SECRET) throw new Error("CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET não configurados");

  // Baixa o conteúdo do arquivo como stream
  const response = await drive.files.get(
    { fileId: arquivo.id, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(response.data);
  const base64 = buffer.toString("base64");
  const dataUri = `data:${arquivo.mimeType};base64,${base64}`;

  // Assina a requisição para o Cloudinary
  const timestamp = Math.round(Date.now() / 1000);
  const publicId  = `drive_${arquivo.id}`;

  // Parâmetros para assinar (em ordem alfabética, sem api_key e file)
  const paramsStr = `asset_folder=${encodeParamCloudinary(CLOUD_FOLDER)}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(paramsStr + CLOUD_SECRET).digest("hex");

  const formData = new URLSearchParams();
  formData.append("file",         dataUri);
  formData.append("api_key",      CLOUD_KEY);
  formData.append("timestamp",    String(timestamp));
  formData.append("signature",    signature);
  formData.append("public_id",    publicId);
  formData.append("asset_folder", CLOUD_FOLDER);

  const r = await axios.post(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    formData.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return {
    publicId:  r.data.public_id,
    url:       r.data.secure_url,
    width:     r.data.width,
    height:    r.data.height,
    bytes:     r.data.bytes,
  };
}

function encodeParamCloudinary(str) {
  // Cloudinary assina com os valores crus (não encoded) — mantemos igual
  return str;
}

// ── Sincronização principal ────────────────────────────────────────────────

async function sincronizarDriveParaCloudinary() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID não configurado no Render");

  const drive    = criarAuthDrive();
  const estado   = lerSync();
  const jaSync   = new Set(estado.sincronizados.map(s => s.driveId));

  // Lista todos os arquivos na pasta
  const arquivos = await listarArquivosDrive(folderId);
  const novos    = arquivos.filter(a => !jaSync.has(a.id));

  const resultados = [];
  const erros      = [];

  for (const arq of novos) {
    try {
      console.log(`☁️  Enviando para Cloudinary: ${arq.name}`);
      const resultado = await uploadParaCloudinary(drive, arq);
      estado.sincronizados.push({
        driveId:   arq.id,
        nome:      arq.name,
        publicId:  resultado.publicId,
        url:       resultado.url,
        syncEm:    new Date().toISOString(),
      });
      resultados.push({ nome: arq.name, publicId: resultado.publicId, url: resultado.url });
    } catch (e) {
      console.error(`❌ Erro ao sincronizar ${arq.name}:`, e.message);
      erros.push({ nome: arq.name, erro: e.message });
    }
  }

  estado.ultimaSync = new Date().toISOString();
  salvarSync(estado);

  return {
    totalNaPasta:   arquivos.length,
    jaExistiam:     arquivos.length - novos.length,
    novosEnviados:  resultados.length,
    erros:          erros.length,
    arquivosNovos:  resultados,
    arquivosErro:   erros,
    ultimaSync:     estado.ultimaSync,
  };
}

// ── Status rápido (sem sincronizar) ─────────────────────────────────────

async function statusSync() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const estado   = lerSync();

  let totalNaPasta = null;
  let erroDrive    = null;

  try {
    if (folderId) {
      const arquivos = await listarArquivosDrive(folderId);
      totalNaPasta = arquivos.length;
    }
  } catch (e) {
    erroDrive = e.message;
  }

  return {
    configurado:    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!folderId,
    folderId:       folderId || null,
    totalNaPasta,
    totalSincronizados: estado.sincronizados.length,
    ultimaSync:     estado.ultimaSync,
    pendentes:      totalNaPasta !== null
      ? totalNaPasta - estado.sincronizados.filter(s => {
          return totalNaPasta; // simplificado
        }).length
      : null,
    erroDrive,
    fotos: estado.sincronizados,
  };
}

module.exports = { sincronizarDriveParaCloudinary, statusSync, listarArquivosDrive };
