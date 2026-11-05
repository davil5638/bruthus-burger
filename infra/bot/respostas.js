// ──────────────────────────────────────────────
// respostas.js — tudo que o bot diz, num lugar só
//
// Os textos saíram do atendimento real do dono, não da minha cabeça:
// o agradecimento foi extraído do histórico, onde ele apareceu 366 vezes,
// e as de boas-vindas, ausência e status são as que ele já usa hoje no
// painel da OlaClick. A ideia é o cliente não perceber a troca.
//
// POR QUE CADA UMA TEM VARIAÇÕES:
// A própria OlaClick avisa no painel: "Criaremos diferentes versões
// automaticamente para cumprir as políticas do Meta". Texto idêntico
// repetido dezenas de vezes por noite, do mesmo número, é o padrão que
// derruba conta. Aqui o número é o da operação — o mesmo que recebe
// pedido —, então variar não é capricho.
//
// A CHAVE DO PIX fica no ambiente, nunca aqui: este arquivo vai para o
// git, o .env da VM não.
// ──────────────────────────────────────────────

const LOJA = "Bruthus Burger & Pizza";
const LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const PIX_CHAVE = process.env.PIX_CHAVE || "";
const PIX_NOME  = process.env.PIX_NOME || "";
// Como ele digita no WhatsApp (26 vezes no histórico), não o endereço
// formal do cadastro — que inclusive não traz o número 233.
const ENDERECO  = process.env.ENDERECO_LOJA || "Rua Manoel Messias, 233";

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

// ──────────────────────────────────────────────
// Primeiro contato. 135 conversas no histórico abriram com só um
// "boa noite" — é aqui que quase toda conversa começa.
// ──────────────────────────────────────────────
function boasVindas() {
  return `Olá! Seja bem-vindo(a) à ${LOJA}! 🍔

Confira nosso cardápio e faça seu pedido 👇
${LINK}

🍕 Pizzas em quantidade limitada!
Trabalhamos com produção limitada diariamente. Se não aparecer no cardápio, é porque já esgotou.

✅ Também atendemos pelo WhatsApp. Para agilizar, envie:
• Seu pedido
• Endereço
• Forma de pagamento

😊 Em breve retornaremos com a confirmação!`;
}

// Fora do horário. Três situações diferentes, três respostas:
//
//   terça (dia que não abre)      → "funcionamos de quarta a domingo"
//   quinta de manhã, antes de abrir → "abrimos HOJE às 18:30"
//   quinta depois das 23h          → "abrimos sexta às 18:30"
//
// Os dias vêm de `funcionamento`, derivado do horário cadastrado no
// OlaClick — nunca escritos à mão. A mensagem da OlaClick diz "quinta a
// domingo" em texto fixo e ficou errada no dia em que a quarta entrou;
// esta se corrige sozinha.
//
// O convite para agendar fica em todas: quem escreve de manhã janta à
// noite, e o pedido agendado é venda que entraria de qualquer jeito.
function ausencia(abertura, funcionamento) {
  const linhas = ["👋 Olá! No momento não podemos atendê-lo 🕐", ""];

  if (funcionamento) linhas.push(`Funcionamos ${funcionamento.texto}.`);

  if (abertura) {
    linhas.push(abertura.hoje
      ? `Abrimos *hoje às ${abertura.hora}* ⏰`
      : `Abrimos ${abertura.dia} às ${abertura.hora} ⏰`);
  }

  linhas.push("", "Caso queira, já pode deixar seu pedido agendado pelo link 👇", `🔗 ${LINK}`);
  return linhas.join("\n");
}

// ──────────────────────────────────────────────
// Pausado por alta demanda — diferente de fechado.
//
// É o que o dono hoje digita um por um: "estamos com alta demanda, e
// estamos dando 1:30h de espera, vc quer esperar ou deixa pra proxima?".
// O bot não sabe o tempo de espera, então não promete prazo: prometer
// errado é pior do que não prometer.
// ──────────────────────────────────────────────
// As palavras são dele, tiradas do histórico: "pra delivery estamos
// fechado por enquanto, devido a alta demanda" e "por isso pausamos o
// aplicativo". Eu tinha escrito algo bem mais formal; isto é como a loja
// realmente fala, e o cliente não estranha.
function pausado() {
  return sortear([
    `Oi! Pra delivery estamos fechado por enquanto, devido a alta demanda 🙏\nAssim que liberar o cardápio volta: ${LINK}`,
    `Oi! No momento não conseguimos pegar pedido, por conta da alta demanda 🥲\nDaqui a pouco liberamos: ${LINK}`,
    `Oi! Pausamos o aplicativo por um tempinho, tá tudo cheio aqui 🔥\nFica de olho no link que já volta: ${LINK}`,
  ]);
}

// ──────────────────────────────────────────────
// Quando o bot NÃO deve responder sozinho.
//
// "Cadê meu pedido?" é o caso mais claro. Olha como ele responde de
// verdade: "vou ligar aqui pra ele", "ele precisou voltar na loja", "o
// entregador pegou uma entrega pra Boa Vista, aí acabou atrasando".
// Nenhuma dessas o bot tem como saber — e inventar "já está a caminho"
// quando não está custa o cliente, com a loja levando a culpa.
//
// Então ele segura e chama o dono. "te digo já" é dele, do histórico:
// é exatamente o que uma pessoa faz quando precisa ir verificar.
// ──────────────────────────────────────────────
function vouVerificar() {
  return sortear([
    "Deixa eu verificar aqui e já te falo 🙏",
    "Só um instante que eu confiro e te digo já",
    "Vou dar uma olhada aqui e já te respondo 🙏",
  ]);
}

// Depois do horário de fechar, no mesmo dia. "Já encerramos" é dele.
function jaEncerramos(abertura) {
  const volta = abertura ? `\nVoltamos ${abertura.dia} às ${abertura.hora} ⏰` : "";
  return `${sortear(["Boa noite! Já encerramos 🥲", "Oi! Por hoje já encerramos 🥲"])}${volta}\n\nMas já dá pra deixar seu pedido agendado 👇\n🔗 ${LINK}`;
}

// Endereço da loja. Pedido 26 vezes no histórico, sempre para retirada —
// e o bot não sabia responder. Ele escreve curto assim mesmo.
function endereco() {
  return `${ENDERECO}\n\nQualquer coisa é só chamar 🙌`;
}

// Tempo de entrega. O cardápio anuncia 45–65 min, mas no WhatsApp ele
// responde "uns 30 min" e "40min". Vale o que ele diz ao cliente, senão
// o bot promete mais devagar do que a loja realmente é.
function tempoEntrega() {
  return sortear(["uns 40min", "entre 30 e 40min", "uns 40 minutos"]);
}

// Item fora do ar. O dono esconde item por item, então dá para dizer o
// nome — bem melhor que um "não temos" seco.
// Ele diz "Acabou a cebola caramelizada 🥲" — nomeia o que faltou e usa
// o 🥲, não um "indisponível" seco. Aqui o bot só sabe o item, não o
// ingrediente, então nomeia o item e oferece o que sobrou: a conversa
// continua sendo venda, não recusa.
function esgotado(nome, alternativas = []) {
  const sobra = alternativas.length
    ? `\n\nMas ainda tem: ${alternativas.slice(0, 4).join(", ")}`
    : "";
  return `Poxa, ${nome} acabou hoje 🥲${sobra}\n\nCardápio: ${LINK}`;
}

// Quando TODAS as pizzas saem do ar de uma vez, foi a massa que acabou —
// e aí nem adianta oferecer outro sabor.
function massaAcabou() {
  return `As pizzas acabaram por hoje 😕 A massa é de longa fermentação e fazemos quantidade limitada por dia.\n\nMas os hambúrgueres continuam saindo! ${LINK}`;
}

// ──────────────────────────────────────────────
// Pix: a chave e o pedido do comprovante.
//
// O dono manda isto hoje como cartão nativo do WhatsApp, com o botão
// "Copiar chave Pix". A Evolution não envia esse cartão — só texto. Por
// isso a chave vai sozinha numa linha, para o cliente conseguir copiar
// de uma vez no toque longo.
//
// O nome do recebedor vai junto de propósito: quem paga confere antes de
// mandar dinheiro, e não ver o nome gera a pergunta "é esse mesmo?".
// ──────────────────────────────────────────────
function pix() {
  if (!PIX_CHAVE) return null;
  const nome = PIX_NOME ? `\n_${PIX_NOME}_` : "";
  return `${sortear([
    "Pra finalizar, é só fazer o Pix 👇",
    "Segue a chave do Pix 👇",
    "Pode pagar por aqui 👇",
  ])}

*Chave Pix (CNPJ):*
${PIX_CHAVE}${nome}

${sortear([
  "Quando pagar, me manda o comprovante aqui 🙏",
  "Assim que fizer, manda o comprovante pra gente 🙏",
  "Depois é só mandar o comprovante aqui 🙏",
])}`;
}

// ──────────────────────────────────────────────
// Agradecimento. Este é literal do dono: apareceu 366 vezes no histórico,
// mais que qualquer outra mensagem dele. É a voz da casa.
// ──────────────────────────────────────────────
function agradecimento() {
  return "Obrigado pelo seu pedido, agradecemos a preferência 🍔🙌";
}

// ──────────────────────────────────────────────
// Status do pedido. As variações imitam o que a OlaClick já faz hoje —
// no histórico aparecem dezenas de formas diferentes de dizer a mesma
// coisa, e é de propósito.
// ──────────────────────────────────────────────
const STATUS = {
  recebido: [
    (n) => `📦 Recebemos seu pedido Nº ${n}. Estamos processando.`,
    (n) => `Pedido ${n} anotado. Avisamos quando estiver confirmado.`,
    (n) => `Seu pedido ${n} já está com a gente. Escrevemos assim que confirmarmos.`,
  ],
  aceito: [
    (n, c) => `✅ Oi${c ? " " + c : ""}, seu pedido Nº ${n} foi aceito. Estamos preparando tudo.`,
    (n) => `Pedido ${n} aceito. Já entrou em preparação 🔥`,
    (n) => `Aceitamos seu pedido ${n} e já estamos trabalhando nele.`,
  ],
  a_caminho: [
    (n) => `🛵 Seu pedido Nº ${n} já está a caminho.`,
    (n) => `Saiu para entrega! Pedido ${n} a caminho 🛵`,
    (n) => `Pedido ${n} já saiu, deve chegar logo 🛵`,
  ],
  chegou: [
    (n) => `📦 Seu pedido Nº ${n} chegou ao local indicado.`,
    (n) => `Chegamos! Pedido ${n} no endereço 🛵`,
    (n) => `Pedido ${n} entregue no local indicado.`,
  ],
};

function status(qual, numero, nomeCliente) {
  const opcoes = STATUS[qual];
  if (!opcoes) return null;
  return sortear(opcoes)(numero, nomeCliente);
}

// Confiança baixa na identificação: pergunta em vez de chutar. Mandar o
// item errado para a cozinha custa comida, dinheiro e cliente.
function qualDeles(opcoes) {
  return `Só pra confirmar, qual desses? 🤔\n\n${opcoes.slice(0, 3).map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
}

module.exports = {
  LOJA, LINK,
  boasVindas, ausencia, pausado, esgotado, massaAcabou,
  pix, agradecimento, status, qualDeles,
  jaEncerramos, endereco, tempoEntrega, vouVerificar, ENDERECO,
  temPix: () => Boolean(PIX_CHAVE),
};
