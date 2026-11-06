// ──────────────────────────────────────────────
// node scripts/testarCardapio.js
//
// POR QUE ESTE ARQUIVO EXISTE:
// O casamento de item já quebrou três vezes, e cada quebra custou de
// verdade — lanche errado na chapa ou R$ 4 a menos no pedido. Nas duas
// primeiras vezes o teste foi improvisado e jogado fora, então a terceira
// quebra não tinha rede nenhuma. Agora tem.
//
// Cada caso aqui é um erro que ACONTECEU, não um caso imaginado. Se você
// mexer no escore (`pontuar`, `PESO`, limites de confiança), rode isto
// antes de subir.
// ──────────────────────────────────────────────

const c = require("./cardapio");

let falhas = 0;
let total = 0;

function ok(descricao, condicao, obtido) {
  total += 1;
  if (condicao) {
    console.log(`  ok   ${descricao}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${descricao}\n        obtido: ${obtido}`);
  }
}

// ── 1. Um item, com confiança alta ──
// O par smash / duplo smash / combo é o mais perigoso do cardápio: três
// nomes parecidos com R$ 4 e R$ 18 de diferença entre eles.
console.log("\nItem único — o par smash/duplo/combo:");
const umItem = [
  ["smash", "Smash Bruthus ( carne 80g )"],
  ["quero um smash", "Smash Bruthus ( carne 80g )"],
  ["duplo smash", "Duplo Smash Bruthus"],
  ["combo smash", "Smash Bruthus - Combo"],
  ["um combo do duplo smash", "Duplo Smash Bruthus - Combo"],
  ["calabresa", "Calabrese"],
  ["pizza de calabresa", "Calabrese"],
  ["manda uma calabresa", "Calabrese"],
];
for (const [frase, esperado] of umItem) {
  const r = c.buscarItem(frase);
  ok(
    `"${frase}" → ${esperado}`,
    r && r.confianca === "alta" && r.item.nome === esperado,
    r ? `${r.confianca} ${r.item.nome}` : "NADA",
  );
}

// ── 2. O que o bot NÃO pode adivinhar ──
// "bacon extra" virava "Cheddar & Bacon" com confiança alta. O cliente
// tinha pedido um x-tudo, que não existe, e citado bacon como adicional.
console.log("\nNa dúvida, pergunta (confiança baixa):");
for (const frase of ["bacon extra", "x tudo", "um lanche"]) {
  const r = c.buscarItem(frase);
  ok(`"${frase}" não resolve sozinho`, !r || r.confianca === "baixa", r ? `${r.confianca} ${r.item.nome}` : "NADA");
}

// ── 3. Vários itens numa mensagem ──
// "1 calabresa e 1 coca 1l" devolvia SÓ a coca: o item de R$ 49 sumia e
// ficava o de R$ 11,99. Era um `buscarItem` para a mensagem inteira.
console.log("\nVários itens e quantidade:");
const varios = [
  ["quero 2 smash bruthus e uma coca 600 zero", ["2x Smash Bruthus ( carne 80g )", "1x Coca-Cola Zero 600ml"]],
  ["2 pizza calabresa, 1 coca lata normal", ["2x Calabrese", "1x Coca-Cola Lata Tradicional"]],
  ["1 smash com batata media e 1 coca zero 600", ["1x Smash Bruthus ( carne 80g )", "1x Coca-Cola Zero 600ml"]],
  ["2 smash", ["2x Smash Bruthus ( carne 80g )"]],
  ["quero um combo do duplo smash", ["1x Duplo Smash Bruthus - Combo"]],
];
for (const [frase, esperado] of varios) {
  const r = c.buscarItens(frase);
  const obtido = r.itens.map((i) => `${i.qtd}x ${i.item.nome}`);
  ok(`"${frase}"`, JSON.stringify(obtido) === JSON.stringify(esperado), JSON.stringify(obtido));
}

// ── 4. A coca, que mexe no preço ──
// Lata 6,99 / 600ml 9,99 / 1 litro 11,99. `buscarItem` devolvia TODAS com
// confiança baixa apontando para a lata — e o fluxo de pedido, que exige
// confiança alta, descartava a coca calado. Foi o que aconteceu com o
// pedido do Renan em 05/11/2026.
console.log("\nCoca: resolve quando dá, pergunta quando não dá:");
const cocas = [
  ["coca lata zero", "Coca-Cola Lata Zero"],
  ["coca lata normal", "Coca-Cola Lata Tradicional"],
  ["coca 600 zero", "Coca-Cola Zero 600ml"],
  ["coca 600 normal", "Coca-Cola Original 600ml"],
  ["coca 1 litro normal", "Coca-Cola Normal 1L"],
  ["coca 1l zero", "Coca-Cola Zero 1L"],
];
for (const [frase, esperado] of cocas) {
  const r = c.lerCocaPedida(frase);
  ok(`"${frase}" → ${esperado}`, r && r.item && r.item.nome === esperado, JSON.stringify(r && (r.item ? r.item.nome : r.falta)));
}

const perguntaCoca = [
  ["1 coca", "ambos"],
  ["uma coca", "ambos"],
  ["coca zero", "tamanho"],
  ["coca 1 litro", "versao"],
  ["coca lata", "versao"],
];
for (const [frase, falta] of perguntaCoca) {
  const r = c.lerCocaPedida(frase);
  ok(`"${frase}" → pergunta ${falta}`, r && !r.item && r.falta === falta, JSON.stringify(r));
}

// A coca nunca deve ser engolida em silêncio no meio de um pedido.
const comCoca = c.buscarItens("Quero 1 smash e 1 coca");
ok(
  "\"Quero 1 smash e 1 coca\" pergunta a coca em vez de descartar",
  comCoca.itens.length === 1 && comCoca.perguntas.some((p) => p.tipo === "coca"),
  JSON.stringify({ itens: comCoca.itens.map((i) => i.item.nome), perguntas: comCoca.perguntas }),
);

// ── 5. Endereço ──
// "Rua Manoel Messias 233" não traz bairro, e o código descartava o
// endereço INTEIRO quando não reconhecia o bairro.
console.log("\nEndereço:");
ok("rua sem bairro não casa bairro", c.taxaBairro("Rua Manoel Messias 233") === null, JSON.stringify(c.taxaBairro("Rua Manoel Messias 233")));
ok("bairro sozinho casa", c.taxaBairro("Palestina")?.bairro === "Palestina", JSON.stringify(c.taxaBairro("Palestina")));
ok("rua com bairro casa", c.taxaBairro("Rua Manoel Messias 233, Palestina")?.bairro === "Palestina", JSON.stringify(c.taxaBairro("Rua Manoel Messias 233, Palestina")));
ok("endereço não vira item", c.buscarItens("Rua Manoel Messias 233").itens.length === 0, JSON.stringify(c.buscarItens("Rua Manoel Messias 233").itens));

// ── 6. Saudação não é pedido ──
ok("\"boa noite\" não vira item", c.buscarItens("boa noite").itens.length === 0, JSON.stringify(c.buscarItens("boa noite").itens));

console.log(`\n${total - falhas}/${total} casos certos`);
if (falhas) {
  console.log(`${falhas} FALHA(S) — não suba assim.`);
  process.exit(1);
}
