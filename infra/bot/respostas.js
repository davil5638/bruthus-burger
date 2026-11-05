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

// Fora do horário. `abertura` vem de loja.js: { dia, hora, hoje }.
//
// "Abrimos quinta às 18:30" dito numa quinta de manhã soa como se fosse
// semana que vem. Quando a abertura é hoje, diz hoje.
function ausencia(abertura) {
  const quando = abertura
    ? (abertura.hoje
        ? `Abrimos hoje às ${abertura.hora}.`
        : `Abrimos ${abertura.dia} às ${abertura.hora}.`)
    : "";
  return `👋 Olá! No momento não podemos atendê-lo 🕐

${quando}

Esperamos vê-lo em breve! 🙌

Caso queira, já pode deixar seu pedido agendado pelo link 👇
🔗 ${LINK}`;
}

// ──────────────────────────────────────────────
// Pausado por alta demanda — diferente de fechado.
//
// É o que o dono hoje digita um por um: "estamos com alta demanda, e
// estamos dando 1:30h de espera, vc quer esperar ou deixa pra proxima?".
// O bot não sabe o tempo de espera, então não promete prazo: prometer
// errado é pior do que não prometer.
// ──────────────────────────────────────────────
function pausado() {
  return sortear([
    `Oi! No momento estamos com a produção cheia e pausamos os pedidos por um tempinho 🙏\nAssim que liberar, o cardápio volta no link: ${LINK}`,
    `Oi! Estamos com alta demanda agora e pausamos os pedidos para dar conta da fila 🔥\nDaqui a pouco liberamos de novo: ${LINK}`,
    `Oi! Pausamos os pedidos por uns minutos porque a cozinha está cheia 🙏\nFica de olho no link que já volta: ${LINK}`,
  ]);
}

// Item fora do ar. O dono esconde item por item, então dá para dizer o
// nome — bem melhor que um "não temos" seco.
function esgotado(nome, alternativas = []) {
  const sobra = alternativas.length
    ? `\n\nAinda temos: ${alternativas.slice(0, 4).join(", ")}.`
    : "";
  return `Poxa, ${nome} acabou hoje 😕${sobra}\n\nCardápio completo: ${LINK}`;
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
  temPix: () => Boolean(PIX_CHAVE),
};
