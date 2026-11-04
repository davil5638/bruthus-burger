const axios = require("axios");

const BASE_URL  = process.env.EVOLUTION_API_URL;
const API_KEY   = process.env.EVOLUTION_API_KEY;
const INSTANCE  = process.env.EVOLUTION_INSTANCE;
const DRY_RUN   = process.env.EVOLUTION_DRY_RUN === "1" || !BASE_URL || !API_KEY || !INSTANCE;
// Pausa entre um envio e o proximo.
//
// Era fixa em 4 segundos: cinco mensagens em vinte segundos, sempre no
// mesmo ritmo. Cadencia regular e um dos sinais que o WhatsApp usa para
// identificar disparo automatico, e aqui o numero e o da operacao — o
// mesmo que recebe pedido. Agora e sorteada entre 1 e 4 minutos, entao
// um lote de 5 leva uns 10 minutos. Para quem opera nao muda nada.
//
// EVOLUTION_DELAY_MS continua funcionando como escape: se estiver
// definida, volta a ser fixa (util em teste, com valor baixo).
const DELAY_FIXO   = process.env.EVOLUTION_DELAY_MS ? Number(process.env.EVOLUTION_DELAY_MS) : null;
const DELAY_MIN_MS = Number(process.env.EVOLUTION_DELAY_MIN_MS || 60000);
const DELAY_MAX_MS = Number(process.env.EVOLUTION_DELAY_MAX_MS || 240000);

function pausaEntreEnvios() {
  if (DELAY_FIXO !== null && !Number.isNaN(DELAY_FIXO)) return DELAY_FIXO;
  const min = Math.min(DELAY_MIN_MS, DELAY_MAX_MS);
  const max = Math.max(DELAY_MIN_MS, DELAY_MAX_MS);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function configurado() {
  return Boolean(BASE_URL && API_KEY && INSTANCE);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizarNumero(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.startsWith("55") ? digitos : "55" + digitos;
}

async function enviarTexto(telefone, mensagem, { delay } = {}) {
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
    // Na v2 estes campos sao de TOPO. O formato antigo `options: { ... }`
    // e da v1: o schema da v2.3.0 so conhece number, text, linkPreview,
    // delay, quoted, everyOne e mentioned. Como ele nao proibe campo
    // extra, "options" era aceito e descartado em silencio — a pausa de
    // digitacao nunca acontecia. "presence" nao existe mais no schema.
    delay: 1200,
    linkPreview: true,
  };

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const { data } = await axios.post(url, body, {
        headers: { apikey: API_KEY, "Content-Type": "application/json" },
        timeout: 15000,
      });
      // Espera DEPOIS de enviar, antes do proximo da fila.
      const espera = delay ?? pausaEntreEnvios();
      if (espera > 0) await sleep(espera);
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

// `configurado()` so diz que as variaveis existem — e isso NAO basta.
// Com o chip despareado a API responde normalmente, mas o estado vem
// "connecting" e cada envio fica pendurado ate estourar o timeout, sem
// erro util. Quem escolhe entre envio automatico e lista manual precisa
// olhar o estado real da conexao, senao falha calado.
async function conectado() {
  if (!configurado()) return false;
  try {
    const s = await statusInstancia();
    return s?.instance?.state === "open";
  } catch {
    return false;
  }
}

module.exports = { enviarTexto, statusInstancia, conectado, normalizarNumero, configurado, DRY_RUN };
