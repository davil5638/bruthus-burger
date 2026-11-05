// ──────────────────────────────────────────────
// atualizarCardapio.js — regenera data/cardapio.json do OlaClick
//
// POR QUE EXISTE:
// Até agora o cardápio do bot tinha nome e preço, que basta para
// responder "quanto é?". Para CRIAR um pedido não basta: a API quer
// identificadores — `variant_id` de cada item, `modifier_id` de cada
// escolha, `area_id` do bairro, `payment_method_id` da forma de
// pagamento. Copiar isso à mão envelhece no primeiro item novo.
//
// Rode depois de mexer em preço, item ou bairro:
//   node scripts/atualizarCardapio.js
//
// Não inventa nada: tudo sai da API. O que não vier da API fica de fora
// em vez de ser chutado — preço errado vira cobrança errada.
// ──────────────────────────────────────────────

if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const BASE = "https://public-api.olaclick.app/v1";
const DESTINO = path.resolve(__dirname, "../data/cardapio.json");

function headers() {
  const t = process.env.OLACLICK_API_TOKEN;
  if (!t) throw new Error("OLACLICK_API_TOKEN não configurado");
  return { "x-api-key": t };
}

const get = async (caminho, params = {}) =>
  (await axios.get(BASE + caminho, { headers: headers(), params, timeout: 25000 })).data;

function normalizarChave(txt) {
  return String(txt || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Categoria a que o item pertence, para o bot saber se é combo (e então
// perguntar a coca) ou pizza (e então precisar dos dois sabores).
function classificar(slugCategoria) {
  if (/combo/.test(slugCategoria)) return "combo";
  if (/pizza/.test(slugCategoria)) return "pizza";
  if (/hamburg/.test(slugCategoria)) return "hamburguer";
  if (/bebida/.test(slugCategoria)) return "bebida";
  if (/acompanha/.test(slugCategoria)) return "acompanhamento";
  if (/promo|destaque|favorito/.test(slugCategoria)) return "promocao";
  return "outro";
}

async function atualizar({ bairros } = {}) {
  const anterior = fs.existsSync(DESTINO) ? JSON.parse(fs.readFileSync(DESTINO, "utf8")) : {};

  // ── itens, com variant_id ──
  const menu = await get("/menu");
  const itens = [];
  const vistos = new Set();
  for (const cat of menu?.data?.categories || []) {
    const tipo = classificar(cat.slug || "");
    for (const p of cat.products || []) {
      const v = (p.variants || [])[0];
      // Produto sem variante não tem preço e não dá para pedir.
      if (!v || vistos.has(p.id)) continue;
      vistos.add(p.id);
      itens.push({
        id: p.id,
        variant_id: v.id,          // é ISTO que add_order_combos quer
        nome: p.name,
        preco: Number(v.price),
        cat: tipo,
        modificadores: p.modifier_category_ids || [],
      });
    }
  }

  // ── modificadores, com modifier_id ──
  const mods = await get("/menu/modifier-categories");
  const grupos = {};
  for (const g of mods?.data || []) {
    grupos[normalizarChave(g.name)] = {
      id: g.id,
      obrigatorio: Boolean(g.required),
      opcoes: (g.modifiers || [])
        .filter((m) => m.visible !== false)
        .map((m) => ({ id: m.id, nome: m.name, preco: Number(m.price || 0) })),
    };
  }

  // ── formas de pagamento, com payment_method_id ──
  const pag = await get("/company/payment-methods");
  const pagamentos = {};
  for (const m of pag?.data || []) pagamentos[m.code] = { id: m.id, descricao: m.description };

  // ── horário e nome da loja ──
  const empresa = await get("/company");

  const novo = {
    _nota: "Gerado por scripts/atualizarCardapio.js. NÃO editar à mão: rode o script depois de mexer no OlaClick.",
    atualizado_em: new Date().toISOString().slice(0, 10),
    loja: empresa?.data?.name,
    pedido_minimo: anterior.pedido_minimo ?? 15,
    tempo_entrega: anterior.tempo_entrega,
    endereco: anterior.endereco,
    itens,
    modificadores: grupos,
    pagamentos,
    // Bairros mudam raramente e não há endpoint público para eles; vêm de
    // fora e são preservados entre execuções.
    bairros: bairros || anterior.bairros || {},
    pedido_pelo_whatsapp: anterior.pedido_pelo_whatsapp,
    escolhas_por_produto: anterior.escolhas_por_produto,
    como_detectar_indisponibilidade: anterior.como_detectar_indisponibilidade,
  };

  fs.writeFileSync(DESTINO, JSON.stringify(novo, null, 2));
  return novo;
}

if (require.main === module) {
  atualizar()
    .then((c) => {
      console.log(`Cardápio de ${c.loja} — ${c.atualizado_em}`);
      console.log(`  itens          : ${c.itens.length} (todos com variant_id)`);
      console.log(`  grupos de mod. : ${Object.keys(c.modificadores).length}`);
      console.log(`  pagamentos     : ${Object.keys(c.pagamentos).join(", ")}`);
      console.log(`  bairros        : ${Object.keys(c.bairros).length}`);
      const semVariante = c.itens.filter((i) => !i.variant_id).length;
      if (semVariante) console.warn(`  ⚠️  ${semVariante} item(ns) sem variant_id — não dá para pedir`);
      process.exit(0);
    })
    .catch((e) => { console.error("❌", e.response?.data?.detail || e.message); process.exit(1); });
}

module.exports = { atualizar };
