// ──────────────────────────────────────────────
// pedidoEmCurso.js — a memória que faltava
//
// Até aqui o bot avaliava cada mensagem sozinha e esquecia tudo. Para
// tomar um pedido isso não serve: "quero um combo do duplo smash", o
// endereço e a forma de pagamento chegam em mensagens separadas, com
// minutos entre elas, e no meio pode vir um "quanto é a taxa?".
//
// O QUE O BOT PERGUNTA (regra do dono, o mínimo possível):
//   sempre      → endereço e forma de pagamento
//   se combo    → qual coca
//   se dinheiro → troco
//
// O que NÃO pergunta:
//   batata      → pequena por padrão, que é o que quase todo mundo quer e
//                 já vem no preço. Só muda se o cliente falar sozinho —
//                 e muda o preço: média soma R$ 9, com cheddar e bacon
//                 soma R$ 13.
//   ponto da carne e maionese → não existem no cardápio ativo. Eu havia
//                 afirmado que eram obrigatórios; estava lendo a lista de
//                 grupos do catálogo em vez do que está ligado a produto.
//
// Cliente não quer questionário, quer comer. Cada pergunta a mais é uma
// chance de ele desistir e ir para o iFood.
// ──────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const ARQUIVO = process.env.PEDIDOS_EM_CURSO || "/dados/pedidos-em-curso.json";
// Conversa parada por mais que isso é pedido abandonado — ou já resolvido
// pelo dono por fora. Continuar de onde parou meia hora depois assusta.
const VALIDADE_MS = 30 * 60 * 1000;

let emCurso = new Map();

// Sobrevive a restart. O serviço reinicia a cada deploy, e perder o
// pedido de quem já mandou o endereço significa pedir tudo de novo.
function carregar() {
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    const agora = Date.now();
    emCurso = new Map(Object.entries(bruto).filter(([, p]) => agora - p.mexidoEm < VALIDADE_MS));
  } catch { emCurso = new Map(); }
}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.writeFileSync(ARQUIVO, JSON.stringify(Object.fromEntries(emCurso)));
  } catch (e) { console.error("[pedidos]", e.message); }
}

carregar();

function novo() {
  return {
    itens: [],          // { nome, preco, cat, qtd, coca, batataExtra }
    endereco: null,
    bairro: null,       // { bairro, taxa }
    pagamento: null,    // "pix" | "card" | "cash"
    troco: null,
    criadoEm: Date.now(),
    mexidoEm: Date.now(),
  };
}

function pegar(conversa) {
  const p = emCurso.get(conversa);
  if (!p) return null;
  if (Date.now() - p.mexidoEm > VALIDADE_MS) { emCurso.delete(conversa); salvar(); return null; }
  return p;
}

function abrirOuPegar(conversa) {
  let p = pegar(conversa);
  if (!p) { p = novo(); emCurso.set(conversa, p); }
  return p;
}

function guardar(conversa, p) {
  p.mexidoEm = Date.now();
  emCurso.set(conversa, p);
  salvar();
}

function fechar(conversa) {
  emCurso.delete(conversa);
  salvar();
}

// ──────────────────────────────────────────────
// O que ainda falta para o pedido ficar de pé.
// A ordem importa: pergunta uma coisa de cada vez, na ordem em que a
// conversa acontece naturalmente.
// ──────────────────────────────────────────────
function oQueFalta(p) {
  const faltas = [];
  if (!p.itens.length) faltas.push("item");
  // Só os combos têm coca a escolher.
  const combosSemCoca = p.itens.filter((i) => i.cat === "combo" && !i.coca);
  if (combosSemCoca.length) faltas.push("coca");
  if (!p.bairro) faltas.push("endereco");
  if (!p.pagamento) faltas.push("pagamento");
  // Troco só faz sentido em dinheiro, e só se ele ainda não disse.
  if (p.pagamento === "cash" && p.troco === null) faltas.push("troco");
  return faltas;
}

// ──────────────────────────────────────────────
// Quanto dá. Determinístico: nenhuma IA decide valor.
// ──────────────────────────────────────────────
function somar(p, cardapio) {
  const linhas = p.itens.map((i) => {
    const extra = i.batataExtra || 0;
    const unit = i.preco + extra;
    return {
      nome: i.nome + (i.coca ? ` (${i.coca})` : "") + (i.batataNome ? ` + ${i.batataNome}` : ""),
      qtd: i.qtd || 1,
      subtotal: Number((unit * (i.qtd || 1)).toFixed(2)),
    };
  });
  const produtos = Number(linhas.reduce((s, l) => s + l.subtotal, 0).toFixed(2));
  const entrega = p.bairro ? p.bairro.taxa : 0;
  const minimo = Number(cardapio.CARDAPIO.pedido_minimo || 0);
  return {
    linhas,
    produtos,
    entrega,
    total: Number((produtos + entrega).toFixed(2)),
    faltaParaMinimo: minimo > produtos ? Number((minimo - produtos).toFixed(2)) : 0,
  };
}

const PAGAMENTO_PT = { pix: "Pix", card: "Cartão", cash: "Dinheiro" };

// Como o pedido chega para o dono: pronto para ele lançar sem reler a
// conversa inteira. É este o ganho — tirar o vai-e-vem da mão dele.
function resumoParaDono(p, conta, nomeCliente) {
  const br = (v) => "R$ " + v.toFixed(2).replace(".", ",");
  const linhas = [`🧾 *Pedido de ${nomeCliente || "cliente"}*`, ""];
  conta.linhas.forEach((l) => linhas.push(`${l.qtd}x ${l.nome} — ${br(l.subtotal)}`));
  linhas.push("");
  linhas.push(`📍 ${p.endereco}`);
  if (p.bairro) linhas.push(`Entrega (${p.bairro.bairro}) — ${br(conta.entrega)}`);
  linhas.push(`💳 ${PAGAMENTO_PT[p.pagamento] || p.pagamento}${p.troco ? ` — troco para ${br(p.troco)}` : ""}`);
  linhas.push("");
  linhas.push(`*Total: ${br(conta.total)}*`);
  if (conta.faltaParaMinimo) linhas.push(`\n⚠️ Abaixo do mínimo de ${br(15)} — faltam ${br(conta.faltaParaMinimo)}`);
  return linhas.join("\n");
}

module.exports = {
  pegar, abrirOuPegar, guardar, fechar,
  oQueFalta, somar, resumoParaDono,
  VALIDADE_MS,
  quantosAbertos: () => emCurso.size,
};
