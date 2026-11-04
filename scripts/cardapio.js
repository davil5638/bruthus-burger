// ──────────────────────────────────────────────
// cardapio.js — identificar item e calcular preço
//
// É a peça central do atendimento automático. Hoje o dono faz isto na mão:
// o cliente manda "quero o combo do melt", ele abre o OlaClick, acha o
// item, soma a taxa do bairro e devolve o valor. São esses três passos.
//
// O retrato do cardápio vive em data/cardapio.json, não numa chamada à
// API a cada mensagem: o cliente está esperando resposta, e uma ida à
// rede por item deixaria o bot lento justamente no que ele veio resolver.
// O preço em si é determinístico — não há IA decidindo valor. A IA, quando
// entrar, serve só para ler a frase do cliente; quanto custa sai daqui.
//
// Atualizar quando mexer em preço ou cardápio:
//   node scripts/cardapio.js --conferir
// ──────────────────────────────────────────────

const CARDAPIO = require("../data/cardapio.json");

// Tira acento, caixa e pontuação. "Clássico Bruthus" e "classico bruthus"
// têm que casar, porque ninguém digita acento no WhatsApp.
function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palavras que não ajudam a distinguir um item de outro.
const VAZIAS = new Set([
  "de", "do", "da", "o", "a", "um", "uma", "e", "com", "quero", "queria",
  "me", "ve", "manda", "por", "favor", "pra", "para", "no", "na", "bruthus",
]);

function palavras(txt) {
  return normalizar(txt).split(" ").filter((p) => p && !VAZIAS.has(p));
}

// Quanto o texto do cliente se parece com o nome do item. Conta quantas
// palavras do item aparecem na frase, e vice-versa.
function pontuar(consulta, item) {
  const pc = palavras(consulta);
  const pi = palavras(item.nome);
  if (!pc.length || !pi.length) return 0;

  let acertos = 0;
  for (const p of pi) {
    // Casa palavra inteira ou começo dela: "classic" acha "classico".
    if (pc.some((q) => q === p || q.startsWith(p) || p.startsWith(q))) acertos++;
  }
  if (!acertos) return 0;

  // Proporção do nome do item que foi mencionada. "melt" sozinho cobre
  // metade de "Bruthus Melt" (porque "bruthus" é palavra vazia), e isso
  // basta — ninguém escreve o nome completo.
  return acertos / pi.length;
}

// O cliente pediu combo? "combo", "completo", "com batata e refri".
function pediuCombo(txt) {
  const n = normalizar(txt);
  return /\bcombos?\b|\bcompleto\b/.test(n);
}

/**
 * Acha o item do cardápio que o cliente quis dizer.
 * Devolve { item, confianca, alternativas } ou null.
 *
 * A confiança importa: abaixo de um limite o bot NÃO deve adivinhar,
 * deve perguntar. Errar o item significa comida errada na cozinha.
 */
function buscarItem(consulta) {
  const querCombo = pediuCombo(consulta);

  const notas = CARDAPIO.itens
    .map((item) => {
      let nota = pontuar(consulta, item);
      if (!nota) return null;
      // Combo pedido explicitamente pesa a favor do combo, e contra o
      // hambúrguer solto — e o contrário também.
      const ehCombo = item.cat === "combo";
      if (querCombo && ehCombo) nota += 0.5;
      if (querCombo && !ehCombo) nota -= 0.3;
      if (!querCombo && ehCombo) nota -= 0.3;
      return { item, nota };
    })
    .filter(Boolean)
    .sort((a, b) => b.nota - a.nota);

  if (!notas.length) return null;

  const melhor = notas[0];
  const segundo = notas[1];
  // Se o segundo colocado chega perto, é ambíguo — melhor perguntar.
  const folga = segundo ? melhor.nota - segundo.nota : melhor.nota;

  return {
    item: melhor.item,
    confianca: folga >= 0.25 && melhor.nota >= 0.5 ? "alta" : "baixa",
    alternativas: notas.slice(0, 3).map((n) => n.item),
  };
}

/**
 * Taxa de entrega pelo bairro. Devolve { bairro, taxa } ou null quando
 * não reconhece — e aí o bot pergunta em vez de chutar, porque cobrar
 * errado é pior do que demorar mais um minuto.
 */
function taxaBairro(texto) {
  const n = normalizar(texto);
  if (!n) return null;

  let achado = null;
  for (const [bairro, taxa] of Object.entries(CARDAPIO.bairros)) {
    // O cliente escreve o endereço inteiro: "rua tal, 123, centro".
    // Procura o nome do bairro dentro da frase.
    const re = new RegExp("(^|\\s)" + bairro.replace(/\s+/g, "\\s+") + "(\\s|$)");
    if (re.test(n)) {
      // Fica com o nome mais longo que casar: "boa vista" antes de "vista",
      // "loteamento juazeiro" antes de "juazeiro".
      if (!achado || bairro.length > achado.bairro.length) achado = { bairro, taxa };
    }
  }
  return achado;
}

/**
 * Soma o pedido. Nenhuma IA envolvida: entra lista de itens, sai total.
 */
function precificar(itens, bairro = null) {
  const linhas = itens.map(({ item, qtd = 1 }) => ({
    nome: item.nome,
    qtd,
    unitario: item.preco,
    subtotal: Number((item.preco * qtd).toFixed(2)),
  }));

  const produtos = Number(linhas.reduce((s, l) => s + l.subtotal, 0).toFixed(2));
  const entrega = bairro ? bairro.taxa : 0;

  return {
    linhas,
    produtos,
    entrega,
    total: Number((produtos + entrega).toFixed(2)),
  };
}

// Como o valor seria mandado para o cliente.
function resumoParaCliente(conta, bairro) {
  const br = (v) => "R$ " + v.toFixed(2).replace(".", ",");
  const linhas = conta.linhas.map((l) => `${l.qtd}x ${l.nome} — ${br(l.subtotal)}`);
  if (bairro) linhas.push(`Entrega (${bairro.bairro}) — ${br(conta.entrega)}`);
  linhas.push(`*Total: ${br(conta.total)}*`);
  return linhas.join("\n");
}

// ──────────────────────────────────────────────
// node scripts/cardapio.js --conferir
// Confere o retrato contra o que a API devolve hoje.
// ──────────────────────────────────────────────
if (require.main === module) {
  console.log(`Cardápio de ${CARDAPIO.atualizado_em}`);
  console.log(`  ${CARDAPIO.itens.length} itens, ${Object.keys(CARDAPIO.bairros).length} bairros`);
  console.log("\nPara atualizar, puxe o menu do OlaClick e regrave data/cardapio.json.");
}

module.exports = {
  CARDAPIO,
  normalizar,
  buscarItem,
  taxaBairro,
  precificar,
  resumoParaCliente,
  pediuCombo,
};
