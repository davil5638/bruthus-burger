// ──────────────────────────────────────────────
// Atendente — o bot de WhatsApp da Bruthus
//
// Roda na VM do Oracle, ao lado da Evolution. NÃO no Render: lá o plano
// free dorme e leva ~32s para acordar, que é exatamente a lentidão que
// este serviço veio eliminar.
//
// MODO DE OBSERVAÇÃO (o padrão):
// Entende cada mensagem e GRAVA o que teria respondido — sem mandar nada.
// É assim que se descobre se ele entende os clientes de verdade sem
// arriscar o número que recebe pedido. Para soltar: RESPONDER=1.
//
// O QUE O HISTÓRICO DE 7 MESES MOSTROU (e desenhou este serviço):
//   11.241 mensagens, 627 conversas com ida e volta
//      714 trazem "BR-xxxxx": o cliente chega pelo botão do OlaClick com
//           o pedido inteiro escrito — 312 nos últimos 30 dias, contra
//           455 pedidos do canal próprio. Quase 7 em 10.
//      375 imagens: print do cardápio apontando o que quer
//      241 áudios: sem transcrever, o bot trava justo neles
//      135 conversas abrem com "boa noite" e nada mais
//
// O LID: 90% das conversas chegam com um identificador que ESCONDE o
// telefone (9.513 de 11.241 mensagens). Não dá para ligar "quem escreve"
// a "qual pedido" pelo número. Por sorte não precisa: quem vem pelo botão
// manda o código do pedido no texto, e é por ele que se acha tudo.
// ──────────────────────────────────────────────

const express = require("express");
const axios   = require("axios");
const fs      = require("fs");
const path    = require("path");

const painel   = require("./painel");
const pedidos  = require("./pedidoEmCurso");
const respostas = require("./respostas");
const cerebro  = require("./cerebro");

// Os módulos compartilhados com o resto do sistema ficam em dois lugares
// diferentes: no container, copiados para o lado do index.js
// (/app/scripts); no repositório, na raiz (../../scripts). Aceitar os
// dois é o que permite ensaiar a conversa local, com `node
// infra/bot/testarConversa.js`, sem copiar pasta nenhuma.
//
// O catch é estreito de propósito: só engole "não achei ESTE caminho".
// Erro DENTRO do módulo tem que estourar, não virar outro require.
function compartilhado(nome) {
  const aqui = `./scripts/${nome}`;
  try {
    return require(aqui);
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(aqui)) throw e;
    return require(`../../scripts/${nome}`);
  }
}

const criarPedido = compartilhado("criarPedido");
const cardapio = compartilhado("cardapio");
const loja     = compartilhado("loja");
const olaclick = compartilhado("olaclickApi");

const PORTA        = Number(process.env.PORTA || 3000);
const RESPONDER    = process.env.RESPONDER === "1";
const EVO_URL      = (process.env.EVOLUTION_API_URL || "http://evolution:8080").replace(/\/$/, "");
const EVO_KEY      = process.env.EVOLUTION_API_KEY || "";
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "bruthus";
const OPENAI_KEY   = process.env.OPENAI_API_KEY || "";
// Interruptor da IA. Ligada por padrão; `USAR_IA=0` volta o bot para a
// regra escrita à mão sem deploy, se ela aprontar no meio de uma noite.
const USAR_IA      = process.env.USAR_IA !== "0";
const DIARIO       = process.env.DIARIO || "/dados/observacao.jsonl";

const app = express();
app.use(express.json({ limit: "25mb" }));

// ──────────────────────────────────────────────
// Diário. Uma linha JSON por mensagem, para a gente ler depois e
// descobrir onde ele erra — antes de ele poder errar com cliente.
// ──────────────────────────────────────────────
function registrar(entrada) {
  const linha = JSON.stringify({ em: new Date().toISOString(), ...entrada });
  try {
    fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
    fs.appendFileSync(DIARIO, linha + "\n");
  } catch (e) {
    console.error("[diario]", e.message);
  }
  console.log(linha);
}

// ──────────────────────────────────────────────
// Estado da loja, com cache curto. Sem cache seriam duas chamadas à API
// do OlaClick por mensagem recebida, e numa noite cheia isso estoura o
// limite deles — já tomamos 429 antes nesta base.
// ──────────────────────────────────────────────
let cacheLoja = { em: 0, dados: null };
async function estadoDaLoja() {
  if (Date.now() - cacheLoja.em < 60000 && cacheLoja.dados) return cacheLoja.dados;
  const [estado, fora] = await Promise.all([loja.estado(), loja.indisponiveis()]);
  // Só para ensaiar o fluxo de pedido fora do horário. Nunca fica ligado
  // em operação: com ela o bot tomaria pedido com a loja fechada.
  if (process.env.FORCAR_LOJA_ABERTA === "1") estado.situacao = "aberta";
  cacheLoja = { em: Date.now(), dados: { ...estado, indisponiveis: fora } };
  return cacheLoja.dados;
}

// ──────────────────────────────────────────────
// Normaliza o que a Evolution manda. Cada tipo de mensagem esconde o
// texto num lugar diferente.
// ──────────────────────────────────────────────
function extrair(corpo) {
  const d = corpo?.data || corpo || {};
  const m = d.message || {};
  const chave = d.key || {};
  const texto =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption || "";

  return {
    evento:    corpo?.event || "",
    conversa:  String(chave.remoteJid || ""),
    minha:     chave.fromMe === true,
    nome:      d.pushName || null,
    tipo:      d.messageType || "",
    texto:     texto.trim(),
    temAudio:  Boolean(m.audioMessage),
    temImagem: Boolean(m.imageMessage),
    local:     m.locationMessage
      ? { lat: m.locationMessage.degreesLatitude, lon: m.locationMessage.degreesLongitude }
      : null,
    id: chave.id || null,
  };
}

// ──────────────────────────────────────────────
// Áudio → texto. 241 clientes mandaram voz em 7 meses; sem isto o bot
// emudece justo neles e o dono volta a atender.
// ──────────────────────────────────────────────
async function transcrever(mensagemId) {
  if (!OPENAI_KEY) return { erro: "OPENAI_API_KEY ausente" };
  try {
    const { data } = await axios.post(
      `${EVO_URL}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`,
      { message: { key: { id: mensagemId } }, convertToMp4: false },
      { headers: { apikey: EVO_KEY }, timeout: 30000 }
    );
    if (!data?.base64) return { erro: "a Evolution não devolveu o áudio" };

    const form = new FormData();
    form.append("file", new Blob([Buffer.from(data.base64, "base64")], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const r = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      timeout: 60000,
    });
    return { texto: String(r.data?.text || "").trim() };
  } catch (e) {
    return { erro: e.response?.data?.error?.message || e.message };
  }
}

// ──────────────────────────────────────────────
// A mensagem veio do botão do OlaClick? Ela é gerada por eles, então o
// formato é fixo e ler é trivial — não precisa de IA e não erra.
// ──────────────────────────────────────────────
function codigoDoPedido(texto) {
  const m = String(texto || "").match(/\bBR-\d{6,}\b/);
  return m ? m[0] : null;
}

const RAMO_PAGAMENTO = {
  pix:  "manda a chave do Pix e espera o comprovante",
  card: "manda o agradecimento",
  cash: "manda o agradecimento",
};

// ──────────────────────────────────────────────
// A FORMA DE PAGAMENTO ESTÁ NA PRÓPRIA MENSAGEM
//
// O pedido que o cliente reenvia pelo WhatsApp (botão do OlaClick) traz
// o pagamento escrito no fim:
//
//   *Total a pagar: R$ 84,97*
//   Cartão 84.97
//
//   *Total a pagar: R$ 28,99*
//   PIX 28.99
//   Por favor, enviar o comprovante via whatsapp
//
// O código ia buscar isso na API, em `payments[0]`, e ali ainda não tem
// nada: a própria mensagem diz "Estado do pagamento: Não pago". Nas duas
// noites de operação deu `pagamento: null` em TODOS os 26 pedidos — 10
// de Pix ficaram sem a chave, e o dono mandou as 10 na mão.
//
// Ler do texto resolve porque é dali que a informação vem: foi o
// OlaClick que escreveu, no formato dele.
function pagamentoNoTexto(texto) {
  const n = cardapio.normalizar(texto);
  if (/\bpix\b/.test(n)) return "pix";
  if (/\bcart(ao|ão)\b|\bcredito\b|\bdebito\b|\bmaquin/.test(n)) return "card";
  if (/\bdinheiro\b|\bespecie\b/.test(n)) return "cash";
  return null;
}

// ──────────────────────────────────────────────
// TOMAR O PEDIDO
//
// É a maior dor do dono: hoje ele lê a conversa, abre o OlaClick e
// digita tudo. Aqui o bot pergunta o que falta, monta, CONFIRMA COM O
// CLIENTE e só então cadastra.
//
// A confirmação não estava no plano e é a trava mais importante: sem
// ela, um erro de interpretação vira comida errada sem ninguém ter
// chance de pegar. O cliente lê os itens e o total antes de existir
// pedido.
// ──────────────────────────────────────────────
const SIM = /^(sim|isso|confirmo?|confirma|pode|ok|blz|beleza|certo|ta bom|ta certo|fechou|perfeito|aham|uhum|s)\b/;
const NAO = /^(nao|n|errado|muda|trocar|cancela)\b/;

function lerPagamento(n) {
  if (/\bpix\b/.test(n)) return "pix";
  if (/\b(cartao|credito|debito|card|maquin)/.test(n)) return "card";
  if (/\b(dinheiro|especie|cash|vivo)\b/.test(n)) return "cash";
  return null;
}

function lerTroco(n) {
  if (/\b(nao precisa|sem troco|nao vou precisar|trocado|certinho)\b/.test(n)) return 0;
  const m = n.match(/\b(?:troco\s*(?:p|pra|para)?\s*)?(\d{2,4})\b/);
  return m ? Number(m[1]) : null;
}

function lerCoca(n) {
  if (/\bzero\b|\bdiet\b|\blight\b/.test(n)) return "Coca Lata Zero";
  if (/\bnormal\b|\btradicional\b|\bcomum\b|\boriginal\b/.test(n)) return "Coca Lata Normal";
  return null;
}

// Batata diferente da padrão: só entra se o cliente falar, e muda o preço.
function lerBatata(n) {
  if (/\bbatata\b.*\b(media|média)\b|\bmedia\b.*\bbatata\b/.test(n)) {
    return { nome: "Batata Média", extra: 9 };
  }
  if (/\bbatata\b.*(cheddar|bacon)/.test(n)) {
    return { nome: "Batata com cheddar e bacon", extra: 13 };
  }
  return null;
}

// Traduz o que o cliente escolheu — "Coca Lata Zero", "Batata Média" —
// nos ids que a API quer. Procura pelo nome dentro de todos os grupos,
// porque a mesma opção pode aparecer em mais de um.
function idModificador(nomeOpcao) {
  if (!nomeOpcao) return null;
  const alvo = cardapio.normalizar(nomeOpcao);
  for (const grupo of Object.values(cardapio.CARDAPIO.modificadores || {})) {
    const op = (grupo.opcoes || []).find((o) => cardapio.normalizar(o.nome) === alvo);
    if (op) return op.id;
  }
  return null;
}

function idsDasEscolhas(item) {
  return [idModificador(item.coca), idModificador(item.batataNome)].filter(Boolean);
}

// ──────────────────────────────────────────────
// A resposta do cliente a uma pergunta que o bot fez.
//
// Ele pode responder só parte ("zero", sem o tamanho), então o que já se
// sabia é preservado e o que ainda falta continua pendente.
// ──────────────────────────────────────────────
// Devolve true quando a mensagem foi consumida como RESPOSTA. Nesse caso
// ela não pode ser lida outra vez como pedido novo: "lata normal" entrava
// como a coca certa e, na mesma passada, virava uma pergunta nova ("qual
// desses? Coca-Cola Normal 1L"), que travava a conversa para sempre.
function responderPendencia(p, texto, n) {
  const q = (p.perguntas || [])[0];
  if (!q) return false;

  if (q.tipo === "coca") {
    const tamanho = q.tamanho || cardapio.lerTamanhoCoca(n);
    const versao = q.versao || cardapio.lerVersaoCoca(n);
    if (tamanho && versao) {
      const item = (cardapio.COCAS[tamanho] || {})[versao];
      if (item) {
        p.itens.push({ ...item, qtd: q.qtd || 1 });
        p.perguntas.shift();
        return true;
      }
    }
    // Respondeu metade: guarda a metade e segue perguntando a outra.
    const avancou = Boolean((tamanho && !q.tamanho) || (versao && !q.versao));
    q.tamanho = tamanho || null;
    q.versao = versao || null;
    q.falta = tamanho ? "versao" : "tamanho";
    if (avancou) return true;
    // Não respondeu nada do que foi perguntado. Duas vezes assim é hora
    // de chamar o dono, não de perguntar uma terceira.
    q.tentativas = (q.tentativas || 0) + 1;
    return false;
  }

  if (q.tipo === "qual_item") {
    const achado = cardapio.buscarItem(texto);
    if (achado && achado.confianca === "alta") {
      p.itens.push({ ...achado.item, qtd: q.qtd || 1 });
      p.perguntas.shift();
      return true;
    }
    q.tentativas = (q.tentativas || 0) + 1;
  }
  return false;
}

// Pergunta que o cliente já tentou responder duas vezes e não saiu do
// lugar: insistir uma terceira irrita e não resolve. Chama o dono.
function pendenciaEmpacou(p) {
  return (p.perguntas || []).some((q) => (q.tentativas || 0) >= 2);
}

// ──────────────────────────────────────────────
// É PERGUNTA OU É PEDIDO?
//
// A diferença decide se o bot informa ou se abre pedido, e errar isso
// foi o que produziu a pior conversa das duas primeiras noites.
// ──────────────────────────────────────────────
const PERGUNTA = /\?|\b(quais|qual|quantos|quanto|tem|teria|voce tem|vc tem|oq|o que|opcoes|opcao|sabores|cardapio|menu|fazendo|faz)\b/;

function ehPergunta(n) {
  return PERGUNTA.test(n);
}

// Sinal de que a pessoa está PEDINDO, não perguntando.
const QUER_PEDIR = /\b(quero|queria|vou querer|vou de|manda|mandar|me ve|me da|pode mandar|bora|fechou|anota|vai ser)\b/;

// ──────────────────────────────────────────────
// SAUDAÇÃO, com a folga que a vida real exige.
//
// A regex antiga exigia a frase exata e nada mais, então "Boa noitee"
// (com dois e) e "Boa noite meu patrão" caíam em "não entendi" e
// chamavam o dono. Abrir conversa é o caso mais comum que existe: 135
// das conversas do histórico começam só com um cumprimento.
// ──────────────────────────────────────────────
const SAUDACAO = /\b(oi+|ol+a+|al+o+|opa+|bo[am]\s*(dia|tarde|noite)s?e*|e\s*ai|eai)\b/g;
const RESTO_INOFENSIVO = /^(meu\s+)?(patrao|chefe|amigo|amiga|moco|moca|senhor|senhora|tudo\s+bem|td\s+bem|beleza|blz|boa|boas|ai|pessoal|galera|\W|\s)*$/;

function ehSaudacao(n) {
  SAUDACAO.lastIndex = 0;
  if (!SAUDACAO.test(n)) return false;
  const resto = n.replace(SAUDACAO, " ").replace(/\s+/g, " ").trim();
  return RESTO_INOFENSIVO.test(resto);
}

// O que oferecer quando o pedido do cliente acabou.
//
// Tirando o próprio item e tudo o mais que está escondido. A lista vinha
// crua do cardápio e produzia a mensagem "Calabrese acabou hoje... mas
// ainda tem: Margherita, Calabrese, Pepperoni" — oferecendo o que acabou
// de acabar, e mandando o cliente pedir outro item que também não tem.
function alternativasQueSobraram(item, fora = []) {
  const indisponivel = new Set(fora.map((f) => cardapio.normalizar(f)));
  indisponivel.add(cardapio.normalizar(item.nome));
  return cardapio.CARDAPIO.itens
    .filter((i) => i.cat === item.cat && !indisponivel.has(cardapio.normalizar(i.nome)))
    .map((i) => i.nome);
}

// Palavras que só aparecem em endereço. Sem elas, o bot não tem como
// saber se "233" é número de casa ou quantidade de hambúrguer.
const RUA = /\b(rua|r|av|avenida|travessa|tv|praca|sitio|estrada|rodovia|conjunto|cond|condominio|loteamento|lot|beco|alameda|bairro|proximo|perto|frente)\b/;

function pareceEndereco(texto, falta, achados) {
  // Se achou item na frase, é pedido, não endereço.
  if (achados.itens.length || achados.perguntas.length) return false;
  if (RUA.test(cardapio.normalizar(texto))) return true;
  // O bot ACABOU de pedir o endereço: a resposta é o endereço, mesmo
  // escrita sem "rua".
  return falta[0] === "endereco" && /\d/.test(texto) && texto.trim().split(/\s+/).length >= 2;
}

async function tratarPedidoEmCurso(msg, texto, estado) {
  const p = pedidos.pegar(msg.conversa);
  if (!p) return null;
  const n = cardapio.normalizar(texto);

  // Esperando o "sim"?
  if (p.aguardandoConfirmacao) {
    if (NAO.test(n)) {
      pedidos.fechar(msg.conversa);
      return {
        intencao: "pedido_cancelado",
        escalar: true,
        acao: "cliente disse que está errado — chama o dono",
        mensagem: "Sem problema! Deixa eu chamar alguém aqui pra te ajudar 🙏",
      };
    }
    if (!SIM.test(n)) return null;  // não entendi: deixa cair no fluxo normal

    const conta = pedidos.somar(p, cardapio);
    const r = await criarPedido.criar({
      cliente: { nome: msg.nome, telefone: p.telefone || msg.conversa },
      endereco: { texto: p.endereco, area_id: p.bairro.area_id, taxa: p.bairro.taxa },
      itens: p.itens.map((i) => ({
        variant_id: i.variant_id,
        qtd: i.qtd || 1,
        // As OPÇÕES escolhidas, não os grupos.
        //
        // `i.modificadores` vem do cardápio e guarda os IDs dos GRUPOS
        // (adicionais, qual batata, qual coca) — mandá-los como se
        // fossem opção faz a API responder "the selected item does not
        // exist in your menu", que foi o que derrubou o primeiro pedido
        // tomado pelo bot.
        modificadores: idsDasEscolhas(i),
      })),
      pagamento: p.pagamento,
      troco: p.troco,
      observacao: `Pedido tomado pelo WhatsApp${p.troco ? ` — troco para ${p.troco}` : ""}`,
      idempotencia: p.idempotencia,
    });
    pedidos.fechar(msg.conversa);

    if (!r.ok) {
      return {
        intencao: "pedido_falhou",
        escalar: true,
        acao: "NÃO consegui cadastrar — chama o dono: " + r.erro,
        mensagem: "Anotei seu pedido! Já te confirmo aqui 🙏",
      };
    }
    // PIX PRECISA DA CHAVE, senão o cliente não tem como pagar.
    //
    // A chave só era enviada no caminho do pedido vindo do botão do
    // OlaClick. No fluxo que o bot conduz, quem escolhia Pix recebia
    // "Já vamos preparar" e mais nada — pedido na cozinha, sem chave e
    // sem comprovante. Apareceu no ensaio do "sim", não em operação.
    const chavePix = p.pagamento === "pix" ? respostas.pix() : null;

    return {
      intencao: "pedido_criado",
      pedido: r.public_id,
      total: r.total,
      acao: "pedido cadastrado no OlaClick" + (chavePix ? " — e mandou a chave do Pix" : ""),
      mensagem: pedidos.confirmarParaCliente(p, conta) + (chavePix ? `\n\n${chavePix}` : ""),
      avisarDono: `✅ *Pedido novo pelo WhatsApp*\n${r.public_id} — ${msg.nome || "cliente"}\nR$ ${Number(r.total).toFixed(2).replace(".", ",")}\nJá está no OlaClick 🔥`,
    };
  }

  // Preenche o que o cliente acabou de dizer.
  const falta = pedidos.oQueFalta(p);

  // A resposta de uma pergunta que o bot fez vem antes de tudo: é o
  // cliente destravando o pedido.
  const eraResposta = responderPendencia(p, texto, n);

  if (falta.includes("coca")) {
    const coca = lerCoca(n);
    if (coca) p.itens.filter((i) => i.cat === "combo" && !i.coca).forEach((i) => { i.coca = coca; });
  }
  const batata = lerBatata(n);
  if (batata) p.itens.filter((i) => i.cat === "combo").forEach((i) => {
    if (!i.batataNome) { i.batataNome = batata.nome; i.batataExtra = batata.extra; }
  });
  // Itens novos na mesma conversa — e o que ficou em dúvida neles.
  // Mensagem que JÁ foi usada como resposta não é lida como pedido novo.
  const achados = eraResposta ? { itens: [], perguntas: [] } : cardapio.buscarItens(texto);

  if (!p.bairro) {
    const b = cardapio.taxaBairro(texto);
    if (b) {
      p.bairro = b;
      // A rua pode ter vindo numa mensagem anterior. Junta as duas em vez
      // de guardar só o bairro — o entregador precisa da rua.
      const rua = p.enderecoTexto;
      p.endereco = (rua && !cardapio.normalizar(rua).includes(cardapio.normalizar(b.bairro))
        ? `${rua}, ${texto.trim()}`
        : texto.trim()).slice(0, 191);
    } else if (!p.enderecoTexto && pareceEndereco(texto, falta, achados)) {
      // Bairro não reconhecido NÃO significa endereço inválido. Guarda a
      // rua e pergunta só o bairro. Antes o endereço inteiro era jogado
      // fora aqui, o bot repetia a mesma pergunta, a trava anti-repetição
      // calava, e o cliente ficava sem resposta — pedido do Renan,
      // 05/11/2026.
      p.enderecoTexto = texto.trim().slice(0, 191);
    }
  }
  if (!p.pagamento) {
    const pg = lerPagamento(n);
    if (pg) p.pagamento = pg;
  }
  if (p.pagamento === "cash" && p.troco === null) {
    const t = lerTroco(n);
    if (t !== null) p.troco = t;
  }

  // Mais algum item na mesma conversa? Agora lê VÁRIOS por mensagem e
  // respeita a quantidade — "1 calabresa e 1 coca 1l" perdia a calabresa.
  for (const achado of achados.itens) {
    if (!p.itens.some((i) => i.id === achado.item.id)) {
      p.itens.push({ ...achado.item, qtd: achado.qtd });
    }
  }
  // Item que o bot não tem certeza de qual é vira pergunta, não palpite
  // e não silêncio.
  for (const q of achados.perguntas) {
    if (!p.perguntas.some((a) => a.tipo === q.tipo && a.consulta === q.consulta)) p.perguntas.push(q);
  }

  pedidos.guardar(msg.conversa, p);
  const aindaFalta = pedidos.oQueFalta(p);
  const conta = pedidos.somar(p, cardapio);

  if (aindaFalta.length) {
    return {
      intencao: "tomando_pedido",
      falta: aindaFalta,
      acao: "pergunta: " + aindaFalta[0],
      mensagem: pedidos.perguntar(aindaFalta, p, conta, cardapio),
    };
  }

  if (conta.faltaParaMinimo) {
    return {
      intencao: "abaixo_do_minimo",
      acao: "avisa o pedido mínimo",
      mensagem: `Nosso pedido mínimo é R$ 15,00 e deu R$ ${conta.produtos.toFixed(2).replace(".", ",")} 🙏\nFaltam R$ ${conta.faltaParaMinimo.toFixed(2).replace(".", ",")} — quer incluir mais alguma coisa?`,
    };
  }

  // Tudo preenchido: pede o "sim" antes de criar.
  p.aguardandoConfirmacao = true;
  p.idempotencia = p.idempotencia || require("crypto").randomUUID();
  pedidos.guardar(msg.conversa, p);
  return {
    intencao: "confirmando_pedido",
    acao: "mostra o pedido e espera o cliente confirmar",
    mensagem: pedidos.resumoParaCliente(p, conta),
  };
}

// ──────────────────────────────────────────────
// Memória curta da conversa, para a IA não responder no vácuo.
//
// Sem isto ela não sabe o que ela mesma acabou de perguntar, e um "sim"
// ou "o de cima" fica sem sentido. Fica na memória do processo de
// propósito: é contexto de minutos, não histórico para guardar.
// ──────────────────────────────────────────────
const HISTORICO = new Map();
const HIST_MAX = 8;
const HIST_MS  = 30 * 60 * 1000;

function lembrar(conversa, de, texto) {
  if (!conversa || !texto) return;
  const agora = Date.now();
  const atual = (HISTORICO.get(conversa) || []).filter((h) => agora - h.em < HIST_MS);
  atual.push({ de, texto: String(texto).slice(0, 600), em: agora });
  HISTORICO.set(conversa, atual.slice(-HIST_MAX));
}

function historicoDa(conversa) {
  const agora = Date.now();
  return (HISTORICO.get(conversa) || []).filter((h) => agora - h.em < HIST_MS);
}

// ──────────────────────────────────────────────
// O que o bot entendeu e o que faria.
// ──────────────────────────────────────────────
// `estadoInjetado` existe só para o ensaio de conversa poder fixar a
// loja como aberta. Em operação ninguém passa esse argumento.
//
// Sem ele o ensaio era uma ilusão: ele passava na minha máquina porque a
// chamada ao OlaClick falhava sem token e o `catch` devolvia null, que o
// código trata como loja aberta. Na VM, com token, a loja respondia
// "fechada" às 12h e os mesmos arquivos davam 18 falhas. Teste que passa
// por acidente é pior do que teste nenhum.
async function decidir(texto, msg, estadoInjetado) {
  const estado = estadoInjetado || await estadoDaLoja().catch(() => null);

  // Já existe um pedido sendo tomado nesta conversa? Então o que o
  // cliente acabou de dizer é resposta a uma pergunta minha — endereço,
  // pagamento, troco ou o "sim". Isso vem ANTES de tudo, senão um
  // endereço seria lido como mensagem solta e a conversa recomeçaria.
  const emCurso = await tratarPedidoEmCurso(msg, texto, estado).catch((e) => {
    console.error("[pedido]", e.message);
    return { intencao: "pedido_falhou", escalar: true, acao: "erro ao tomar o pedido: " + e.message };
  });
  if (emCurso) return emCurso;

  // 1. Veio pelo botão: o pedido já existe, é só buscar.
  const codigo = codigoDoPedido(texto);

  // Só o código, nada mais: é o dono (ou o entregador) perguntando onde
  // fica a entrega, não um cliente chegando.
  //
  // Existe por um caso concreto do iFood: o entregador liga dizendo que
  // não achou o número, e aí começa a corrida atrás do cliente. Mas o
  // pedido do iFood vem com a coordenada do GPS — 15 de 15 na amostra —,
  // então o pin sempre esteve ali. O telefone do cliente vem mascarado
  // pelo iFood ("0800 700 3020 | ..."), então falar com ele não é opção:
  // o que resolve é o entregador navegar pelo mapa.
  //
  // A mensagem do botão do OlaClick também traz um BR-, mas vem com
  // dezenas de palavras junto; aqui exige-se o código quase sozinho.
  if (codigo && texto.replace(/\s+/g, " ").trim().length <= codigo.length + 12) {
    try {
      const p = await olaclick.buscarPedidoPorCodigo(codigo, { diasAtras: 3 });
      if (!p) return { intencao: "consulta_de_local", pedido: codigo, erro: "não achei esse pedido" };
      const a = p.address || {};
      const linhas = [`📍 *${codigo}*`, a.address || "(sem endereço)"];
      if (a.reference) linhas.push(`_Ref: ${a.reference}_`);
      if (a.latitude && a.longitude) {
        linhas.push("", `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`);
      } else {
        linhas.push("", "_Esse pedido não veio com localização._");
      }
      return {
        intencao: "consulta_de_local",
        pedido: codigo,
        temCoordenada: Boolean(a.latitude),
        acao: "responde o endereço e o link do mapa",
        mensagem: linhas.join("\n"),
      };
    } catch (e) {
      return { intencao: "consulta_de_local", pedido: codigo, erro: e.message };
    }
  }

  if (codigo) {
    // O TEXTO MANDA, a API é só complemento.
    //
    // Quem escreveu a forma de pagamento aqui foi o próprio OlaClick, no
    // formato dele. A API, nesse instante, ainda não tem pagamento
    // lançado — por isso o `payments[0]` dava null nas 26 vezes das duas
    // primeiras noites. Então: lê do texto, e a API fica para o total.
    const forma = pagamentoNoTexto(texto);

    // Pix pede a chave e o comprovante; cartão e dinheiro só agradecem.
    const mensagem = forma === "pix"
      ? respostas.pix()
      : forma ? respostas.agradecimento() : null;

    let total = null;
    try {
      // Pelo código público, não pelo UUID: `/orders/{BR-x}` devolve 422.
      const pedido = await olaclick.buscarPedidoPorCodigo(codigo);
      total = pedido?.total ?? null;
    } catch {
      // A consulta é enfeite: o que o cliente precisa receber já está
      // decidido pelo texto. Antes, uma falha aqui engolia a resposta
      // inteira e o cliente ficava sem nada.
    }

    return {
      intencao: "pedido_pelo_botao",
      pedido: codigo,
      total,
      pagamento: forma,
      acao: forma ? RAMO_PAGAMENTO[forma] : "forma de pagamento não escrita na mensagem",
      mensagem,
    };
  }

  // Como avisar que não dá para pedir agora. NÃO é resposta sozinha: no
  // primeiro teste isto atropelava tudo, e quem perguntasse "quanto custa
  // o combo do melt?" às 15h recebia só "abrimos quinta", sem o preço.
  // Pergunta se responde; o aviso vai junto, não no lugar.
  const avisoFechado = !estado || estado.situacao === "aberta" ? null
    : estado.situacao === "pausada"
      ? "a produção está cheia agora; volta a aceitar em breve"
      : `fechado agora; abre ${estado.proximaAbertura?.dia} às ${estado.proximaAbertura?.hora}`;

  // Qual mensagem de "não dá para pedir agora" cabe aqui. São três
  // situações diferentes e o cliente percebe a diferença.
  const fechouHoje = estado && estado.situacao === "fechada"
    && estado.horarioDeHoje?.length && !estado.abreHojeMaisTarde;
  const textoFechado = () =>
    estado?.situacao === "pausada" ? respostas.pausado()
      : fechouHoje ? respostas.jaEncerramos(estado?.proximaAbertura, estado?.funcionamento)
      : respostas.ausencia(estado?.proximaAbertura, estado?.funcionamento);

  const n = cardapio.normalizar(texto);
  if (!n) return { intencao: msg?.temImagem ? "print_pendente" : "sem_texto" };

  // ──────────────────────────────────────────────
  // 3. A IA LÊ A MENSAGEM.  ← quem entende o cliente é ela, daqui pra frente.
  //
  // O que vinha antes disto (pedido reenviado pelo botão, código BR-,
  // print) continua no código: é formato fixo, ler é trivial e errar ali
  // custa caro. O que vem DEPOIS disto é a regra antiga, que agora é só
  // rede de segurança — se a IA não responder (sem chave, timeout, JSON
  // torto), o bot não fica mudo.
  //
  // POR QUE A INVERSÃO: as regras à mão só acertavam o que eu previ.
  // "Boa noitee" passava porque eu previ o "e" sobrando; "Boa noitte"
  // não, porque eu não previ o "t". Em duas noites de operação foram 91
  // mensagens de cliente e 68 jogadas pro dono. Prever o jeito que cada
  // pessoa escreve não escala, e a conta disso caía nele.
  //
  // O QUE A IA NÃO FAZ: escolher item por nome e inventar preço. Ela
  // devolve o NÚMERO do item na lista real; item que não existe ou que o
  // dono escondeu é descartado em cerebro.js. Preço quem soma é
  // `precificar`. O pedido no OlaClick quem cria é `criarPedido`.
  const ia = USAR_IA
    ? await cerebro.pensar({
        texto,
        estado,
        pedido: pedidos.pegar(msg.conversa),
        fora: estado?.indisponiveis?.nomes || [],
        historico: historicoDa(msg.conversa),
      }).catch((e) => ({ erro: e.message }))
    : { erro: "IA desligada por USAR_IA=0" };

  if (!ia.erro) {
    const jaTinhaPedido = Boolean(pedidos.pegar(msg.conversa));
    const temOQueAplicar = ia.itens.length || ia.rua || ia.bairro || ia.pagamento || ia.troco;
    // Endereço ou pagamento SEM item não abre pedido.
    //
    // Na medição de 08/11, "Vai ser pix viu" abria um pedido vazio: não
    // havia item, `perguntar` não tinha o que perguntar e o cliente
    // recebia silêncio. Pagamento solto só faz sentido se já existe
    // pedido em curso — e aí o fluxo de pendência cuida dele.
    const pedindo = (ia.intencao === "pedido" || ia.intencao === "resposta_ao_bot")
      && temOQueAplicar && (ia.itens.length > 0 || jaTinhaPedido);

    // A IA entendeu o pedido; o CÓDIGO toma o pedido. É a divisão que
    // importa: ela nunca chega perto de preço nem do OlaClick.
    if (pedindo && !avisoFechado && !ia.escalar) {
      const p = pedidos.abrirOuPegar(msg.conversa);
      for (const i of ia.itens) {
        if (!p.itens.some((j) => j.id === i.item.id)) p.itens.push({ ...i.item, qtd: i.qtd });
      }
      if (ia.rua && !p.enderecoTexto) p.enderecoTexto = ia.rua;
      if (ia.bairro && !p.bairro) {
        // `p.bairro` guarda o OBJETO inteiro ({bairro, taxa, area_id}), e
        // não o nome: a criação do pedido lê `p.bairro.area_id`. Eu
        // escrevi o nome aqui primeiro e isso quebraria na hora de criar.
        //
        // Bairro fora da tabela de taxa não entra: a taxa sairia errada e
        // a entrega sai no prejuízo. Sem taxa, o fluxo pergunta de novo.
        const b = cardapio.taxaBairro(ia.bairro);
        if (b) {
          p.bairro = b;
          const rua = p.enderecoTexto;
          p.endereco = (rua && !cardapio.normalizar(rua).includes(cardapio.normalizar(b.bairro))
            ? `${rua}, ${b.bairro}`
            : (rua || b.bairro)).slice(0, 191);
        }
      }
      if (ia.pagamento && !p.pagamento) p.pagamento = ia.pagamento;
      if (ia.troco && !p.troco) p.troco = ia.troco;
      pedidos.guardar(msg.conversa, p);

      const falta = pedidos.oQueFalta(p);
      return {
        intencao: "tomando_pedido",
        porIA: true,
        modelo: ia.modelo,
        itens: p.itens.map((i) => `${i.qtd}x ${i.nome}`),
        falta,
        acao: `a IA entendeu (${ia.motivo || ia.intencao}); pergunta: ${falta[0]}`,
        mensagem: pedidos.perguntar(falta, p, pedidos.somar(p, cardapio), cardapio),
      };
    }

    // Cobrança de pedido e reclamação continuam sendo do dono, decida a
    // IA o que quiser. Só ele sabe onde o entregador está, e "já está a
    // caminho" quando não está custa o cliente.
    if (ia.intencao === "acompanhar" || ia.intencao === "problema") {
      return {
        intencao: ia.intencao === "acompanhar" ? "cobranca_de_pedido" : "pedido_ou_endereco_errado",
        porIA: true,
        modelo: ia.modelo,
        escalar: true,
        acao: `SEGURA e chama o dono — ${ia.motivo || "só ele resolve isso"}`,
        mensagem: respostas.vouVerificar(),
      };
    }

    // A IA respondeu e passou pela conferência de preço.
    if (!ia.escalar && ia.resposta) {
      return {
        intencao: "ia_respondeu",
        porIA: true,
        modelo: ia.modelo,
        deQue: ia.intencao,
        loja: avisoFechado || undefined,
        acao: `a IA respondeu: ${ia.motivo || ia.intencao}`,
        // Loja fechada: a IA já recebeu a situação no contexto e escreve
        // a resposta com isso. O texto fixo fica para quando ela falhar.
        mensagem: ia.resposta,
      };
    }

    // Ela mesma disse que não sabe. É o que o dono pediu: não responde,
    // chama ele. Melhor calar do que responder errado.
    if (ia.escalar) {
      return {
        intencao: "ia_nao_sabe",
        porIA: true,
        modelo: ia.modelo,
        escalar: true,
        acao: ia.motivo || "a IA não teve certeza; deixa para o dono",
      };
    }
  }

  // ── Daqui para baixo é a regra antiga: só roda se a IA falhou. ──
  if (ia.erro) console.error("[cerebro]", ia.erro);

  // "Cadê meu pedido?" — o bot NÃO responde isso sozinho.
  //
  // O dono responde com informação que só ele tem: "vou ligar aqui pra
  // ele", "ele precisou voltar na loja", "pegou uma entrega pra Boa Vista
  // e atrasou". O bot não sabe onde o entregador está, e o LID impede
  // ligar esta conversa a um pedido pelo telefone. Inventar "já está a
  // caminho" quando não está custa o cliente, e a loja leva a culpa.
  //
  // Então segura com honestidade e marca para o dono ver. Vale mais que
  // silêncio: o cliente sabe que foi lido.
  if (/\b(cade|onde (ta|esta)|ainda nao chegou|nao chegou|atras|demorando|esqueceu|ja saiu|em rota)\b/.test(n)) {
    return {
      intencao: "cobranca_de_pedido",
      escalar: true,
      acao: "SEGURA e chama o dono — só ele sabe onde está o entregador",
      mensagem: respostas.vouVerificar(),
    };
  }

  // Endereço ou pedido errado — o outro caso que o dono apontou como
  // "só eu consigo resolver". Mexer num pedido já feito significa falar
  // com a cozinha ou com o entregador, e às vezes refazer. Nada disso o
  // bot alcança, e tentar consertar sozinho estraga mais.
  if (/\b(errad[oa]|troquei|mudei o endereco|outro endereco|me enganei|pedi errado|coloquei errado|cancelar|trocar)\b/.test(n)) {
    return {
      intencao: "pedido_ou_endereco_errado",
      escalar: true,
      acao: "SEGURA e chama o dono — mexer em pedido feito depende dele",
      mensagem: respostas.vouVerificar(),
    };
  }

  // Endereço da loja: pedido 26 vezes no histórico, sempre para retirada,
  // e o bot não sabia responder. Vale antes da checagem de fechado — o
  // endereço é o mesmo com a loja aberta ou não.
  if (/\b(endereco|onde (fica|e|voces|vcs)|retirar|buscar|local|localizacao|rua)\b/.test(n)
      && !cardapio.taxaBairro(texto)) {
    return { intencao: "endereco_da_loja", acao: "manda o endereço", mensagem: respostas.endereco() };
  }

  // "quanto tempo?" — responde o que ele responde, não o que o cardápio
  // anuncia. No WhatsApp ele diz "uns 30 min" e "40min"; a página diz
  // 45–65. Prometer mais devagar do que a loja é faz ela parecer pior.
  if (/\b(quanto tempo|quantos? min|demora|demorar|prazo)\b/.test(n)) {
    return {
      intencao: "tempo_entrega",
      loja: avisoFechado || undefined,
      acao: "responde o tempo de entrega",
      mensagem: avisoFechado ? textoFechado() : `Entrega em ${respostas.tempoEntrega()} 🛵`,
    };
  }

  // ──────────────────────────────────────────────
  // PERGUNTA SOBRE O CARDÁPIO É INFORMAÇÃO, NÃO PEDIDO
  //
  // Isto vem ANTES do casamento de item de propósito. Sem essa ordem,
  // "Quais as opções de pizza ?" casava com confiança baixa em "Pizza
  // Metade/Metade", abria um pedido e pedia para a cliente escolher numa
  // lista de um item. Ela respondeu "Sim", o pedido travou e o dono foi
  // chamado — conversa da Priscila, 07/11/2026 23:34.
  // ──────────────────────────────────────────────

  // "me envia o cardápio", "Cardápio", "Qual cardápio?", "Manda o
  // cardápio por favor" — quatro vezes nas duas primeiras noites, zero
  // respostas.
  if (/\bcardapio\b|\bmenu\b/.test(n)) {
    return {
      intencao: "pergunta_cardapio",
      loja: avisoFechado || undefined,
      acao: "manda o link do cardápio",
      mensagem: respostas.cardapio() + (avisoFechado ? `\n\n${textoFechado()}` : ""),
    };
  }

  // Pergunta sobre pizza. Regra do dono: manda o cardápio normal e avisa
  // que as pizzas também estão no link.
  //
  // Mas se a massa acabou, a mensagem de esgotado ganha — essa o dono
  // viu funcionando e aprovou, e dizer "temos pizza sim" com a massa
  // acabada seria uma piora.
  if (/\bpizza/.test(n) && ehPergunta(n)) {
    const massaAcabou = Boolean(estado?.indisponiveis?.massaAcabou);
    return {
      intencao: massaAcabou ? "pizza_esgotada" : "pergunta_cardapio",
      loja: avisoFechado || undefined,
      acao: massaAcabou
        ? "avisa que a massa acabou"
        : "manda o cardápio e avisa que as pizzas estão no mesmo link",
      mensagem: massaAcabou
        ? respostas.massaAcabou()
        : respostas.pizzas() + (avisoFechado ? `\n\n${textoFechado()}` : ""),
    };
  }

  // Elogio. Vem ANTES do casamento de item: "Deliciosa batata viu" tem a
  // palavra "batata" e virava "qual desses? Pequena ou Média?".
  if (/\b(delicios[ao]|maravilhos[ao]|otim[ao]|excelente|amei|adorei|perfeit[ao]|top|sensacional|muito bo[am])\b/.test(n)
      && !QUER_PEDIR.test(n)) {
    return {
      intencao: "elogio",
      acao: "agradece o elogio",
      mensagem: respostas.elogio(),
    };
  }

  // "Obrigada", "valeu". O bot chamava o dono para isso.
  if (/^(obrigad[oa]|valeu|vlw|tmj|brigad[oa]|grat[oa])\b[\s\S]{0,12}$/.test(n)) {
    return {
      intencao: "agradecimento_cliente",
      acao: "responde o agradecimento",
      mensagem: respostas.disponha(),
    };
  }

  // 3. Só um cumprimento. 135 conversas abriram assim.
  if (ehSaudacao(n)) {
    return {
      intencao: "saudacao",
      loja: avisoFechado || undefined,
      acao: avisoFechado
        ? `manda a mensagem de ausência: ${avisoFechado}`
        : "manda as boas-vindas com o link do cardápio",
      mensagem: avisoFechado ? textoFechado() : respostas.boasVindas(),
    };
  }

  // 4. Pediu alguma coisa do cardápio.
  //
  // A leitura é da mensagem INTEIRA, pedaço por pedaço. O portão antigo
  // usava um `buscarItem` da frase toda e exigia confiança alta: "quero 2
  // smash bruthus e uma coca 600 zero" caía em confiança baixa, porque a
  // frase mistura dois itens, e o bot calava — com dois itens claríssimos
  // dentro dela.
  const tudo = cardapio.buscarItens(texto);
  const achado = cardapio.buscarItem(texto);
  if (achado || tudo.itens.length || tudo.perguntas.length) {
    const fora = estado?.indisponiveis?.nomes || [];
    const nomesPedidos = tudo.itens.map((i) => i.item.nome).concat(achado ? [achado.item.nome] : []);
    const esgotado = fora.some((f) => nomesPedidos.some((nome) => cardapio.normalizar(f) === cardapio.normalizar(nome)));

    // Loja aberta, item identificado com certeza e disponível: começa a
    // tomar o pedido. É a dor que o dono quer resolver — hoje ele lê a
    // conversa e digita tudo no OlaClick na mão.
    //
    // Pergunta pendente abre pedido SÓ quando a pessoa está pedindo.
    //
    // "1 coca" não dá para cadastrar, mas dá para perguntar qual — e é o
    // que o dono pediu. Já "Quais as opções de pizza ?" é pergunta: abrir
    // pedido ali virou a pior conversa das duas primeiras noites.
    // O que separa os dois é o sinal de pedido (quantidade, "quero",
    // "manda") e a ausência de interrogação.
    const querPedir = QUER_PEDIR.test(n) || /\d/.test(n);
    const temCerteza = tudo.itens.length > 0
      || (tudo.perguntas.length > 0 && querPedir && !ehPergunta(n))
      || (achado && achado.confianca === "alta");

    if (!avisoFechado && !esgotado && temCerteza) {
      const p = pedidos.abrirOuPegar(msg.conversa);
      const itens = tudo.itens.length
        ? tudo.itens
        : (achado && achado.confianca === "alta" ? [{ item: achado.item, qtd: 1 }] : []);
      for (const i of itens) {
        if (!p.itens.some((j) => j.id === i.item.id)) p.itens.push({ ...i.item, qtd: i.qtd });
      }
      for (const q of tudo.perguntas) p.perguntas.push(q);
      pedidos.guardar(msg.conversa, p);
      const falta = pedidos.oQueFalta(p);
      return {
        intencao: "tomando_pedido",
        itens: p.itens.map((i) => `${i.qtd}x ${i.nome}`),
        falta,
        acao: "começou a tomar o pedido; pergunta: " + falta[0],
        mensagem: pedidos.perguntar(falta, p, pedidos.somar(p, cardapio), cardapio),
      };
    }
    // Chegou aqui sem item resolvido (loja fechada e só dúvida na
    // frase, por exemplo). Não dá para falar de preço do que não se
    // sabe qual é — e `achado.item` aqui embaixo seria crash.
    if (!achado) {
      return {
        intencao: "duvida",
        loja: avisoFechado || undefined,
        acao: "não deu para identificar o item; responde o que sabe",
        mensagem: avisoFechado ? textoFechado() : respostas.vouVerificar(),
      };
    }

    return {
      intencao: "pedido_escrito",
      item: achado.item.nome,
      preco: achado.item.preco,
      confianca: achado.confianca,
      esgotado,
      loja: avisoFechado || undefined,
      // Responde o preço de qualquer jeito. Quem pergunta de tarde pede
      // de noite; devolver só "estamos fechados" joga a venda fora.
      acao: esgotado
        ? "diz o preço e avisa que esse acabou hoje, oferecendo os que restam"
        : avisoFechado
          ? `diz o preço e avisa: ${avisoFechado}`
          : achado.confianca === "baixa"
            ? "pergunta qual dos parecidos, em vez de chutar"
            : "confirma o item e pergunta ponto da carne, maionese, endereço e pagamento",
      alternativas: achado.confianca === "baixa" ? achado.alternativas.map((a) => a.nome) : undefined,
      mensagem: esgotado
        ? (estado?.indisponiveis?.massaAcabou && /pizza|margherita|calabres|pepperoni|manzo/i.test(achado.item.nome)
            ? respostas.massaAcabou()
            : respostas.esgotado(achado.item.nome, alternativasQueSobraram(achado.item, fora)))
        : achado.confianca === "baixa"
          ? respostas.qualDeles(achado.alternativas.map((a) => a.nome))
          // Loja fechada: diz o preço e avisa. Não há pedido a tomar.
          : avisoFechado
            ? `${achado.item.nome} — *R$ ${achado.item.preco.toFixed(2).replace(".", ",")}* 🍔\n\n${textoFechado()}`
            : undefined,
    };
  }

  // 5. Mandou o endereço.
  const bairro = cardapio.taxaBairro(texto);
  if (bairro) return { intencao: "endereco", bairro: bairro.bairro, taxa: bairro.taxa };

  // Falou de Pix fora de um pedido em curso: a resposta é a chave.
  //
  // Nas duas primeiras noites isto chamou o dono cinco vezes — "Vai ser
  // pix viu", "O pix", "Tu tem uma chave Pix de CPF ou celular ?", "O
  // nome do pix é vitória régia?". A chave já estava aqui, e o bloco que
  // o bot manda traz o nome junto, que responde as três perguntas.
  //
  // Mandar a chave nunca atrapalha: no pior caso o cliente já tinha.
  if (/\bpix\b/.test(n) && respostas.temPix()) {
    return {
      intencao: "pagamento_pix",
      loja: avisoFechado || undefined,
      acao: "manda a chave do Pix",
      mensagem: respostas.pix() + (avisoFechado ? `\n\n${textoFechado()}` : ""),
    };
  }

  if (/\b(cartao|dinheiro|debito|credito|troco)\b/.test(n)) {
    return { intencao: "pagamento", loja: avisoFechado || undefined };
  }
  // "vocês estão recebendo pedidos?" caiu em nao_entendi na primeira noite
  // de observação — e é das perguntas que o cliente mais faz, justamente a
  // que o bot tinha como responder. Daí "recebendo pedido", "atendendo",
  // "tá aberto" entrarem aqui.
  if (/\b(aberto|abriu|abre|fechado|funcionando|atendendo|recebendo|pedidos?|horario|entrega|taxa|demora|quanto tempo|pizza)\b/.test(n)) {
    return {
      intencao: "duvida",
      loja: avisoFechado || undefined,
      acao: avisoFechado
        ? `responde a dúvida e avisa: ${avisoFechado}`
        : "confirma que está aberto e manda o cardápio",
      // COM A LOJA ABERTA isto devolvia `undefined` e o bot calava.
      //
      // "Ainda faz entrega ?", "Ainda consigo fazer pedido?" — a
      // pergunta é se dá para pedir AGORA, e a resposta é sim. Ficar
      // calado justamente quando a resposta é boa é o pior jeito de
      // errar: a pessoa estava com o dinheiro na mão.
      mensagem: avisoFechado
        ? textoFechado()
        : `Estamos abertos sim! 🔥\n\nFunciona até às 23:00. Pedido pelo link 👇\n🔗 ${respostas.LINK}`,
    };
  }

  // Não entendi, MAS a loja está fechada ou pausada: quem escreveu merece
  // saber disso, qualquer que tenha sido a pergunta. Silêncio aqui é o
  // cliente esperando resposta que não vem.
  if (avisoFechado) {
    return {
      intencao: "nao_entendi_loja_fechada",
      loja: avisoFechado,
      acao: "não sei responder, mas aviso que não dá para pedir agora",
      mensagem: textoFechado(),
    };
  }

  return { intencao: "nao_entendi", acao: "não responde; deixa para o dono" };
}

// ──────────────────────────────────────────────
// O QUE O BOT PODE RESPONDER SOZINHO.
//
// Lista fechada, de propósito. Tudo que não está aqui — inclusive o que
// ele achou que entendeu mas com confiança baixa — vira pedido de ajuda:
// não responde nada ao cliente e avisa o dono no WhatsApp dele.
//
// A regra é do dono: "qualquer dúvida que o bot tiver, não responda,
// manda msg pro meu wpp que eu vou lá responder". É o jeito seguro de
// soltar um bot no número que recebe pedido — o pior que acontece é ele
// ficar quieto e alguém humano aparecer, nunca uma resposta errada.
// ──────────────────────────────────────────────
const PODE_RESPONDER = new Set([
  // A IA entendeu e escreveu a resposta. Só chega aqui depois de passar
  // pela conferência de preço em cerebro.js: preço que não existe no
  // cardápio não sai, vira pedido de ajuda.
  "ia_respondeu",
  "saudacao",             // boas-vindas / ausência / pausado — texto fixo
  "loja_fechada",
  "loja_pausada",
  "duvida",               // só cai aqui quando é sobre horário/loja
  "tempo_entrega",
  "endereco_da_loja",
  "endereco",             // bairro reconhecido, taxa conhecida
  "consulta_de_local",    // o dono mandando o código do pedido
  "nao_entendi_loja_fechada",
  // Perguntas simples que o bot deixava sem resposta e passava para o
  // dono: pediram o cardápio quatro vezes nas duas primeiras noites.
  "pergunta_cardapio",
  "pizza_esgotada",
  "agradecimento_cliente",
  "elogio",
  "pagamento_pix",
  // O fluxo de pedido: o bot conduz e so cria depois do "sim".
  "tomando_pedido",
  "confirmando_pedido",
  "pedido_criado",
  "abaixo_do_minimo",
]);

// Estes ele entende, mas só responde quando a confiança é alta: item
// errado vira comida errada na cozinha.
function podeResponder(leitura) {
  if (leitura.escalar) return false;
  if (leitura.erro) return false;

  // ITEM ESGOTADO é informação, não pedido — e vale com a loja aberta.
  //
  // O dono sinaliza "acabou" escondendo o item, e faz isso várias vezes
  // por noite. Mas a regra abaixo exigia loja FECHADA para o bot falar
  // de item, então, com a loja aberta, quem pedia o que tinha acabado
  // recebia silêncio: nem soube que acabou, nem viu o que ainda tem.
  // Pior cenário possível, no horário de maior movimento.
  if (leitura.esgotado) return Boolean(leitura.mensagem);

  // Pedido escrito: o bot diz o preço só quando a loja está FECHADA —
  // aí não há pedido a tomar, é informação e ponto.
  //
  // Com a loja aberta e item identificado com certeza, o pedido é TOMADO
  // (intenção "tomando_pedido"), não respondido aqui. Cair neste ramo com
  // a loja aberta significa confiança baixa — e aí o certo é perguntar
  // qual item, não responder preço de um palpite.
  if (leitura.intencao === "pedido_escrito") {
    return leitura.confianca === "alta" && Boolean(leitura.loja);
  }

  if (leitura.intencao === "pedido_pelo_botao") return Boolean(leitura.mensagem);
  return PODE_RESPONDER.has(leitura.intencao);
}

// ──────────────────────────────────────────────
// Avisa o dono quando o bot encosta no limite do que pode responder.
//
// Marcar a conversa como "dele" não serve de nada se ele não ficar
// sabendo: no meio do movimento ninguém está olhando o WhatsApp Web. O
// aviso vai para o WhatsApp DA PRÓPRIA LOJA — a conversa consigo mesmo —
// porque é onde ele já está durante o expediente, e porque não exige
// credencial nenhuma além da que a Evolution já tem.
//
// Vale MESMO em modo de observação: o alerta é para ele, não para
// cliente, e é justamente agora que ele precisa saber o que o bot
// deixaria passar.
// ──────────────────────────────────────────────
const ALERTA_NUMERO = process.env.ALERTA_NUMERO || "";
const ALERTAR = process.env.ALERTAR_DONO !== "0" && Boolean(ALERTA_NUMERO);

// Sem rajada: se cinco clientes cobrarem ao mesmo tempo, ele recebe um
// aviso, não cinco. Guarda por conversa.
const ALERTADO = new Map();
const ALERTA_JANELA_MS = 20 * 60 * 1000;

const MOTIVO = {
  cobranca_de_pedido:        "está cobrando o pedido",
  pedido_ou_endereco_errado: "diz que errou o pedido ou o endereço",
  print_pendente:            "mandou um print",
  sem_texto:                 "mandou algo que não é texto",
  nao_entendi:               "escreveu algo que não entendi",
  pedido_escrito:            "pediu algo e não tenho certeza do item",
};

// Telegram como segundo canal. O WhatsApp da loja sozinho não basta: o
// aviso cai no meio de dezenas de conversas de cliente e se perde. No
// Telegram só tem ele, então o aviso fica visível.
//
// Os dois saem juntos, de propósito. Se um canal falhar — token expirado,
// Telegram fora do ar, WhatsApp desconectado —, o outro ainda chega. Para
// um aviso que existe justamente porque alguém está esperando resposta,
// redundância vale mais que economia.
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID || "";

async function avisarTelegram(texto) {
  if (!TG_TOKEN || !TG_CHAT) return null;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      { chat_id: TG_CHAT, text: texto, parse_mode: "Markdown" },
      { timeout: 15000 }
    );
    return "ok";
  } catch (e) {
    // O Markdown do Telegram recusa a mensagem INTEIRA quando há um
    // underscore ou asterisco solto — já aconteceu nesta base. Então
    // tenta de novo sem formatação antes de desistir.
    try {
      await axios.post(
        `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
        { chat_id: TG_CHAT, text: texto.replace(/[*_`]/g, "") },
        { timeout: 15000 }
      );
      return "ok (sem formatação)";
    } catch (e2) {
      const d = e2.response?.data?.description || e2.message;
      console.error("[telegram]", d);
      return "falhou: " + d;
    }
  }
}

async function alertarDono(msg, leitura) {
  if (!ALERTAR && !TG_TOKEN) return null;
  const ultimo = ALERTADO.get(msg.conversa);
  if (ultimo && Date.now() - ultimo < ALERTA_JANELA_MS) return "repetido";
  ALERTADO.set(msg.conversa, Date.now());

  const motivo = MOTIVO[leitura.intencao] || "precisa de você";
  const quem = msg.nome ? `*${msg.nome}*` : "Um cliente";
  const dica = leitura.alternativas?.length
    ? `\n\nPode ser: ${leitura.alternativas.slice(0, 3).join(" / ")}`
    : "";
  const texto = `🔔 ${quem} ${motivo}:\n\n_"${String(msg.texto || "").slice(0, 160)}"_${dica}\n\nO bot não respondeu. Assume aí 🙏`;

  // Os dois canais ao mesmo tempo, e nenhum espera pelo outro.
  const [zap, tg] = await Promise.all([
    (async () => {
      if (!ALERTAR) return "desligado";
      try {
        await axios.post(
          `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
          { number: ALERTA_NUMERO, text: texto },
          { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 15000 }
        );
        return "ok";
      } catch (e) {
        console.error("[alerta zap]", e.response?.data?.message || e.message);
        return "falhou: " + (e.response?.status || e.message);
      }
    })(),
    avisarTelegram(texto),
  ]);

  return `zap:${zap}` + (tg ? ` tg:${tg}` : " tg:nao-configurado");
}

// ──────────────────────────────────────────────
app.post("/webhook/evolution", async (req, res) => {
  // Confirma na hora: a Evolution reenvia o que demora, e processar antes
  // de responder geraria mensagem duplicada.
  res.status(200).json({ ok: true });

  try {
    const msg = extrair(req.body);
    if (!msg.conversa) return;
    if (msg.evento && !/messages\.upsert/i.test(msg.evento)) return;

    // O dono respondeu nesta conversa? Então ele assumiu — o bot cala.
    // Nada pior do que ele digitando e o bot atropelando por cima.
    if (msg.minha) { marcarDonoFalou(msg.conversa); return; }
    if (donoFalouHaPouco(msg.conversa)) {
      // Grava o texto também: sem ele não dá para revisar depois o que o
      // cliente perguntou nessas conversas, que são justamente as que o
      // dono achou que precisavam dele.
      registrar({ conversa: msg.conversa, tipo: msg.tipo, texto: msg.texto || null, leitura: { intencao: "dono_assumiu" } });
      return;
    }

    let texto = msg.texto;
    let audio = null;
    if (msg.temAudio && msg.id) {
      audio = await transcrever(msg.id);
      if (audio.texto) texto = audio.texto;
    }

    const leitura = await decidir(texto, msg);

    // Já disse isso aqui há pouco? Então cala — e registra que calou, para
    // a gente ver depois quantas repetições foram evitadas.
    if (leitura.mensagem && jaDisseAgora(msg.conversa, leitura.mensagem)) {
      leitura.repetida = true;
      leitura.acao = "já disse isso nesta conversa há pouco; não repete";
      delete leitura.mensagem;
    }

    // Calar no meio de um pedido em curso NÃO é a mesma coisa que calar
    // numa conversa solta.
    //
    // Sem esta distinção, foi o que aconteceu com o pedido do Renan em
    // 05/11/2026: o bot ia repetir "me passa o endereço", a trava
    // engoliu a repetição, e ninguém soube — nem o cliente, que ficou
    // sem resposta, nem o dono, que não recebeu aviso. Pedido morreu em
    // silêncio.
    //
    // Repetir a mesma frase enquanto há pedido aberto significa que o bot
    // está rodando em círculo. Aí é exatamente a hora de chamar o dono.
    const travou = Boolean(leitura.repetida) && Boolean(pedidos.pegar(msg.conversa));
    if (travou) {
      leitura.acao = "TRAVOU num pedido em curso: ia repetir a mesma pergunta. Assume você.";
      leitura.escalar = true;
    }

    // Responde, cala, ou chama o dono.
    const responde = podeResponder(leitura) && Boolean(leitura.mensagem);
    leitura.decisao = responde
      ? "responde"
      : travou ? "travou" : (leitura.repetida ? "calou" : "chama_o_dono");

    // Repetição silenciada FORA de pedido não é pedido de ajuda: o bot
    // sabia a resposta e escolheu não repetir. Alertar ali enchia o dono
    // de aviso de coisa resolvida — e foi o que aconteceu no primeiro
    // teste dele, que pareceu falha quando era decisão correta mal
    // comunicada.
    const alerta = responde || (leitura.repetida && !travou)
      ? null
      : await alertarDono(msg, leitura);

    // Pedido criado: o dono precisa saber na hora, mesmo sem ter sido
    // chamado. É venda entrando, não problema — e ele vai querer olhar o
    // primeiro que o bot fechar sozinho.
    if (leitura.avisarDono && RESPONDER) {
      await Promise.all([
        ALERTA_NUMERO ? axios.post(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
          { number: ALERTA_NUMERO, text: leitura.avisarDono },
          { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 15000 }).catch(() => {}) : null,
        avisarTelegram(leitura.avisarDono),
      ]);
    }

    // E aqui, se estiver solto, o bot fala com o cliente.
    let envio = null;
    if (RESPONDER && responde) {
      try {
        await axios.post(
          `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
          // O identificador vai INTEIRO, com o domínio.
          //
          // Eu cortava o "@lid" e mandava só os dígitos — a Evolution
          // então assumia "@s.whatsapp.net", procurava um telefone que não
          // existe e devolvia 400. O bot decidia certo e falhava calado no
          // envio; a mulher do dono mandou "bom dia" e não recebeu nada.
          // Com 90% das conversas em LID, isso derrubava quase tudo.
          { number: msg.conversa, text: leitura.mensagem, delay: 1200, linkPreview: false },
          { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 20000 }
        );
        envio = "enviado";
      } catch (e) {
        envio = "falhou: " + (e.response?.data?.message || e.message);
        console.error("[envio]", envio);
      }
    }

    // Memória curta para a IA: o que a pessoa disse e o que o bot
    // respondeu. É o que faz um "sim" ou "o primeiro" ter sentido na
    // mensagem seguinte.
    lembrar(msg.conversa, "cliente", texto);
    if (responde && leitura.mensagem) lembrar(msg.conversa, "bot", leitura.mensagem);

    registrar({
      decisao: leitura.decisao,
      envio: envio || undefined,
      alerta: alerta || undefined,
      conversa: msg.conversa,
      nome: msg.nome,
      tipo: msg.tipo,
      texto: texto || null,
      transcrito: audio?.texto ? true : undefined,
      erroAudio: audio?.erro,
      local: msg.local,
      leitura,
      respondeu: RESPONDER,
    });

    if (!RESPONDER) return;   // modo de observação: entende e anota, não fala
  } catch (e) {
    console.error("[webhook]", e.message);
  }
});

// Não repetir a mesma mensagem para a mesma conversa.
//
// Na primeira noite de observação um cliente mandou "oii" e "boa noite"
// com um minuto de diferença: o bot teria mandado a mensagem de ausência
// duas vezes. Gente escreve em rajada, e receber o mesmo texto repetido
// parece robô quebrado — além de ser exatamente o que o WhatsApp olha
// para flagrar automação.
const JA_DISSE = new Map();
// 10 minutos, não 30.
//
// A trava existe para a rajada: "oii" e "boa noite" com um minuto entre
// elas, que foi o caso real da primeira noite. Meia hora silenciava
// também quem volta a escrever depois — gente diferente, com intenção
// diferente. Dez minutos cobre a rajada e devolve o resto.
const NAO_REPETIR_MS = 10 * 60 * 1000;

function jaDisseAgora(conversa, mensagem) {
  if (!mensagem) return false;
  // Só os primeiros caracteres: as variações mudam o fim do texto, mas
  // mandar "Segue a chave do Pix" e "Pode pagar por aqui" seguidos é a
  // mesma repetição aos olhos de quem recebe.
  const marca = conversa + "|" + mensagem.slice(0, 40);
  const quando = JA_DISSE.get(marca);
  if (quando && Date.now() - quando < NAO_REPETIR_MS) return true;
  JA_DISSE.set(marca, Date.now());
  return false;
}

// Quem o dono atendeu nos últimos minutos. Em memória de propósito: se o
// serviço reiniciar, o pior que acontece é o bot responder uma vez a mais.
const DONO_FALOU = new Map();
const JANELA_DONO_MS = 10 * 60 * 1000;
function marcarDonoFalou(conversa) { DONO_FALOU.set(conversa, Date.now()); }
function donoFalouHaPouco(conversa) {
  const t = DONO_FALOU.get(conversa);
  return Boolean(t) && Date.now() - t < JANELA_DONO_MS;
}

// ──────────────────────────────────────────────
// Mensagens de status do pedido.
//
// Eram da OlaClick e foram desligadas junto com o chatbot dela. São as
// que o cliente espera: "recebemos", "foi aceito", "está a caminho",
// "chegou". O dono tinha exatamente essas quatro ligadas; "pronto",
// "entregue" e "cancelado" ficavam desligadas, e isso é mantido.
//
// Vem pelo webhook do OlaClick, não por polling: o cliente está olhando
// o celular esperando, e meio minuto importa.
//
// Os status de transição não aparecem em pedido antigo (fica tudo
// FINALIZED), então o mapa cobre o que se sabe e o que não casar é
// REGISTRADO em vez de ignorado — é assim que se descobre o resto na
// primeira noite, em vez de adivinhar agora.
// ──────────────────────────────────────────────
// Os nomes vieram da primeira noite, não de chute.
//
// Eu tinha mapeado ON_THE_WAY / IN_ROUTE / DISPATCHED, e nenhum existe. O
// OlaClick manda DRIVER_ON_THE_WAY_TO_DESTINATION e
// DRIVER_ARRIVED_AT_DESTINATION — por isso "a caminho" nunca saiu ontem,
// 13 vezes. Só soubemos porque o bot grava o que não conhece em vez de
// ignorar; se ignorasse, o aviso simplesmente nunca existiria e ninguém
// descobriria o motivo.
const STATUS_MENSAGEM = {
  PENDING:   "recebido",
  PREPARING: "aceito",
  ACCEPTED:  "aceito",
  DRIVER_ON_THE_WAY_TO_DESTINATION: "a_caminho",
  DRIVER_ARRIVED_AT_DESTINATION:    "chegou",
  DELIVERED: "chegou",
};

// O status da ENTREGA, quando vem, manda mais que o do pedido.
// RIDER_ASSIGNED é o entregador saindo; DELIVERING é ele na rua.
const ENTREGA_MENSAGEM = {
  RIDER_ASSIGNED: "a_caminho",
  DELIVERING:     "a_caminho",
  DELIVERED:      "chegou",
  ARRIVED:        "chegou",
};
// Desligadas de propósito, como ele tinha na OlaClick.
const STATUS_IGNORADOS = new Set(["READY", "FINALIZED", "CANCELLED", "CANCELED", "INITIATED"]);

// Cada pedido avança uma vez por etapa. ORDER_UPDATED dispara varias
// vezes pela mesma mudança, e mandar "seu pedido foi aceito" três vezes
// é pior do que não mandar.
const JA_AVISOU = new Map();

function proximoAviso(pedidoId, etapa) {
  const chave = pedidoId + "|" + etapa;
  if (JA_AVISOU.has(chave)) return false;
  JA_AVISOU.set(chave, Date.now());
  // Não cresce para sempre: limpa o que tem mais de 12h.
  if (JA_AVISOU.size > 2000) {
    const limite = Date.now() - 12 * 3600 * 1000;
    for (const [k, t] of JA_AVISOU) if (t < limite) JA_AVISOU.delete(k);
  }
  return true;
}

app.post("/hooks/olaclick/:segredo", async (req, res) => {
  res.status(200).json({ ok: true });
  if (req.params.segredo !== (process.env.HOOK_SEGREDO || "")) return;

  try {
    const corpo = req.body || {};
    const pedido = corpo.data || corpo.order || corpo;
    const evento = String(corpo.event_type || corpo.type || "").toUpperCase();
    if (/DELET|CANCEL/.test(evento)) return;

    const status  = String(pedido?.status || "").toUpperCase();
    const entrega = String(pedido?.delivery_status || "").toUpperCase();
    // O status do PEDIDO vem primeiro: DRIVER_ARRIVED_AT_DESTINATION com
    // entrega DELIVERING é "chegou", e olhar só a entrega diria "a
    // caminho" — mandaria o aviso errado na última etapa.
    const etapa = STATUS_MENSAGEM[status] || ENTREGA_MENSAGEM[entrega] || null;

    const numero = [pedido?.client?.country_calling_code, pedido?.client?.phone_number]
      .filter(Boolean).join("").replace(/\D/g, "");
    const codigo = pedido?.public_id || pedido?.id;
    const nome = String(pedido?.client?.name || "").split(" ")[0] || null;

    if (!etapa) {
      // Não sei o que é isto — registra para aprendermos, não ignora.
      if (!STATUS_IGNORADOS.has(status) && !STATUS_IGNORADOS.has(entrega)) {
        registrar({ hook: "olaclick", pedido: codigo, status, entrega, leitura: { intencao: "status_desconhecido" } });
      }
      return;
    }

    // iFood mascara o telefone ("0800 700 3020 | ..."), então não dá para
    // avisar esse cliente — e nem precisa, o iFood já avisa ele.
    if (!numero || numero.length < 12 || numero.startsWith("550800")) {
      registrar({ hook: "olaclick", pedido: codigo, etapa, leitura: { intencao: "sem_telefone_util" } });
      return;
    }

    if (!proximoAviso(codigo, etapa)) return;

    const texto = respostas.status(etapa, codigo, nome);
    if (!texto) return;

    let envio = "observando";
    if (RESPONDER) {
      try {
        await axios.post(
          `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
          { number: numero, text: texto, delay: 800, linkPreview: false },
          { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 20000 }
        );
        envio = "enviado";
      } catch (e) {
        envio = "falhou: " + (e.response?.data?.message || e.message);
        console.error("[status]", envio);
      }
    }
    registrar({ hook: "olaclick", pedido: codigo, etapa, envio, texto, leitura: { intencao: "status_do_pedido" } });
  } catch (e) {
    console.error("[hook olaclick]", e.message);
  }
});

// ──────────────────────────────────────────────
// Página para o dono ver o que o bot está respondendo.
//
// Ele não consegue ler isso no WhatsApp: no aparelho dele aparece
// "Aguardando mensagem", o aviso de mensagem que não deu para
// descriptografar. Chega no cliente; quem fica sem ver é ele — e sem
// ver não dá para confiar.
//
// Atrás do mesmo segredo do webhook: são conversas de cliente.
// ──────────────────────────────────────────────
app.get("/painel/:segredo", async (req, res) => {
  if (req.params.segredo !== (process.env.HOOK_SEGREDO || "")) return res.status(404).end();
  const estado = await estadoDaLoja().catch(() => null);
  const dados = painel.agrupar(painel.lerDiario(DIARIO));
  res.type("html").send(painel.montarHtml(dados, estado));
});

app.get("/saude", async (req, res) => {
  let observadas = 0;
  try { observadas = fs.readFileSync(DIARIO, "utf8").split("\n").filter(Boolean).length; } catch {}
  const estado = await estadoDaLoja().catch((e) => ({ erro: e.message }));
  res.json({
    ok: true,
    modo: RESPONDER ? "respondendo" : "observando",
    observadas,
    loja: estado?.situacao || estado,
    indisponiveis: estado?.indisponiveis?.total,
    cardapio: cardapio.CARDAPIO.itens.length,
    openai: Boolean(OPENAI_KEY),
  });
});

app.get("/observacao", (req, res) => {
  try {
    const linhas = fs.readFileSync(DIARIO, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const porIntencao = {};
    linhas.forEach((l) => {
      const i = l.leitura?.intencao || "?";
      porIntencao[i] = (porIntencao[i] || 0) + 1;
    });
    res.json({ total: linhas.length, porIntencao, ultimas: linhas.slice(-25) });
  } catch {
    res.json({ total: 0, porIntencao: {}, ultimas: [] });
  }
});

// Só sobe o servidor quando é o processo principal. Assim o teste de
// conversa (`node infra/bot/testarConversa.js`) consegue exercitar a
// decisão sem abrir porta, sem webhook e sem mandar mensagem para
// ninguém — era o que faltava para ensaiar um pedido inteiro fora do
// horário da loja, em vez de testar na noite de operação.
if (require.main === module) {
  app.listen(PORTA, () => {
    console.log(`Atendente na porta ${PORTA} — modo ${RESPONDER ? "RESPONDENDO" : "observação"}`);
  });
}

module.exports = { decidir, tratarPedidoEmCurso, podeResponder, estadoDaLoja };
