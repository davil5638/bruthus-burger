// ──────────────────────────────────────────────
// node infra/bot/medirCusto.js [quantas]
//
// Responde "quanto vou gastar de token por mês" com NÚMERO MEDIDO, não
// com chute: roda mensagens reais do diário pela IA e lê o `usage` que a
// própria API devolve.
//
// ATENÇÃO: faz chamadas REAIS e gasta de verdade. O padrão é 12
// mensagens, que custa centavos. Não aumente sem precisar.
//
// POR QUE NÃO ESTIMAR PELO TAMANHO DO PROMPT:
// porque eu erraria. O cardápio, as 35 taxas de bairro e as regras
// contam tokens de um jeito que não dá para olhar e adivinhar, e a
// OpenAI ainda desconta metade do que reconhece como prefixo repetido
// (`cached_tokens`). Medir custa centavos; chutar custa credibilidade.
// ──────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

try { require("dotenv").config({ path: path.resolve(__dirname, "../../.env") }); }
catch {} // eslint-disable-line no-empty

const cerebro = require("./cerebro");

// Preço por milhão de tokens. Fonte: tabela pública da OpenAI e da
// Anthropic em nov/2026. Se mudar, muda aqui — e o número muda com ele.
const PRECOS = {
  "gpt-4o":            { entrada: 2.50, cache: 1.25, saida: 10.00 },
  "claude-sonnet-5-5": { entrada: 2.00, cache: 0.20, saida: 10.00 },
  "claude-haiku-5-5":  { entrada: 0.10, cache: 0.01, saida: 0.50 },
};

// A loja abre de quarta a domingo: 5 noites por semana.
const NOITES_POR_MES = (365 / 12) * (5 / 7);

const DIARIO = process.env.DIARIO || "/dados/observacao.jsonl";
const QUANTAS = Number(process.argv[2] || 12);

const dinheiro = (v) => "R$ " + (v * 5.4).toFixed(2).replace(".", ",") + " (US$ " + v.toFixed(2) + ")";

(async () => {
  let todas = [];
  try {
    const QUEBRA = String.fromCharCode(10);
    todas = fs.readFileSync(DIARIO, "utf8").split(QUEBRA).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch (e) {
    console.log("não consegui ler o diário em " + DIARIO + ": " + e.message);
    process.exit(1);
  }

  // QUEM CUSTA DINHEIRO, E SÓ QUEM:
  // - linha de `hook` é pedido vindo do OlaClick: não passa pela IA;
  // - `dono_assumiu` sai do webhook ANTES de `decidir` — quando o dono
  //   entra na conversa, a IA nem é chamada;
  // - print, áudio sem texto e pedido encaminhado têm caminho próprio,
  //   resolvido por código antes da IA.
  // Contar mensagem que não chama a IA infla a conta do mês. Já inflei
  // uma vez neste mesmo script: deu 99 por noite, são 34.
  // "pedido_pelo_botao" é o pedido que o cliente fechou pelo link e
  // encaminhou: `codigoDoPedido` resolve na linha 658 do index.js, antes
  // da IA na 707. São 27 no diário — contá-los inflava a conta em 30%.
  const FORA_DA_IA = ["dono_assumiu", "print_pendente", "sem_texto", "pedido_do_olaclick", "pedido_pelo_botao"];
  const chamaIA = (x) => Boolean(
    !x.hook && x.texto && x.decisao && !FORA_DA_IA.includes(x.leitura && x.leitura.intencao)
  );

  const linhas = todas.filter(chamaIA);
  const porDia = {};
  const foraPorDia = {};
  todas.forEach((x) => {
    const dia = String(x.em || "").slice(0, 10);
    if (!dia) return;
    if (chamaIA(x)) porDia[dia] = (porDia[dia] || 0) + 1;
    else foraPorDia[dia] = (foraPorDia[dia] || 0) + 1;
  });

  const dias = Object.keys(porDia).sort();
  // A noite parcial (hoje, com a loja ainda fechada) fica fora da média:
  // ela puxaria o número para baixo e eu mentiria para menos.
  const cheias = dias.length > 1 ? dias.slice(0, dias.length - 1) : dias;
  const mediaPorNoite = cheias.reduce((s, d) => s + porDia[d], 0) / cheias.length;

  console.log("DIÁRIO: " + todas.length + " linhas, " + linhas.length + " que chamam a IA");
  dias.forEach((d) => console.log("  " + d + ": " + String(porDia[d]).padStart(3) + " chamam a IA   "
    + String(foraPorDia[d] || 0).padStart(3) + " não chamam (pedido do OlaClick, dono assumiu, print)"
    + (cheias.includes(d) ? "" : "   <- noite parcial, fora da média")));
  console.log("média por noite de operação: " + mediaPorNoite.toFixed(1));
  console.log("");

  // Pega as mensagens mais variadas que der: as últimas, sem repetir texto.
  const vistos = new Set();
  const amostra = [];
  for (let i = linhas.length - 1; i >= 0 && amostra.length < QUANTAS; i--) {
    const t = String(linhas[i].texto).trim();
    if (t.length < 2 || vistos.has(t)) continue;
    vistos.add(t);
    amostra.push(linhas[i]);
  }

  console.log("medindo " + amostra.length + " chamadas reais (isso gasta de verdade)...\n");

  let entrada = 0, cache = 0, saida = 0, ok = 0;
  for (const l of amostra) {
    await cerebro.pensar({ texto: l.texto, estado: null, pedido: null, fora: [], historico: [] })
      .catch((e) => ({ erro: e.message }));
    const u = cerebro.usoDeTokens();
    if (!u || !u.entrada) { console.log("  (sem uso registrado) " + String(l.texto).slice(0, 40)); continue; }
    ok++;
    entrada += u.entrada;
    cache += u.cacheLido || 0;
    saida += u.saida || 0;
    console.log("  " + String(u.entrada).padStart(5) + " entrada  "
      + String(u.cacheLido || 0).padStart(5) + " em cache  "
      + String(u.saida || 0).padStart(4) + " saída   | "
      + String(l.texto).replace(/\s+/g, " ").slice(0, 46));
  }

  if (!ok) { console.log("\nnenhuma chamada registrou uso — sem medida, sem resposta."); process.exit(1); }

  const mEntrada = entrada / ok, mCache = cache / ok, mSaida = saida / ok;
  console.log("\nMÉDIA POR MENSAGEM: " + mEntrada.toFixed(0) + " de entrada ("
    + mCache.toFixed(0) + " em cache) e " + mSaida.toFixed(0) + " de saída");

  const modelo = (cerebro.usoDeTokens() || {}).modelo || cerebro.MODELO;
  const porMes = mediaPorNoite * NOITES_POR_MES;
  console.log("MENSAGENS POR MÊS: " + porMes.toFixed(0)
    + " (" + mediaPorNoite.toFixed(1) + " por noite x " + NOITES_POR_MES.toFixed(1) + " noites)");
  console.log("");

  // DUAS CONTAS, DE PROPÓSITO. O desconto de prefixo repetido só vale
  // enquanto o cache está quente: na OpenAI ele expira depois de 5 a 10
  // minutos sem chamada. O movimento vem em rajada, com buraco entre uma
  // e outra, então a verdade fica ENTRE as duas colunas. Dar só a conta
  // com cache seria prometer o melhor caso como se fosse o normal.
  for (const [nome, p] of Object.entries(PRECOS)) {
    const semCache = Math.max(0, mEntrada - mCache);
    const comCache = (semCache * p.entrada + mCache * p.cache + mSaida * p.saida) / 1e6;
    const zeroCache = (mEntrada * p.entrada + mSaida * p.saida) / 1e6;
    console.log((nome === modelo ? "> " : "  ") + nome.padEnd(20)
      + "por mês: " + dinheiro(comCache * porMes) + " com cache quente"
      + "   até " + dinheiro(zeroCache * porMes) + " sem cache nenhum");
  }
  console.log("\n> = o modelo que está rodando agora. Dólar a R$ 5,40.");
  process.exit(0);
})();
