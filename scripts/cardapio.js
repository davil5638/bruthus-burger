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

// Distância de edição: quantas letras mudam de uma palavra para a outra.
//
// Existe por um caso concreto: o cardápio diz "Calabrese", grafia
// italiana, e o cliente escreve "calabresa", do jeito que se fala. Uma
// letra no fim, e sem isto o bot não achava a pizza mais pedida da casa.
// O mesmo vale para "margherita"/"marguerita" e "pepperoni"/"peperoni".
function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;          // longe demais, nem calcula
  let anterior = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    anterior = atual;
  }
  return anterior[n];
}

// Duas palavras são "a mesma coisa" para um cliente digitando no celular?
// A tolerância cresce com o tamanho: em palavra curta uma letra muda o
// sentido ("mel" e "mil"), em palavra longa é só erro de digitação.
function mesmaPalavra(a, b) {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) >= 4;
  const limite = Math.min(a.length, b.length) >= 7 ? 2 : 1;
  return Math.min(a.length, b.length) >= 5 && distancia(a, b) <= limite;
}

// Quanto o texto do cliente se parece com o nome do item. Conta quantas
// palavras do item aparecem na frase, e vice-versa.
function pontuar(consulta, item) {
  const pc = palavras(consulta);
  const pi = palavras(item.nome);
  if (!pc.length || !pi.length) return 0;

  let acertos = 0;
  for (const p of pi) {
    // Casa palavra inteira, começo dela, ou quase ela: "classic" acha
    // "classico", e "calabresa" acha "calabrese".
    if (pc.some((q) => mesmaPalavra(q, p))) acertos++;
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
 *
 * `faltaParaMinimo` existe porque a loja tem pedido mínimo de R$ 15 (está
 * escrito na página do cardápio). Sem conferir, o bot somaria uma Coca de
 * R$ 6,99 com a entrega, mandaria o valor, e o pedido seria recusado
 * depois — com o cliente já tendo decidido comprar.
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
  const minimo = Number(CARDAPIO.pedido_minimo || 0);
  // O mínimo vale sobre os produtos, não sobre o total com entrega: a
  // taxa é da entrega, não da compra.
  const faltaParaMinimo = minimo > produtos ? Number((minimo - produtos).toFixed(2)) : 0;

  return {
    linhas,
    produtos,
    entrega,
    total: Number((produtos + entrega).toFixed(2)),
    minimo,
    faltaParaMinimo,
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
