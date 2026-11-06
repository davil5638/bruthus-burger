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
    // A rua, guardada mesmo quando o bairro ainda não foi reconhecido.
    // Antes o endereço inteiro era descartado nesse caso, e o bot
    // repetia "me passa o endereço" para quem acabara de passar —
    // travou o pedido do Renan em 05/11/2026.
    enderecoTexto: null,
    bairro: null,       // { bairro, taxa }
    pagamento: null,    // "pix" | "card" | "cash"
    troco: null,
    // O que precisa ser PERGUNTADO ao cliente antes de seguir: qual
    // coca, qual dos itens parecidos. Regra do dono: na dúvida pergunta,
    // não chuta e não cala.
    perguntas: [],
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
  const pendentes = p.perguntas || [];
  if (!p.itens.length && !pendentes.length) faltas.push("item");
  // Só os combos têm coca a escolher.
  const combosSemCoca = p.itens.filter((i) => i.cat === "combo" && !i.coca);
  if (combosSemCoca.length) faltas.push("coca");
  // Dúvida sobre O QUE vai ser feito vem antes de endereço e pagamento:
  // é a informação que a cozinha precisa.
  if (pendentes.length) faltas.push("pendencia");
  // Com a rua já na mão, falta só o bairro — e é só o bairro que o bot
  // pergunta. Pedir "o endereço" de novo a quem já mandou parece que
  // ninguém leu.
  if (!p.bairro) faltas.push(p.enderecoTexto ? "bairro" : "endereco");
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
const br = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

// ──────────────────────────────────────────────
// O que o bot fala a cada passo.
//
// A ordem veio da observação do dono: o cliente pergunta "quanto ficou?"
// LOGO depois de pedir. Então o bot não espera ser perguntado — diz o
// valor assim que souber. Isso tira uma ida e volta inteira.
//
// E em dinheiro o valor vem JUNTO da pergunta do troco: sem saber quanto
// é, o cliente não tem como dizer de quanto precisa.
// ──────────────────────────────────────────────
function perguntar(falta, p, conta, cardapio) {
  const primeiro = falta[0];

  if (primeiro === "coca") {
    const combo = p.itens.find((i) => i.cat === "combo" && !i.coca);
    return `${combo.nome} — ${br(combo.preco)} 🍔\n\nQual coca, zero ou normal?`;
  }

  // Dúvida pendente: pergunta a coisa exata que falta, com as opções
  // reais e o preço de cada uma. Os tamanhos de coca custam diferente
  // (lata, 600ml, 1 litro), então nenhum pode ter padrão: adivinhar
  // barato come a margem e adivinhar caro irrita o cliente.
  if (primeiro === "pendencia") {
    const q = (p.perguntas || [])[0];
    if (!q) return null;

    if (q.tipo === "coca") {
      const tamanhos = cardapio ? cardapio.cocaTamanhos() : [];
      const lista = tamanhos
        .map((t) => `• ${t.rotulo.charAt(0).toUpperCase()}${t.rotulo.slice(1)} — ${br(t.preco)}`)
        .join("\n");

      if (q.falta === "tamanho") {
        return `Coca ${q.versao === "zero" ? "zero" : "normal"} 🥤\n\nQual tamanho?\n${lista}`;
      }
      if (q.falta === "versao") {
        const rotulo = cardapio ? cardapio.TAMANHO_PT[q.tamanho] : q.tamanho;
        return `Coca de ${rotulo} 🥤\n\nZero ou normal?`;
      }
      return `Qual coca? 🥤\n\n${lista}\n\nE zero ou normal?`;
    }

    if (q.tipo === "qual_item") {
      const op = (q.alternativas || []).slice(0, 4);
      return op.length
        ? `Só pra eu não errar: qual desses? 🙌\n\n${op.map((nome) => `• ${nome}`).join("\n")}`
        : `Não achei "${q.consulta}" no cardápio 🙏\n\nMe diz o nome como está no cardápio?\n${cardapio ? cardapio.CARDAPIO.link || "" : ""}`.trim();
    }
    return null;
  }

  // Só o bairro: a rua já veio. Repetir "me passa o endereço" para quem
  // acabou de mandar o endereço é o jeito mais rápido de perder a venda.
  if (primeiro === "bairro") {
    return `Anotei: ${p.enderecoTexto} 📍\n\nE qual o bairro? É pra calcular a entrega.`;
  }

  if (primeiro === "endereco") {
    // Já diz quanto deu dos produtos, antes de ser perguntado.
    const itens = p.itens.map((i) => `${i.qtd || 1}x ${i.nome}`).join("\n");
    return `${itens}\n*${br(conta.produtos)}* 🍔\n\nMe passa o endereço com o bairro, pra calcular a entrega?`;
  }

  if (primeiro === "pagamento") {
    return `Fechou! 🙌\n\n${conta.linhas.map((l) => `${l.qtd}x ${l.nome} — ${br(l.subtotal)}`).join("\n")}\nEntrega (${p.bairro.bairro}) — ${br(conta.entrega)}\n\n*Total: ${br(conta.total)}*\n\nVai ser Pix, cartão ou dinheiro?`;
  }

  if (primeiro === "troco") {
    // O valor repetido aqui não é redundância: é dele que sai a conta do
    // troco, e o cliente acabou de ler outra coisa.
    return `Deu *${br(conta.total)}* 💵\n\nPrecisa de troco? Se sim, pra quanto?`;
  }

  return null;
}

// O resumo que o cliente lê ANTES do pedido existir.
//
// É a trava mais importante do fluxo: se o bot entendeu o item errado, é
// aqui que a pessoa vê e corrige — antes de virar comida na chapa.
function resumoParaCliente(p, conta) {
  const linhas = ["Confere pra mim? 🙌", ""];
  conta.linhas.forEach((l) => linhas.push(`${l.qtd}x ${l.nome} — ${br(l.subtotal)}`));
  linhas.push(`Entrega (${p.bairro.bairro}) — ${br(conta.entrega)}`);
  linhas.push("", `*Total: ${br(conta.total)}*`);
  linhas.push(`${PAGAMENTO_PT[p.pagamento] || p.pagamento}${p.troco ? ` — troco para ${br(p.troco)}` : ""}`);
  linhas.push("", `📍 ${p.endereco}`);
  linhas.push("", "Tá certo? Responde *sim* que eu já mando pra cozinha 🔥");
  return linhas.join("\n");
}

// Confirmação final, depois que tudo está completo.
function confirmarParaCliente(p, conta) {
  const linhas = conta.linhas.map((l) => `${l.qtd}x ${l.nome} — ${br(l.subtotal)}`);
  linhas.push(`Entrega (${p.bairro.bairro}) — ${br(conta.entrega)}`);
  linhas.push("", `*Total: ${br(conta.total)}*`);
  if (p.pagamento === "cash" && p.troco) linhas.push(`Troco para ${br(p.troco)}`);
  return `Anotado! 📝\n\n${linhas.join("\n")}\n\nJá vamos preparar 🔥`;
}

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
  perguntar, confirmarParaCliente,
  oQueFalta, somar, resumoParaDono, resumoParaCliente,
  VALIDADE_MS,
  quantosAbertos: () => emCurso.size,
};
