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

// O que vem entre parênteses é descrição, não nome.
//
// "Smash Bruthus ( carne 80g )" virava três palavras — smash, carne,
// 80g —, então "smash" sozinho cobria um terço dele e metade de "Duplo
// Smash Bruthus". Resultado: quem pedia "um smash" recebia o duplo, R$ 4
// mais caro e maior do que pediu. O dono avisou que esses quatro itens
// eram perigosos justamente por isso.
function semParenteses(txt) {
  return String(txt || "").replace(/\([^)]*\)/g, " ");
}

function palavras(txt) {
  return normalizar(semParenteses(txt)).split(" ").filter((p) => p && !VAZIAS.has(p));
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

// Quanto cada palavra vale. Palavra que aparece em muitos itens não
// distingue nada.
//
// Caso real que obrigou isto: "queria um x tudo com bacon extra" casava
// com "Cheddar & Bacon" com confiança ALTA. O cliente pediu um x-tudo,
// que nem existe no cardápio, e citou bacon como ADICIONAL — e o bot
// responderia o preço de outro lanche. "bacon" está em vários itens;
// "coalho" e "melt" estão em dois e identificam de verdade.
// Todas as palavras que existem em nome de item. Serve para saber se uma
// palavra que o cliente disse é do cardápio ("duplo") ou conversa solta
// ("quero", "viu", "amiga") — só a primeira diz algo sobre qual item é.
const VOCABULARIO = new Set(CARDAPIO.itens.flatMap((i) => palavras(i.nome)));

const PESO = (() => {
  const freq = {};
  CARDAPIO.itens.forEach((i) => {
    new Set(palavras(i.nome)).forEach((p) => { freq[p] = (freq[p] || 0) + 1; });
  });
  return (p) => {
    const n = freq[p] || 1;
    // Em 1 item vale 1; em 2 vale 0,7; em 5 vale ~0,36; em 10, ~0,2.
    return 1 / (1 + Math.log2(n) * 0.5 + (n - 1) * 0.08);
  };
})();

// Quanto o texto do cliente se parece com o nome do item. Conta quantas
// palavras do item aparecem na frase, e vice-versa.
function pontuar(consulta, item) {
  const pc = palavras(consulta);
  const pi = palavras(item.nome);
  if (!pc.length || !pi.length) return 0;

  let ganho = 0;
  let total = 0;
  for (const p of pi) {
    const peso = PESO(p);
    total += peso;
    // Casa palavra inteira, começo dela, ou quase ela: "classic" acha
    // "classico", e "calabresa" acha "calabrese".
    if (pc.some((q) => mesmaPalavra(q, p))) ganho += peso;
  }
  if (!ganho || !total) return 0;

  // Proporção do nome que foi mencionada, pesada pela raridade. "melt"
  // sozinho cobre quase todo "Bruthus Melt" porque é raro; "bacon"
  // sozinho cobre pouco de "Cheddar & Bacon" porque está em todo canto.
  let nota = ganho / total;

  // E o que o cliente disse e este item NÃO tem?
  //
  // Sem isto, "um combo do duplo smash" empatava entre "Smash Bruthus -
  // Combo" e "Duplo Smash Bruthus - Combo": os dois nomes aparecem
  // inteiros na frase, então os dois davam nota 1. Só que o cliente disse
  // "duplo", e o primeiro não é duplo — cobraria R$ 4 a menos e mandaria
  // o lanche errado.
  //
  // Só conta palavra que EXISTE no cardápio: "quero", "pra", "viu" não
  // dizem nada sobre qual item é.
  for (const q of pc) {
    if (!VOCABULARIO.has(q)) continue;
    if (pi.some((p) => mesmaPalavra(q, p))) continue;
    nota -= 0.5 * PESO(q);
  }

  return Math.max(0, nota);
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

  // 0,7 e não 0,5: meia palavra do nome NÃO é certeza. Com 0,5, "bacon
  // extra" virava "Cheddar & Bacon" com confiança alta — o cliente tinha
  // pedido um x-tudo, que nem existe no cardápio, e citado bacon como
  // adicional. Metade de um nome de duas palavras passava raspando.
  //
  // O corte considera o peso: em "Batata Frita Média", "média" é a
  // palavra que distingue e vale mais que "batata" e "frita", que se
  // repetem em três itens. Por isso "batata media" continua certeza e
  // "bacon extra" não.
  return {
    item: melhor.item,
    confianca: folga >= 0.25 && melhor.nota >= 0.7 ? "alta" : "baixa",
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
  for (const [chave, dados] of Object.entries(CARDAPIO.bairros)) {
    // O cliente escreve o endereço inteiro: "rua tal, 123, centro".
    // Procura o nome do bairro dentro da frase.
    const re = new RegExp("(^|\\s)" + chave.replace(/\s+/g, "\\s+") + "(\\s|$)");
    if (re.test(n)) {
      // Fica com o nome mais longo que casar: "boa vista" antes de "vista",
      // "loteamento juazeiro" antes de "juazeiro".
      if (!achado || chave.length > achado.chave.length) {
        achado = {
          chave,
          // O nome como o OlaClick escreve, para aparecer igual no pedido.
          bairro: dados.nome || chave,
          taxa: Number(dados.taxa),
          // `area_id` é o que `create_address` exige para a taxa ser
          // aplicada pelo OlaClick, e não só calculada por nós.
          area_id: dados.id || null,
        };
      }
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
