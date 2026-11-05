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

const cardapio = require("./scripts/cardapio");
const loja     = require("./scripts/loja");
const olaclick = require("./scripts/olaclickApi");
const respostas = require("./respostas");

const PORTA        = Number(process.env.PORTA || 3000);
const RESPONDER    = process.env.RESPONDER === "1";
const EVO_URL      = (process.env.EVOLUTION_API_URL || "http://evolution:8080").replace(/\/$/, "");
const EVO_KEY      = process.env.EVOLUTION_API_KEY || "";
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "bruthus";
const OPENAI_KEY   = process.env.OPENAI_API_KEY || "";
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
// O que o bot entendeu e o que faria.
// ──────────────────────────────────────────────
async function decidir(texto, msg) {
  const estado = await estadoDaLoja().catch(() => null);

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
    try {
      // Pelo código público, não pelo UUID: `/orders/{BR-x}` devolve 422.
      const pedido = await olaclick.buscarPedidoPorCodigo(codigo);
      if (!pedido) return { intencao: "pedido_pelo_botao", pedido: codigo, erro: "não achei esse pedido" };
      const forma = pedido?.payments?.[0]?.payment_method?.code || null;
      // Pix pede a chave e o comprovante; cartão e dinheiro só agradecem.
      const mensagem = forma === "pix"
        ? respostas.pix()
        : forma ? respostas.agradecimento() : null;

      return {
        intencao: "pedido_pelo_botao",
        pedido: codigo,
        total: pedido?.total,
        pagamento: forma,
        acao: forma ? RAMO_PAGAMENTO[forma] : "forma de pagamento ainda não definida",
        mensagem,
      };
    } catch (e) {
      return { intencao: "pedido_pelo_botao", pedido: codigo, erro: e.message };
    }
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
      : fechouHoje ? respostas.jaEncerramos(estado?.proximaAbertura)
      : respostas.ausencia(estado?.proximaAbertura, estado?.funcionamento);

  const n = cardapio.normalizar(texto);
  if (!n) return { intencao: msg?.temImagem ? "print_pendente" : "sem_texto" };

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

  // 3. Só um cumprimento. 135 conversas abriram assim.
  if (/^(oi+|ola|alo|opa|bo[am]\s+(dia|tarde|noite)|e\s*ai)[\s!,.]*$/.test(n)) {
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
  const achado = cardapio.buscarItem(texto);
  if (achado) {
    const fora = estado?.indisponiveis?.nomes || [];
    const esgotado = fora.some((f) => cardapio.normalizar(f) === cardapio.normalizar(achado.item.nome));
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
            : respostas.esgotado(achado.item.nome, cardapio.CARDAPIO.itens.filter((i) => i.cat === achado.item.cat).map((i) => i.nome)))
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

  if (/\b(pix|cartao|dinheiro|debito|credito|troco)\b/.test(n)) {
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
        : "responde com o que sabe da loja e do cardápio",
      mensagem: avisoFechado ? textoFechado() : undefined,
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
  "saudacao",             // boas-vindas / ausência / pausado — texto fixo
  "loja_fechada",
  "loja_pausada",
  "duvida",               // só cai aqui quando é sobre horário/loja
  "tempo_entrega",
  "endereco_da_loja",
  "endereco",             // bairro reconhecido, taxa conhecida
  "consulta_de_local",    // o dono mandando o código do pedido
  "nao_entendi_loja_fechada",
]);

// Estes ele entende, mas só responde quando a confiança é alta: item
// errado vira comida errada na cozinha.
function podeResponder(leitura) {
  if (leitura.escalar) return false;
  if (leitura.erro) return false;

  // Pedido escrito: o bot diz o preço só quando a loja está FECHADA —
  // aí não há pedido a tomar, é informação e ponto.
  //
  // Com a loja aberta, pedido é do dono. Fechar um pedido exige ponto da
  // carne, maionese, endereço e forma de pagamento, e o bot não conduz
  // essa conversa ainda. Responder "R$ 42,99" e parar aí deixaria o
  // cliente achando que pediu quando não pediu — pior que não responder.
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

async function alertarDono(msg, leitura) {
  if (!ALERTAR) return null;
  const ultimo = ALERTADO.get(msg.conversa);
  if (ultimo && Date.now() - ultimo < ALERTA_JANELA_MS) return "repetido";
  ALERTADO.set(msg.conversa, Date.now());

  const motivo = MOTIVO[leitura.intencao] || "precisa de você";
  const quem = msg.nome ? `*${msg.nome}*` : "Um cliente";
  const dica = leitura.alternativas?.length
    ? `\n\nPode ser: ${leitura.alternativas.slice(0, 3).join(" / ")}`
    : "";
  const texto = `🔔 ${quem} ${motivo}:\n\n_"${String(msg.texto || "").slice(0, 160)}"_${dica}\n\nO bot não respondeu. Assume aí 🙏`;

  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: ALERTA_NUMERO, text: texto },
      { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 15000 }
    );
    return "enviado";
  } catch (e) {
    console.error("[alerta]", e.response?.data?.message || e.message);
    return "falhou: " + (e.response?.status || e.message);
  }
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

    // Responde ou chama o dono — nunca os dois, nunca nenhum.
    const responde = podeResponder(leitura) && Boolean(leitura.mensagem);
    leitura.decisao = responde ? "responde" : "chama_o_dono";

    // O aviso sai mesmo em observação: é para ele, não para cliente, e é
    // agora que ele precisa ver o que o bot deixaria passar.
    const alerta = responde ? null : await alertarDono(msg, leitura);

    // E aqui, se estiver solto, o bot fala com o cliente.
    let envio = null;
    if (RESPONDER && responde) {
      try {
        await axios.post(
          `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
          { number: msg.conversa.replace(/@.*/, ""), text: leitura.mensagem, delay: 1200, linkPreview: false },
          { headers: { apikey: EVO_KEY, "Content-Type": "application/json" }, timeout: 20000 }
        );
        envio = "enviado";
      } catch (e) {
        envio = "falhou: " + (e.response?.data?.message || e.message);
        console.error("[envio]", envio);
      }
    }

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
const NAO_REPETIR_MS = 30 * 60 * 1000;

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

app.listen(PORTA, () => {
  console.log(`Atendente na porta ${PORTA} — modo ${RESPONDER ? "RESPONDENDO" : "observação"}`);
});
