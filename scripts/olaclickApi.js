// ──────────────────────────────────────────────
// olaclickApi.js — cliente de LEITURA da API pública do OlaClick
//
// Só consulta. Não cria, não altera e não apaga nada no OlaClick —
// serve para conferir se o que o webhook registrou bate com o que o
// OlaClick realmente vendeu.
//
// POR QUE ISSO EXISTE:
// O webhook do OlaClick não entrega pedido de marketplace. Em 1.567
// payloads guardados no banco não há UM pedido de iFood. Mas o iFood
// vende: 147 pedidos / R$ 5.397,39 em 30 dias. Essa receita nunca
// entrou no financeiro sozinha; vinha sendo digitada na mão toda
// segunda, arredondada e na categoria errada.
//
// CONFIGURAÇÃO (.env / Render):
//   OLACLICK_API_TOKEN   → credencial da API pública (obrigatório)
//   OLACLICK_AUTH_HEADER → nome do header; padrão "x-api-key"
//   OLACLICK_API_BASE    → padrão "https://public-api.olaclick.app/v1"
//
// Atenção ao host: o certo é public-api.olaclick.app. O api.olaclick.com
// responde 403 a qualquer header — não é esse.
//
// Sem token nada quebra: `configurado()` devolve false e quem chama
// apenas registra um aviso e segue.
// ──────────────────────────────────────────────

const axios = require("axios");

const BASE         = process.env.OLACLICK_API_BASE    || "https://public-api.olaclick.app/v1";
const TOKEN        = process.env.OLACLICK_API_TOKEN   || "";
const AUTH_HEADER  = process.env.OLACLICK_AUTH_HEADER || "x-api-key";
const TIMEZONE     = "America/Fortaleza";

// Canais aceitos pelo filtro `sources` da API (confirmados contra a
// API em 03/11/2026). Mandar um valor fora desta lista devolve 422 e
// derruba a chamada inteira — por isso nada de inventar nome de canal.
const SOURCES_VALIDOS = [
  "inbound", "outbound", "chatbot", "ifood", "rappi", "uber_eats",
];

function configurado() {
  return Boolean(TOKEN);
}

function headers() {
  // Bearer tem formato próprio; qualquer outro header vai o token cru.
  const valor = /^authorization$/i.test(AUTH_HEADER) ? `Bearer ${TOKEN}` : TOKEN;
  return { [AUTH_HEADER]: valor, Accept: "application/json" };
}

function exigirToken() {
  if (!configurado()) throw new Error("OLACLICK_API_TOKEN não configurado");
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────
// GET com repetição em 429.
//
// A API limita chamadas por chave e responde 429 com Retry-After. A
// conciliação do iFood busca o detalhe de cada pedido, um por um, então
// num dia movimentado ela encosta nesse limite — e sem isto a rodada
// inteira morria com 'Request failed with status code 429', deixando o
// dia sem conciliar.
//
// Espera o que o servidor mandar esperar; se ele não disser, dobra o
// tempo a cada tentativa (1s, 2s, 4s).
// ──────────────────────────────────────────────
async function getComRetry(url, config = {}, tentativas = 4) {
  let espera = 1000;
  for (let i = 1; ; i++) {
    try {
      return await axios.get(url, config);
    } catch (e) {
      const status = e.response?.status;
      const recuperavel = status === 429 || (status >= 500 && status < 600);
      if (!recuperavel || i >= tentativas) throw e;

      const retryAfter = parseInt(e.response?.headers?.["retry-after"] || "", 10);
      const pausa = Number.isFinite(retryAfter) ? retryAfter * 1000 : espera;
      console.warn(`[OlaClick] ${status} — aguardando ${Math.round(pausa / 1000)}s (tentativa ${i}/${tentativas - 1})`);
      await dormir(pausa);
      espera *= 2;
    }
  }
}

function validarSources(sources) {
  const limpos = (sources || []).map((s) => String(s).toLowerCase().trim());
  const invalidos = limpos.filter((s) => !SOURCES_VALIDOS.includes(s));
  if (invalidos.length) {
    throw new Error(`canal inválido para a API do OlaClick: ${invalidos.join(", ")}`);
  }
  return limpos;
}

// ──────────────────────────────────────────────
// GET /dashboard/orders-summary
//
// Quantidade de pedidos, total vendido e ticket médio do período, para
// os canais pedidos. A API usa querystring no formato filter[campo].
//
// Este endpoint JÁ EXCLUI pedido cancelado — conferido pela aritmética:
// a listagem de pedidos de 04/10 a 03/11 trouxe 151 pedidos de iFood
// (R$ 5.560,24), o summary trouxe 147 (R$ 5.397,39), e havia exatamente
// 4 cancelados somando R$ 162,85. É por isso que a conciliação usa este
// endpoint para o total: ele não lança receita de pedido cancelado.
// ──────────────────────────────────────────────
async function buscarResumo({ dataInicio, dataFim, sources, timezone = TIMEZONE }) {
  exigirToken();

  const canais = validarSources(sources);
  if (!canais.length) throw new Error("informe ao menos um canal");

  const { data } = await getComRetry(`${BASE}/dashboard/orders-summary`, {
    headers: headers(),
    timeout: 20000,
    params: {
      "filter[start_date]": dataInicio,
      "filter[end_date]":   dataFim,
      "filter[sources]":    canais.join(","),
      "filter[timezone]":   timezone,
    },
  });

  const d = data?.data || {};
  return {
    pedidos:     Number(d?.total_quantity?.current_period || 0),
    total:       parseFloat(Number(d?.total_sales?.current_period || 0).toFixed(2)),
    ticketMedio: Number(d?.average_ticket?.current_period || 0),
  };
}

// ──────────────────────────────────────────────
// GET /orders — listagem (até 100 por página)
//
// Traz os campos de valor do pedido (total, combos_price, delivery_price,
// service_fee_price, total_discounts) mas NÃO o detalhe dos descontos.
// Inclui pedido cancelado, então quem chama precisa filtrar por status.
// ──────────────────────────────────────────────
async function listarPedidos({ dataInicio, dataFim, sources, timezone = TIMEZONE, perPage = 100, maxPaginas = 5 }) {
  exigirToken();

  const canais = validarSources(sources);
  if (!canais.length) throw new Error("informe ao menos um canal");

  const todos = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const { data } = await getComRetry(`${BASE}/orders`, {
      headers: headers(),
      timeout: 25000,
      params: {
        "filter[start_date]": dataInicio,
        "filter[end_date]":   dataFim,
        "filter[sources]":    canais.join(","),
        "filter[timezone]":   timezone,
        per_page: perPage,
        page: pagina,
      },
    });

    const lote = data?.data || [];
    todos.push(...lote);
    if (lote.length < perPage) break;
  }

  return todos;
}

// ──────────────────────────────────────────────
// GET /orders/{id} — pedido completo
//
// Precisamos dele por UM motivo: o array `discounts`, que só aparece
// aqui, traz o campo `modality` dizendo QUEM pagou cada desconto:
//   IFOOD_MERCHANT → saiu do bolso da loja
//   IFOOD_IFOOD    → o iFood bancou e reembolsa no repasse
// Sem essa distinção, desconto de campanha do iFood parece prejuízo da
// loja. Na semana de 29/10 a 02/11 eram R$ 555 de desconto, dos quais
// R$ 373,04 (67%) o iFood pagou.
// ──────────────────────────────────────────────
async function buscarPedido(id) {
  exigirToken();
  const { data } = await getComRetry(`${BASE}/orders/${id}`, {
    headers: headers(),
    timeout: 25000,
  });
  return data?.data || data;
}

module.exports = {
  configurado,
  buscarResumo,
  listarPedidos,
  buscarPedido,
  SOURCES_VALIDOS,
  TIMEZONE,
};
