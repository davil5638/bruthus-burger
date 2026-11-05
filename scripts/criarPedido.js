// ──────────────────────────────────────────────
// criarPedido.js — lança o pedido no OlaClick
//
// O dono não quer lançar na mão. Isto faz o que ele faz hoje abrindo o
// painel: acha ou cria o cliente, grava o endereço, monta o pedido com
// os itens e confirma.
//
// SÃO SEIS CHAMADAS EM CADEIA, e qualquer uma pode falhar. Cada passo
// reporta onde parou, porque "deu erro" no meio do movimento não ajuda
// ninguém — e um pedido pela metade no painel é pior que nenhum.
//
// O pedido nasce INITIATED (rascunho, invisível para a loja), recebe os
// itens, e só então vira PENDING. Assim ele aparece na cozinha completo
// ou não aparece: nunca meio montado.
// ──────────────────────────────────────────────

if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const axios = require("axios");
const { CARDAPIO } = require("./cardapio");

const BASE = "https://public-api.olaclick.app/v1";

function headers() {
  const t = process.env.OLACLICK_API_TOKEN;
  if (!t) throw new Error("OLACLICK_API_TOKEN não configurado");
  return { "x-api-key": t, "Content-Type": "application/json" };
}

const post = async (c, body, extra = {}) =>
  (await axios.post(BASE + c, body, { headers: { ...headers(), ...extra }, timeout: 25000 })).data;
const get  = async (c, params) => (await axios.get(BASE + c, { headers: headers(), params, timeout: 25000 })).data;

function soDigitos(t) { return String(t || "").replace(/\D/g, ""); }

// ──────────────────────────────────────────────
// 1. O cliente já existe? Cadastrar o mesmo telefone duas vezes espalha
//    o histórico dele em duas fichas, e aí a recuperação de cliente, que
//    conta pedidos por pessoa, passa a mentir.
// ──────────────────────────────────────────────
// Cache em disco. Sem ele, cada pedido de cliente repetido varreria a
// base inteira de novo — e ela só cresce.
const fs = require("fs");
const path = require("path");
const CACHE = process.env.CACHE_CLIENTES ||
  path.resolve(__dirname, "../data/.clientes-cache.json");

function lerCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; }
}
function gravarCache(c) {
  try { fs.writeFileSync(CACHE, JSON.stringify(c)); } catch { /* cache é conforto, não requisito */ }
}

// Varre as páginas procurando o telefone.
//
// Existe porque o filtro da API NÃO funciona: `filter[phone_number]`
// aceita o parâmetro, filtra, e devolve vazio para um telefone que está
// lá — conferido varrendo a base e achando o registro com exatamente a
// string buscada. Sem isto, criar o pedido falha com "a client with this
// phone number already exists" e o cliente fica sem atendimento.
async function procurarPorTelefone(semDDI) {
  const fim = semDDI.slice(-8);
  // De trás para frente: quem pede pelo WhatsApp costuma ser cliente
  // recente, e os recentes estão nas últimas páginas.
  let pagina = 1;
  const paginas = [];
  while (pagina <= 60) {
    const r = await get("/clients", { page: pagina, per_page: 100 });
    paginas.push(r?.data || []);
    if (!r?.pagination?.has_more) break;
    pagina++;
  }
  for (let i = paginas.length - 1; i >= 0; i--) {
    const hit = paginas[i].find((c) => soDigitos(c.phone_number).endsWith(fim));
    if (hit) return hit;
  }
  return null;
}

async function acharOuCriarCliente({ nome, telefone }) {
  const semDDI = soDigitos(telefone).replace(/^55/, "");

  const cache = lerCache();
  if (cache[semDDI]) return { id: cache[semDDI].id, novo: false, nome: cache[semDDI].nome, deCache: true };

  const achado = await procurarPorTelefone(semDDI);
  if (achado) {
    cache[semDDI] = { id: achado.id, nome: achado.name };
    gravarCache(cache);
    return { id: achado.id, novo: false, nome: achado.name };
  }

  const criado = await post("/clients", {
    name: nome || "Cliente WhatsApp",
    phone_number: semDDI,
    country_calling_code: "55",
  });
  const d = criado?.data || criado;
  cache[semDDI] = { id: d.id, nome: d.name };
  gravarCache(cache);
  return { id: d.id, novo: true, nome: d.name };
}

// ──────────────────────────────────────────────
// 2. Endereço. O `area_id` é o que faz o OlaClick aplicar a taxa do
//    bairro; sem ele a entrega sai como zero e o dono descobre no caixa.
// ──────────────────────────────────────────────
async function criarEndereco({ clienteId, endereco, areaId, referencia }) {
  const criado = await post("/addresses", {
    client_id: clienteId,
    address: String(endereco).slice(0, 191),
    ...(areaId ? { area_id: areaId } : {}),
    ...(referencia ? { reference: String(referencia).slice(0, 100) } : {}),
  });
  const d = criado?.data || criado;
  return d.id;
}

// ──────────────────────────────────────────────
// 3 a 6. O pedido em si.
// ──────────────────────────────────────────────
async function criar({ cliente, endereco, itens, pagamento, troco = null, observacao = null, idempotencia = null }) {
  const passos = [];
  const anotar = (passo, ok, detalhe) => passos.push({ passo, ok, detalhe });
  // Quem chama pode passar a sua, para uma retentativa do MESMO pedido
  // reusar a chave. Sem isso, cada tentativa seria um pedido novo.
  const chaveIdempotencia = idempotencia || require("crypto").randomUUID();

  try {
    // ── cliente ──
    const c = await acharOuCriarCliente(cliente);
    anotar("cliente", true, c.novo ? "criado" : "já existia");

    // ── endereço ──
    const enderecoId = await criarEndereco({
      clienteId: c.id,
      endereco: endereco.texto,
      areaId: endereco.area_id,
      referencia: endereco.referencia,
    });
    anotar("endereço", true, endereco.area_id ? "com bairro" : "SEM bairro — taxa pode sair zerada");

    // ── pedido, ainda rascunho ──
    //
    // A chave de idempotência é exigida pela API e é a mesma durante toda
    // esta chamada: se a rede cair depois do pedido ter sido criado e
    // quem chamou tentar de novo, o OlaClick devolve o mesmo pedido em
    // vez de criar um segundo. Dois pedidos iguais na cozinha é comida
    // perdida — e com o bot tomando pedido, retentativa vai acontecer.
    const pedido = await post("/orders", {
      service_type: "DELIVERY",
      client_id: c.id,
      address_id: enderecoId,
      delivery_price: Number(endereco.taxa || 0),
      status: "INITIATED",
      ...(observacao ? { comment: String(observacao).slice(0, 500) } : {}),
    }, { "Idempotency-Key": chaveIdempotencia });
    const pedidoId = (pedido?.data || pedido).id;
    anotar("pedido", true, "rascunho criado");

    // ── itens, todos de uma vez (os totais são recalculados por lote) ──
    const combos = itens.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.qtd || 1,
      modifiers: (i.modificadores || []).map((m) => ({ modifier_id: m, quantity: 1 })),
      ...(i.observacao ? { comment: String(i.observacao).slice(0, 500) } : {}),
    }));
    const comItens = await post(`/orders/${pedidoId}/combos`, { combos });
    anotar("itens", true, `${combos.length} item(ns)`);

    // ── forma de pagamento ──
    // Registrar o pagamento é como a forma fica gravada no pedido; é o
    // mesmo caminho que o cardápio digital usa. Em dinheiro, o valor
    // recebido é o do troco, para o OlaClick calcular quanto devolver.
    const metodo = CARDAPIO.pagamentos?.[pagamento];
    const total = Number((comItens?.data || comItens)?.total || 0);
    if (metodo?.id && total > 0) {
      try {
        await post(`/orders/${pedidoId}/payments`, {
          payment_method_id: metodo.id,
          bill_amount: total,
          ...(pagamento === "cash" && troco ? { received_amount: Number(troco) } : {}),
        });
        anotar("pagamento", true, pagamento + (troco ? ` (troco para ${troco})` : ""));
      } catch (e) {
        // Não derruba o pedido: ele existe e o dono ajusta a forma no
        // painel. Perder o pedido inteiro por causa disto seria pior.
        anotar("pagamento", false, e.response?.data?.detail || e.message);
      }
    } else {
      anotar("pagamento", false, metodo ? "total zerado" : `forma desconhecida: ${pagamento}`);
    }

    // ── confirma: agora a loja vê ──
    const confirmado = await post(`/orders/${pedidoId}/status`, { status: "PENDING" })
      .catch(async () => (await axios.patch(`${BASE}/orders/${pedidoId}/status`, { status: "PENDING" },
        { headers: headers(), timeout: 25000 })).data);
    const final = confirmado?.data || confirmado;
    anotar("confirmação", true, "PENDING");

    return {
      ok: true,
      id: pedidoId,
      public_id: final?.public_id,
      total: final?.total ?? total,
      daily_id: final?.daily_id,
      passos,
    };
  } catch (e) {
    const detalhe = e.response?.data?.detail || e.response?.data?.title || e.message;
    anotar("FALHOU", false, detalhe);
    return { ok: false, erro: detalhe, passos };
  }
}

module.exports = { criar, acharOuCriarCliente };
