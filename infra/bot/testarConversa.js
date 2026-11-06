// ──────────────────────────────────────────────
// node infra/bot/testarConversa.js
//
// Ensaia conversas inteiras contra a lógica de decisão do bot, sem abrir
// porta, sem webhook e sem mandar mensagem para ninguém.
//
// POR QUE EXISTE:
// O pedido do irmão do dono morreu em silêncio em 05/11/2026 — "Rua
// Manoel Messias 233" sem bairro travou o fluxo, o bot ia repetir a
// pergunta, a trava anti-repetição engoliu, e nem cliente nem dono
// souberam. Esse tipo de defeito não aparece testando frase isolada: só
// aparece na conversa, turno após turno, com o estado acumulando.
//
// Até aqui a única forma de ensaiar era na noite de operação, com
// cliente de verdade. Agora não.
// ──────────────────────────────────────────────

process.env.DIARIO = process.env.DIARIO || require("path").join(require("os").tmpdir(), "ensaio-bot.jsonl");
process.env.PEDIDOS_EM_CURSO = process.env.PEDIDOS_EM_CURSO
  || require("path").join(require("os").tmpdir(), "ensaio-pedidos.json");
// Ninguém é alertado e nada é enviado durante o ensaio.
process.env.ALERTAR_DONO = "0";
process.env.RESPONDER = "0";

const fs = require("fs");
for (const f of [process.env.DIARIO, process.env.PEDIDOS_EM_CURSO]) {
  try { fs.unlinkSync(f); } catch {} // eslint-disable-line no-empty
}

const bot = require("./index");
const pedidos = require("./pedidoEmCurso");

// Mesma dança do index.js: no container os scripts ficam em /app/scripts,
// no repositório na raiz. Esqueci disto aqui e o ensaio rodava inteiro,
// passava em tudo, e só estourava na hora de imprimir o resumo — na VM,
// não na minha máquina.
const cardapio = (() => {
  try { return require("./scripts/cardapio"); }
  catch { return require("../../scripts/cardapio"); }
})();

// A loja está aberta no ensaio: é o cenário em que se toma pedido. Não
// mexe na loja real — é só o objeto que a decisão recebe, pelo terceiro
// argumento de `decidir`.
//
// Esse argumento precisou existir: antes o ensaio passava aqui e
// quebrava na VM com os MESMOS arquivos, porque `decidir` ia buscar o
// estado real. Sem token, local, a busca falhava e virava "aberta" por
// acidente; na VM, às 12h, voltava "fechada" de verdade.
const LOJA_ABERTA = {
  situacao: "aberta",
  funcionamento: "de quarta a domingo, das 18:30 às 23:00",
  indisponiveis: { nomes: [], massaAcabou: false },
  abertura: { hoje: true },
};

let falhas = 0;

async function ensaiar(titulo, conversa, turnos) {
  console.log(`\n── ${titulo}`);
  pedidos.fechar(conversa);

  for (const turno of turnos) {
    const msg = { conversa, nome: "Ensaio", texto: turno.diz, tipo: "conversation" };
    let leitura = await bot.tratarPedidoEmCurso(msg, turno.diz, LOJA_ABERTA);
    if (!leitura) leitura = await bot.decidir(turno.diz, msg, LOJA_ABERTA);

    const responde = bot.podeResponder(leitura) && Boolean(leitura.mensagem);
    const saida = responde ? leitura.mensagem : `«não responde — ${leitura.acao || leitura.intencao}»`;

    console.log(`\n  cliente: ${turno.diz}`);
    console.log(`  bot:     ${String(saida).replace(/\n/g, "\n           ")}`);

    if (turno.esperar) {
      const bate = turno.esperar.test(String(saida));
      if (!bate) {
        falhas += 1;
        console.log(`  >>> FALHA: esperava ${turno.esperar}`);
      }
    }
    if (turno.naoPodeCalar && !responde) {
      falhas += 1;
      console.log("  >>> FALHA: calou, e aqui calar perde o pedido");
    }
  }

  const p = pedidos.pegar(conversa);
  if (p) {
    const conta = pedidos.somar(p, cardapio);
    console.log(`\n  estado: ${p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(" + ") || "sem item"}`);
    console.log(`          bairro: ${p.bairro ? p.bairro.bairro : "—"} | rua: ${p.enderecoTexto || p.endereco || "—"}`);
    console.log(`          pendências: ${(p.perguntas || []).map((q) => q.tipo + ":" + (q.falta || q.consulta)).join(", ") || "—"}`);
    console.log(`          total: R$ ${conta.total.toFixed(2).replace(".", ",")}`);
  }
  pedidos.fechar(conversa);
}

(async () => {
  // ── O caso real que falhou ──
  await ensaiar("Renan, 05/11/2026 — o pedido que morreu calado", "ensaio-renan@lid", [
    { diz: "Boa noite" },
    // A coca não pode ser engolida: tem que virar pergunta.
    { diz: "Quero 1 smash e 1 coca", esperar: /coca/i, naoPodeCalar: true },
    { diz: "lata normal", naoPodeCalar: true },
    // Aqui travava. Agora tem que perguntar o BAIRRO, não repetir
    // "me passa o endereço".
    { diz: "Rua Manoel Messias 233", esperar: /bairro/i, naoPodeCalar: true },
    { diz: "Palestina", esperar: /pix|cartão|cartao|dinheiro/i, naoPodeCalar: true },
    { diz: "dinheiro", esperar: /troco/i, naoPodeCalar: true },
    { diz: "não precisa", esperar: /confere|certo|total/i, naoPodeCalar: true },
  ]);

  // ── Vários itens e quantidade ──
  await ensaiar("Dois itens com quantidade", "ensaio-dois@lid", [
    { diz: "quero 2 smash bruthus e uma coca 600 zero", esperar: /endereço|endereco/i, naoPodeCalar: true },
    { diz: "Rua do Cajueiro 50, Centro", esperar: /pix|cartão|cartao|dinheiro/i, naoPodeCalar: true },
  ]);

  // ── O endereço vem completo de uma vez ──
  await ensaiar("Endereço completo numa mensagem", "ensaio-completo@lid", [
    { diz: "1 calabresa", naoPodeCalar: true },
    { diz: "Rua Manoel Messias 233, Palestina", esperar: /pix|cartão|cartao|dinheiro/i, naoPodeCalar: true },
  ]);

  // ── Responde a coca pela metade ──
  await ensaiar("Responde só metade da pergunta da coca", "ensaio-meia@lid", [
    { diz: "1 coca", esperar: /lata|600|litro/i, naoPodeCalar: true },
    { diz: "zero", esperar: /lata|600|litro|tamanho/i, naoPodeCalar: true },
    { diz: "1 litro", naoPodeCalar: true },
  ]);

  console.log(falhas ? `\n${falhas} FALHA(S) — não suba assim.` : "\nTodos os ensaios passaram.");
  process.exit(falhas ? 1 : 0);
})();
