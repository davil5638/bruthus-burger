// ──────────────────────────────────────────────
// cerebro.js — a IA que ENTENDE e RESPONDE.
//
// POR QUE ISTO EXISTE (e por que o que havia antes estava errado):
// Até aqui quem lia o cliente era regex escrita à mão. Funcionava no
// pedido reenviado pelo botão do OlaClick, que é texto fixo, e falhava
// em gente escrevendo. "Boa noitee" passava porque eu previ o "e"
// sobrando; "Boa noitte" não passava, porque eu não previ o "t". Duas
// noites de operação: 91 mensagens de cliente, 68 jogadas pro dono.
//
// O erro de desenho era meu: eu usei regra também para CONVERSAR. O
// certo é o que está aqui — modelo na frente para entender, código
// atrás para fazer.
//
// A DIVISÃO DE TRABALHO, que é o ponto todo:
//   a IA     → entende o que a pessoa quis dizer e escreve a resposta
//   o código → confere item, calcula preço, cria o pedido no OlaClick
//
// A IA NUNCA escolhe item por nome e NUNCA inventa preço. Ela devolve o
// NÚMERO do item na lista que eu mandei. Número que não existe, ou item
// escondido pelo dono, é descartado aqui. Preço quem soma é o código.
// Resposta errada do modelo custa uma frase estranha; preço errado
// custa dinheiro do dono, e por isso preço não passa por ele.
// ──────────────────────────────────────────────

const axios = require("axios");

// O dotenv tem que vir ANTES de qualquer leitura de process.env: eu já
// escrevi este arquivo lendo a chave numa const no topo e, pela linha de
// comando, ela vinha vazia com o .env ali do lado, preenchido.
// O .env é conveniência de máquina local. No container as variáveis já
// vêm do compose, e o dotenv pode nem estar instalado — por isso o try.
function envLocal() {
  try { require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") }); }
  catch {} // eslint-disable-line no-empty
}
if (require.main === module) envLocal();

// ──────────────────────────────────────────────
// QUAL MODELO RESPONDE
//
// Sonnet, escolha do dono. É o que entende português escrito torto sem
// eu precisar prever o jeito: "Boa noitte", "Noite!", "tem pastel?".
//
// A OpenAI fica como segunda opção só para o bot não ficar mudo se a
// chave da Anthropic faltar — não é preferência, é não deixar a loja sem
// atendimento numa noite de sexta.
// ──────────────────────────────────────────────
const chaveClaude = () => process.env.ANTHROPIC_API_KEY || "";
const chaveOpenAI = () => process.env.OPENAI_API_KEY || "";

const MODELO = process.env.CEREBRO_MODELO || "claude-sonnet-5-5";
const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-4o";
// Em chat vale esforço baixo: a tarefa é entender uma frase curta e
// responder curto, e o cliente está esperando no WhatsApp. Em env para
// subir sem mexer em código se alguma resposta sair rasa.
const ESFORCO = process.env.CEREBRO_ESFORCO || "low";
const TIMEOUT = Number(process.env.CEREBRO_TIMEOUT || 20000);

function qualProvedor() {
  if (chaveClaude()) return "claude";
  if (chaveOpenAI()) return "openai";
  return null;
}

const cardapio = (() => {
  try { return require("./scripts/cardapio"); }
  catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
    return require("../../scripts/cardapio");
  }
})();

const ITENS = cardapio.CARDAPIO.itens;
const LABEL_CARDAPIO = "CARDÁPIO (responda com o NÚMERO do item, nunca com o nome):";

// ──────────────────────────────────────────────
// O cardápio como a IA vê: numerado. Ela responde números.
//
// Numerar em vez de deixar ela escrever o nome é o que impede invenção.
// "Pastel de carne de sol" não tem número, então não há como pedir.
// ──────────────────────────────────────────────
function listaDeItens(fora = []) {
  const escondido = new Set(fora.map((n) => cardapio.normalizar(n)));
  return ITENS.map((i, n) => {
    const esgotado = escondido.has(cardapio.normalizar(i.nome));
    const preco = i.preco.toFixed(2).replace(".", ",");
    return `#${n} ${i.nome} — R$ ${preco} (${i.cat})${esgotado ? " [ACABOU HOJE]" : ""}`;
  }).join("\n");
}

function itemPorNumero(n, fora = []) {
  const i = ITENS[Number(n)];
  if (!i) return null;
  const escondido = new Set(fora.map((x) => cardapio.normalizar(x)));
  if (escondido.has(cardapio.normalizar(i.nome))) return null;   // acabou hoje
  return i;
}

// ──────────────────────────────────────────────
// As regras do dono, ditadas por ele. Vão no prompt porque são decisão
// de negócio, não de código, e ele muda de ideia sem precisar de deploy.
// ──────────────────────────────────────────────
// A tabela de taxa por bairro, do cardapio real.
//
// Existe porque sem ela o modelo INVENTA politica de entrega. Na prova de
// 08/11 ele respondeu "a entrega pro centro ta incluida nos nossos
// precos" — e o centro custa R$ 2,00. Nao foi preco errado (a barreira de
// preco nao viu nada), foi uma afirmacao errada sobre como a loja cobra,
// que e pior: o cliente chega no fim da conta achando que foi engando.
// So cabe no prompt porque sao 35 bairros e 712 caracteres, e vai na
// parte fixa, que e cacheada.
function tabelaDeBairros(c) {
  return Object.entries(c.bairros || {})
    .map(([chave, d]) => `${d.nome || chave}: R$ ${Number(d.taxa).toFixed(2).replace(".", ",")}`)
    .join(" | ");
}

function regrasDoDono(c) {
  return [
    `Você atende no WhatsApp da ${c.loja || "Bruthus Burger & Pizza"}, em Canindé-CE.`,
    "Fala como gente de balcão: curto, direto, cordial, sem formalidade de empresa. Pode usar emoji com parcimônia.",
    "NUNCA pergunte ponto da carne nem maionese: não existe essa escolha no cardápio.",
    "Para tomar um pedido você só precisa de: endereço (rua + bairro) e forma de pagamento.",
    "Em combo, pergunte QUAL coca: lata, 600ml ou 1 litro, e se é zero ou normal.",
    "Batata pequena é o padrão quando a pessoa não disser o tamanho.",
    "Se for dinheiro, diga o total e pergunte se precisa de troco para quanto.",
    "Na dúvida entre duas coisas, PERGUNTE ao cliente em uma frase curta. Não escolha por ele.",
    "Pizza: as pizzas estão no mesmo link do cardápio, junto com os hambúrgueres. Diga isso quando perguntarem de pizza.",
    "Se perguntarem de algo que não está na lista de itens, não invente: diga que vai confirmar e marque escalar.",
    // A lista numerada é ferramenta interna minha. Na medição de 08/11 o
    // modelo colou ela inteira para quem pediu o cardápio — "#0 Crispy
    // Cream, #1 Batata Frita M..." — e isso é lixo chegando no cliente.
    "NUNCA escreva a lista de itens nem os números (#0, #1...) na resposta: os números são internos.",
    `Quem pedir o cardápio recebe o link: ${process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products"}`,
    "Pode citar no máximo 3 itens pelo nome, quando estiver ajudando a escolher.",
    `Pedido mínimo: R$ ${Number(c.pedido_minimo || 0).toFixed(2).replace(".", ",")}.`,
    `Tempo de entrega: ${c.tempo_entrega || "40 a 60 minutos"}.`,
    "",
    // Escrita como o cliente pode ouvir, de proposito: o modelo repete a
    // regra quase palavra por palavra. "a entrega NUNCA e gratis" virou
    // "A entrega nunca e de graca." na cara do cliente, que e verdade
    // dita com rispidez. A informacao e a mesma; o tom nao.
    "TAXA DE ENTREGA POR BAIRRO (toda entrega tem taxa, que varia conforme o bairro; nunca esta inclusa no preco do item):",
    tabelaDeBairros(c),
    "Bairro que nao esta nesta lista: diga que vai confirmar a taxa e marque escalar. Nao estime.",
  ].join("\n");
}

const COMO_RESPONDER = `
Devolva SÓ um JSON, sem texto fora dele, com estas chaves:

{
  "intencao": uma destas:
     "conversa"        — saudação, agradecimento, elogio, papo
     "pergunta"        — dúvida sobre cardápio, horário, entrega, pagamento, loja
     "pedido"          — a pessoa quer pedir algo
     "resposta_ao_bot" — ela está respondendo uma pergunta que o bot fez
     "acompanhar"      — "cadê meu pedido", "já saiu?"
     "problema"        — reclamação, pedido errado, atraso
     "nao_sei"         — você não entendeu, ou é assunto que não é seu
  "resposta": o que mandar no WhatsApp, em português do Brasil. "" se for escalar.
  "itens": [{"n": número do item no cardápio, "qtd": quantidade}]  — só em "pedido"
  "rua": rua e número, se a pessoa disse. null se não.
  "bairro": o bairro, se ela disse. null se não.
  "pagamento": "pix" | "card" | "cash" | null
  "troco": número (para quanto precisa de troco) ou null
  "escalar": true quando o dono tem que entrar. Use em "acompanhar",
             "problema", "nao_sei" e em qualquer coisa que você não tenha
             certeza. Ficar quieto é melhor do que responder errado.
  "motivo": uma linha curta, para o dono ler no painel, dizendo o que você entendeu.
}

NUNCA escreva preço na "resposta" quando a intenção for "pedido" — quem
soma é o sistema. Em "pergunta" só cite preço que esteja na lista acima,
copiado igual.
Se o item que ela quer está marcado [ACABOU HOJE], diga que acabou e
ofereça outro parecido que NÃO esteja marcado.
`.trim();

function contexto({ estado, pedido, fora = [] }) {
  const linhas = [];
  if (estado) {
    const sit = { aberta: "ABERTA agora", pausada: "dentro do horário mas PAUSADA (produção cheia)", fechada: "FECHADA agora" };
    linhas.push(`Situação da loja: ${sit[estado.situacao] || estado.situacao}.`);
    if (estado.funcionamento) {
      const f = estado.funcionamento;
      linhas.push(`Funcionamento: ${typeof f === "string" ? f : f.texto}.`);
    }
    if (estado.proximaAbertura) {
      linhas.push(`Abre de novo: ${estado.proximaAbertura.dia} às ${estado.proximaAbertura.hora}.`);
    }
    if (estado.abreHojeMaisTarde) linhas.push("Hoje ainda abre: pode oferecer agendar, avisando que sai quando o entregador começar.");
    if (estado.indisponiveis?.massaAcabou) linhas.push("A MASSA DE PIZZA ACABOU hoje: nenhuma pizza sai. Não ofereça pizza.");
  }
  if (fora.length) linhas.push(`Acabou hoje: ${fora.join(", ")}.`);
  if (pedido) {
    linhas.push("");
    linhas.push("JÁ EXISTE UM PEDIDO SENDO TOMADO NESTA CONVERSA:");
    if (pedido.itens?.length) {
      linhas.push("  itens: " + pedido.itens.map((x) => `${x.qtd || 1}x ${x.item?.nome || x.nome}`).join(", "));
    }
    if (pedido.enderecoTexto) linhas.push(`  endereço: ${pedido.enderecoTexto}`);
    if (pedido.bairro) linhas.push(`  bairro: ${pedido.bairro}`);
    if (pedido.pagamento) linhas.push(`  pagamento: ${pedido.pagamento}`);
    if (pedido.perguntas?.length) {
      linhas.push(`  o bot perguntou: ${pedido.perguntas.map((p) => p.tipo).join(", ")} — a mensagem dela provavelmente é a RESPOSTA disso.`);
    }
  }
  return linhas.join("\n");
}

// ──────────────────────────────────────────────
// Preço que o modelo escreveu tem que existir no cardápio.
//
// É a rede contra a única mentira que custa dinheiro. Se aparecer um
// "R$ 31,50" que não é de nenhum item nem de nenhuma taxa de bairro,
// a resposta não sai: vira escalar.
// ──────────────────────────────────────────────
function precosConferem(resposta) {
  const citados = String(resposta).match(/R\$\s*\d+[.,]?\d*/g) || [];
  if (!citados.length) return true;
  const validos = new Set();
  const por = (v) => {
    validos.add(Number(v).toFixed(2));
    validos.add(String(Number(v)));
  };
  ITENS.forEach((i) => por(i.preco));
  Object.values(cardapio.CARDAPIO.bairros).forEach((b) => por(b.taxa));
  por(cardapio.CARDAPIO.pedido_minimo || 0);
  // Soma de itens é legítima também, mas aqui o modelo não deveria estar
  // somando — quem soma é `precificar`. Então exige valor conhecido.
  return citados.every((c) => {
    const n = Number(c.replace(/R\$\s*/, "").replace(",", "."));
    return validos.has(n.toFixed(2)) || validos.has(String(n));
  });
}

// ──────────────────────────────────────────────
// A CHAMADA AO SONNET.
//
// Três coisas desta API não são o que eu teria escrito de memória, e as
// três dariam erro em produção:
//
//  1. `temperature` não existe mais — devolve 400. Não há como "baixar a
//     criatividade" por parâmetro; quem segura o modelo é o prompt e a
//     conferência que o código faz depois.
//  2. `thinking: {type:"disabled"}` também devolve 400 neste modelo. O
//     jeito de não gastar tempo pensando é `between_tools`, que só é
//     aceito com esforço `high` ou menor e não aceita nenhum outro campo
//     junto. Importa aqui: o cliente está olhando o WhatsApp esperando.
//  3. Recusa do classificador de segurança NÃO vira exceção: vem 200 com
//     `stop_reason: "refusal"`. Sem olhar isso, o bot leria conteúdo
//     vazio e acharia que a IA respondeu.
// ──────────────────────────────────────────────
// Ultimo consumo de tokens, para a medicao poder dizer quanto custou de
// verdade em vez de eu estimar.
let ULTIMO_USO = null;
let clienteClaude = null;
function claude() {
  if (clienteClaude) return clienteClaude;
  // O pacote exporta o construtor direto em CommonJS e em `.default`
  // quando empacotado como ESM. Aceita os dois em vez de descobrir qual
  // é numa noite de sexta.
  const mod = require("@anthropic-ai/sdk");
  const Anthropic = mod.default || mod;
  clienteClaude = new Anthropic({ apiKey: chaveClaude(), timeout: TIMEOUT });
  return clienteClaude;
}

async function perguntarAoClaude(fixo, variavel, mensagens) {
  const r = await claude().messages.create({
    model: MODELO,
    max_tokens: 700,
    // Dois blocos: o primeiro e marcado para cache e repete igual a noite
    // toda; o segundo e o estado da loja, que muda a cada mensagem.
    system: [
      { type: "text", text: fixo, cache_control: { type: "ephemeral" } },
      { type: "text", text: variavel },
    ],
    messages: mensagens,
    // Sem raciocínio extra: é uma frase curta para entender e uma para
    // responder. Latência aqui é cliente esperando.
    thinking: { type: "between_tools" },
    output_config: { effort: ESFORCO },
  });
  // Confere se o cache pegou. Sem isso a economia e fe, nao medida.
  ULTIMO_USO = {
    entrada: r.usage?.input_tokens,
    cacheGravado: r.usage?.cache_creation_input_tokens,
    cacheLido: r.usage?.cache_read_input_tokens,
    saida: r.usage?.output_tokens,
  };
  if (r.stop_reason === "refusal") {
    return { recusou: true, categoria: r.stop_details?.category || "sem categoria" };
  }
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

async function perguntarAoOpenAI(sistema, mensagens) {
  const r = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: MODELO_OPENAI,
      messages: [{ role: "system", content: sistema }, ...mensagens],
      max_tokens: 700,
      response_format: { type: "json_object" },
    },
    { headers: { Authorization: `Bearer ${chaveOpenAI()}` }, timeout: TIMEOUT }
  );
  // A conta do mês sai daqui. Sem registrar o uso, "quanto vou gastar"
  // só teria resposta por chute — e a OpenAI devolve o número exato em
  // toda chamada. `cached_tokens` é o desconto automático da OpenAI para
  // prefixo repetido (o cardápio e as regras, idênticos toda noite):
  // custa metade do token de entrada normal.
  const u = r.data?.usage || {};
  ULTIMO_USO = {
    provedor: "openai",
    modelo: MODELO_OPENAI,
    entrada: u.prompt_tokens,
    cacheLido: u.prompt_tokens_details?.cached_tokens || 0,
    saida: u.completion_tokens,
  };
  return r.data?.choices?.[0]?.message?.content || "";
}

// O modelo às vezes embrulha o JSON em cerca de markdown. Em vez de
// pedir no prompt para não fazer isso e rezar, tira a cerca aqui.
function limparJson(t) {
  const s = String(t || "").trim();
  const cerca = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (cerca) return cerca[1];
  // Ou vem texto antes/depois do objeto: pega do primeiro { ao último }.
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  return a >= 0 && b > a ? s.slice(a, b + 1) : s;
}

// ──────────────────────────────────────────────
// `pensar` — o que a IA entendeu da mensagem.
//
// Nunca estoura: qualquer falha (chave ausente, timeout, JSON torto)
// devolve escalar, que é o comportamento seguro que o dono pediu —
// "qualquer dúvida, não responda, me manda msg".
// ──────────────────────────────────────────────
async function pensar({ texto, estado, pedido, fora = [], historico = [] }) {
  const provedor = qualProvedor();
  if (!provedor) return { erro: "sem ANTHROPIC_API_KEY nem OPENAI_API_KEY", escalar: true, intencao: "nao_sei" };

  // -- A ORDEM AQUI E DINHEIRO, NAO ESTILO --
  //
  // O cache do modelo casa por PREFIXO: ele reaproveita o comeco do
  // prompt enquanto os bytes forem identicos, e cobra 10x menos por essa
  // parte. Regras + cardapio + formato sao iguais em toda mensagem da
  // noite; situacao da loja e pedido em curso mudam a cada mensagem.
  //
  // Por isso o que nao muda vem PRIMEIRO e o que muda vem DEPOIS. Se o
  // contexto da loja ficasse no meio (como eu escrevi primeiro), cada
  // mensagem invalidaria o cardapio inteiro e a conta seria ~10x maior
  // pelo mesmo resultado.
  const fixo = [
    regrasDoDono(cardapio.CARDAPIO),
    "",
    LABEL_CARDAPIO,
    listaDeItens(fora),
    "",
    COMO_RESPONDER,
  ].join("\n");
  const variavel = contexto({ estado, pedido, fora });
  const sistema = fixo + "\n\n" + variavel;

  // Histórico curto: a conversa inteira não cabe e nem ajuda. O que
  // importa é o que foi dito agora e a última pergunta do bot.
  const mensagens = historico.slice(-6).map((h) => ({
    role: h.de === "bot" ? "assistant" : "user",
    content: String(h.texto || ""),
  }));
  mensagens.push({ role: "user", content: String(texto || "") });

  let bruto;
  let modeloUsado = provedor === "claude" ? MODELO : MODELO_OPENAI;
  try {
    bruto = provedor === "claude"
      ? await perguntarAoClaude(fixo, variavel, mensagens)
      : await perguntarAoOpenAI(sistema, mensagens);
  } catch (e) {
    const m = e?.error?.error?.message || e.response?.data?.error?.message || e.message;
    return { erro: `a IA não respondeu (${modeloUsado}): ${m}`, escalar: true, intencao: "nao_sei" };
  }
  if (bruto && bruto.recusou) {
    // Sonnet tem classificador de segurança próprio. Se ele recusar, não
    // há resposta para mandar — e aqui isso é só mais um caso de "chama o
    // dono", que é o comportamento seguro de sempre.
    return { erro: "o modelo recusou responder (" + bruto.categoria + ")", escalar: true, intencao: "nao_sei" };
  }

  let j;
  try { j = JSON.parse(limparJson(bruto)); }
  catch { return { erro: "a IA devolveu algo que não é JSON", escalar: true, intencao: "nao_sei", bruto }; }

  // ── a partir daqui é desconfiança, de propósito ──
  const itens = [];
  const descartados = [];
  for (const x of Array.isArray(j.itens) ? j.itens : []) {
    const item = itemPorNumero(x.n, fora);
    if (!item) { descartados.push(x.n); continue; }
    const qtd = Math.min(Math.max(parseInt(x.qtd, 10) || 1, 1), 20);
    itens.push({ item, qtd });
  }

  let resposta = typeof j.resposta === "string" ? j.resposta.trim() : "";
  let escalar = Boolean(j.escalar);
  let motivo = String(j.motivo || "").slice(0, 200);

  // Numeração interna vazando é defeito visível para o cliente, e o
  // prompt sozinho não garante. Se escapou, a resposta não sai.
  if (resposta && /#\d/.test(resposta)) {
    escalar = true;
    motivo = "a IA colou a numeração interna do cardápio na resposta — não deixei sair. " + motivo;
    resposta = "";
  }
  if (resposta && !precosConferem(resposta)) {
    escalar = true;
    motivo = "a IA citou um preço que não existe no cardápio — não deixei sair. " + motivo;
    resposta = "";
  }
  if (descartados.length) {
    escalar = true;
    motivo = `a IA pediu item que não existe ou acabou (#${descartados.join(", #")}). ` + motivo;
  }

  const INTENCOES = new Set(["conversa", "pergunta", "pedido", "resposta_ao_bot", "acompanhar", "problema", "nao_sei"]);
  const intencao = INTENCOES.has(j.intencao) ? j.intencao : "nao_sei";
  if (intencao === "nao_sei") escalar = true;

  return {
    intencao,
    resposta,
    itens,
    rua: j.rua ? String(j.rua).slice(0, 120) : null,
    bairro: j.bairro ? String(j.bairro).slice(0, 60) : null,
    pagamento: ["pix", "card", "cash"].includes(j.pagamento) ? j.pagamento : null,
    troco: Number.isFinite(Number(j.troco)) && Number(j.troco) > 0 ? Number(j.troco) : null,
    escalar,
    motivo,
    modelo: modeloUsado,
  };
}

// ──────────────────────────────────────────────
// Linha de comando, para conferir uma frase sem subir nada:
//   node infra/bot/cerebro.js "boa noitte, tem pizza?"
// ──────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const texto = process.argv.slice(2).join(" ");
    if (!texto) { console.log('uso: node cerebro.js "mensagem do cliente"'); process.exit(1); }
    const r = await pensar({ texto, estado: { situacao: "aberta", funcionamento: "de quarta a domingo, das 18:30 às 23:00" } });
    console.log(JSON.stringify(r, (k, v) => (k === "item" ? v.nome : v), 2));
    process.exit(0);
  })();
}

module.exports = {
  pensar, listaDeItens, itemPorNumero, precosConferem, MODELO,
  usoDeTokens: () => ULTIMO_USO,
  // Qual IA está REALMENTE no ar agora. O /saude dizia só se havia
  // chave da OpenAI, o que não é a mesma pergunta: com as duas chaves
  // presentes, quem responde é o Claude, e o painel dizia "openai".
  emUso: () => {
    const p = qualProvedor();
    if (!p) return "nenhuma (sem chave)";
    return p === "claude" ? MODELO : MODELO_OPENAI;
  },
};
