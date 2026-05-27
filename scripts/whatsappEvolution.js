const axios = require("axios");

const BASE_URL  = process.env.EVOLUTION_API_URL;
const API_KEY   = process.env.EVOLUTION_API_KEY;
const INSTANCE  = process.env.EVOLUTION_INSTANCE;
const DRY_RUN   = process.env.EVOLUTION_DRY_RUN === "1" || !BASE_URL || !API_KEY || !INSTANCE;
const DELAY_MS  = Number(process.env.EVOLUTION_DELAY_MS || 4000);

function configurado() {
  return Boolean(BASE_URL && API_KEY && INSTANCE);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizarNumero(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.startsWith("55") ? digitos : "55" + digitos;
}

async function enviarTexto(telefone, mensagem, { delay = DELAY_MS } = {}) {
  const numero = normalizarNumero(telefone);
  if (!numero) throw new Error("Telefone inválido");
  if (!mensagem || !mensagem.trim()) throw new Error("Mensagem vazia");

  if (DRY_RUN) {
    console.log(`[Evolution DRY-RUN] → ${numero}\n${mensagem}\n`);
    return { ok: true, dryRun: true, numero };
  }

  const url = `${BASE_URL.replace(/\/$/, "")}/message/sendText/${INSTANCE}`;
  const body = {
    number: numero,
    text:   mensagem,
    options: { delay: 1200, presence: "composing", linkPreview: true },
  };

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const { data } = await axios.post(url, body, {
        headers: { apikey: API_KEY, "Content-Type": "application/json" },
        timeout: 15000,
      });
      if (delay) await sleep(delay);
      return { ok: true, response: data, numero };
    } catch (e) {
      ultimoErro = e.response?.data?.message || e.response?.data || e.message;
      console.warn(`[Evolution] tentativa ${tentativa} falhou para ${numero}:`, ultimoErro);
      if (e.response?.status === 401) break;
      await sleep(2000 * tentativa);
    }
  }
  throw new Error(`Falha ao enviar para ${numero}: ${JSON.stringify(ultimoErro)}`);
}

async function statusInstancia() {
  if (!configurado()) return { configurado: false, dryRun: DRY_RUN };
  try {
    const { data } = await axios.get(
      `${BASE_URL.replace(/\/$/, "")}/instance/connectionState/${INSTANCE}`,
      { headers: { apikey: API_KEY }, timeout: 8000 }
    );
    return { configurado: true, dryRun: false, instancia: INSTANCE, ...data };
  } catch (e) {
    return { configurado: true, dryRun: false, erro: e.response?.data || e.message };
  }
}

module.exports = { enviarTexto, statusInstancia, normalizarNumero, configurado, DRY_RUN };
