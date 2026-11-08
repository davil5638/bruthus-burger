// ──────────────────────────────────────────────
// node infra/bot/medirIA.js <diario.jsonl>
//
// Passa as mensagens REAIS de cliente pelo bot com a IA ligada e mostra,
// uma por uma, o que ela responderia — ao lado do que o bot fez na hora.
//
// POR QUE EXISTE:
// Eu já entreguei a este dono um ensaio que passava por acidente (a
// chamada ao OlaClick falhava sem token e o catch devolvia "loja
// aberta"). Com IA é mais fácil ainda se enganar: ela responde bonito,
// a gente lê duas respostas boas e conclui que está pronto.
//
// Então aqui não se afirma nada sem medir. O que sai é contagem e texto
// cru, para o dono ler as respostas dele mesmo.
//
// O QUE ISTO OLHA ESPECIALMENTE: invenção. Item que não existe e preço
// que não existe são as duas mentiras que custam dinheiro, e cerebro.js
// barra as duas. Aqui conta-se quantas vezes a barreira foi usada.
//
// NÃO cria pedido no OlaClick: `criarPedido.criar` é substituído antes
// do index.js carregar.
// ──────────────────────────────────────────────

const fs = require("fs");
const os = require("os");
const path = require("path");

// No container as variáveis vêm do compose e o dotenv pode não existir.
try { require("dotenv").config({ path: path.resolve(__dirname, "../../.env") }); }
catch {} // eslint-disable-line no-empty

process.env.ALERTAR_DONO = "0";
process.env.RESPONDER = "0";
process.env.USAR_IA = "1";
process.env.DIARIO = path.join(os.tmpdir(), "medir-ia.jsonl");
process.env.PEDIDOS_EM_CURSO = path.join(os.tmpdir(), "medir-ia-pedidos.json");
for (const f of [process.env.DIARIO, process.env.PEDIDOS_EM_CURSO]) {
  try { fs.unlinkSync(f); } catch {} // eslint-disable-line no-empty
}

const criarPedido = (() => {
  try { return require("./scripts/criarPedido"); }
  catch { return require("../../scripts/criarPedido"); }
})();
criarPedido.criar = async () => ({ ok: true, public_id: "BR-MEDICAO", total: 0 });

const bot = require("./index");
const pedidos = require("./pedidoEmCurso");

// Loja aberta, numa sexta à noite: é o estado em que essas mensagens
// chegaram de verdade. Medir com a loja fechada responderia "estamos
// fechados" em tudo e não mediria nada.
const LOJA = {
  situacao: "aberta",
  agora: "20:30",
  dia: "friday",
  horarioDeHoje: [{ open: "18:30", close: "23:00" }],
  funcionamento: { dias: "de quarta a domingo", abre: "18:30", fecha: "23:00", texto: "de quarta a domingo, das 18:30 às 23:00" },
  abreHojeMaisTarde: false,
  indisponiveis: { nomes: [], massaAcabou: false },
  proximaAbertura: null,
};

const CORTE = 90;
const uma = (t) => String(t || "").replace(/\s+/g, " ").trim();

(async () => {
  const arquivo = process.argv[2];
  if (!arquivo || !fs.existsSync(arquivo)) {
    console.log("uso: node infra/bot/medirIA.js <diario.jsonl>");
    process.exit(1);
  }

  const linhas = fs.readFileSync(arquivo, "utf8")
    .split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((l) => l && l.texto && l.decisao);

  console.log(`${linhas.length} mensagens de cliente. Modelo: ${require("./cerebro").MODELO}\n`);

  const antes = {};
  const depois = {};
  const casos = [];
  let invencoesBarradas = 0;

  for (let k = 0; k < linhas.length; k++) {
    const l = linhas[k];
    antes[l.decisao] = (antes[l.decisao] || 0) + 1;

    const conversa = "medir-" + (l.conversa || k);
    pedidos.fechar(conversa);
    const msg = { conversa, nome: l.nome, texto: l.texto, tipo: "conversation" };

    let leitura;
    try {
      leitura = await bot.decidir(l.texto, msg, LOJA);
    } catch (e) {
      leitura = { intencao: "ERRO", acao: e.message, escalar: true };
    }
    pedidos.fechar(conversa);

    const responde = bot.podeResponder(leitura) && Boolean(leitura.mensagem);
    const d = responde ? "responde" : "chama_o_dono";
    depois[d] = (depois[d] || 0) + 1;
    // cerebro.js escreve o motivo quando barra preço ou item inventado.
    if (/preço que não existe|não existe ou acabou/.test(leitura.acao || "")) invencoesBarradas++;

    casos.push({
      cliente: l.texto,
      antesDecisao: l.decisao,
      antesMensagem: l.leitura && l.leitura.mensagem,
      agoraDecisao: d,
      intencao: leitura.intencao,
      porIA: Boolean(leitura.porIA),
      acao: leitura.acao,
      mensagem: leitura.mensagem,
    });

    process.stderr.write(`\r${k + 1}/${linhas.length}`);
  }
  process.stderr.write("\r \r");

  // ── 1. O que mudou de silêncio para resposta ──
  console.log("═".repeat(70));
  console.log("ANTES CHAMAVA O DONO, AGORA A IA RESPONDE");
  console.log("═".repeat(70));
  const virou = casos.filter((c) => c.antesDecisao !== "responde" && c.agoraDecisao === "responde");
  virou.forEach((c) => {
    console.log(`\ncliente: ${uma(c.cliente).slice(0, CORTE)}`);
    console.log(`bot:     ${uma(c.mensagem).slice(0, 240)}`);
  });

  // ── 2. Regressão: era respondida e deixou de ser ──
  const regressao = casos.filter((c) => c.antesDecisao === "responde" && c.agoraDecisao !== "responde");
  if (regressao.length) {
    console.log(`\n${"═".repeat(70)}`);
    console.log("DEIXOU DE RESPONDER (olhar uma por uma)");
    console.log("═".repeat(70));
    regressao.forEach((c) => {
      console.log(`\ncliente: ${uma(c.cliente).slice(0, CORTE)}`);
      console.log(`  antes: ${uma(c.antesMensagem).slice(0, 120)}`);
      console.log(`  agora: ${c.intencao} — ${uma(c.acao).slice(0, 140)}`);
    });
  }

  // ── 3. O que ainda vai para o dono ──
  console.log(`\n${"═".repeat(70)}`);
  console.log("AINDA CHAMA O DONO");
  console.log("═".repeat(70));
  const porIntencao = {};
  casos.filter((c) => c.agoraDecisao !== "responde").forEach((c) => {
    (porIntencao[c.intencao] = porIntencao[c.intencao] || []).push(c);
  });
  Object.keys(porIntencao).sort((a, b) => porIntencao[b].length - porIntencao[a].length).forEach((k) => {
    console.log(`\n  ${k} (${porIntencao[k].length})`);
    porIntencao[k].slice(0, 8).forEach((c) => console.log(`     | ${uma(c.cliente).slice(0, CORTE)}`));
  });

  // ── 4. Conta final ──
  console.log(`\n${"═".repeat(70)}`);
  console.log(`mensagens de cliente:        ${linhas.length}`);
  console.log(`ANTES   respondidas:         ${antes.responde || 0}`);
  console.log(`        chamaram o dono:     ${linhas.length - (antes.responde || 0)}`);
  console.log(`AGORA   respondidas:         ${depois.responde || 0}`);
  console.log(`        chamam o dono:       ${depois.chama_o_dono || 0}`);
  console.log(`respondidas pela IA:         ${casos.filter((c) => c.porIA && c.agoraDecisao === "responde").length}`);
  console.log(`invenções barradas:          ${invencoesBarradas}  (item ou preço que não existe)`);
  console.log(`deixaram de ser respondidas: ${regressao.length}`);
  console.log("═".repeat(70));
  process.exit(0);
})();
