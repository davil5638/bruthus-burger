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

// ── CAMINHOS PRÓPRIOS, SEM HERDAR NADA DO AMBIENTE ──
//
// Aqui havia `process.env.DIARIO || <temp>`. Parecia cuidado e era o
// contrário: DENTRO DO CONTAINER a variável já vem definida como
// /dados/observacao.jsonl, o ensaio manteve esse caminho e o unlink
// abaixo APAGOU o diário de produção — o registro das noites de 06 e
// 07/11, que é a única memória do que o bot fez com cliente de verdade.
// Em 08/11/2026, 15:12, foi exatamente isso que aconteceu.
//
// Agora o ensaio IMPÕE o caminho dele e nunca pergunta ao ambiente.
const os = require("os");
const caminho = require("path");
process.env.DIARIO = caminho.join(os.tmpdir(), "ensaio-bot.jsonl");
process.env.PEDIDOS_EM_CURSO = caminho.join(os.tmpdir(), "ensaio-pedidos.json");
process.env.MODO_ARQUIVO = caminho.join(os.tmpdir(), "ensaio-modo.json");
// Ninguém é alertado e nada é enviado durante o ensaio.
process.env.ALERTAR_DONO = "0";
process.env.RESPONDER = "0";

// ── ESTA SUÍTE TESTA A REDE DE SEGURANÇA, NÃO A IA ──
//
// Quem responde ao cliente agora é a IA (cerebro.js). Ela não escreve a
// mesma frase duas vezes, então comparar texto exato aqui daria falha
// onde não há defeito — e, pior, passaria a depender de rede e de
// crédito na OpenAI para rodar.
//
// Então aqui a IA fica DESLIGADA de propósito: o que estes 42 ensaios
// guardam é o caminho que roda quando ela falha (sem chave, timeout,
// JSON torto). Essa rede precisa continuar correta justamente porque
// ninguém olha para ela quando está tudo bem.
//
// A IA é medida em outro lugar, contra as 91 mensagens reais das noites
// de 06 e 07/11:  node infra/bot/medirIA.js <diario.jsonl>
process.env.USAR_IA = "0";

// ── PIX FALSO, FIXO ──
// Quatro ensaios conferem se a chave Pix sai junto com o pedido. Eles
// liam PIX_CHAVE do ambiente: na VM existe, aqui não — então o mesmo
// arquivo dava verde lá e 10 falhas aqui, sem nada de errado no código.
// Teste que muda de resultado conforme a máquina não vale nada. Aqui a
// chave é sempre esta, e o que se testa é se ela chega ao cliente.
process.env.PIX_CHAVE = process.env.PIX_CHAVE || "ensaio@bruthus.teste";
process.env.PIX_NOME  = process.env.PIX_NOME  || "Bruthus Ensaio";

const fs = require("fs");
// Cinto e suspensório: só apaga dentro da pasta temporária. Se algum dia
// alguém reintroduzir um caminho vindo de fora, o teste para em vez de
// destruir arquivo de produção.
for (const f of [process.env.DIARIO, process.env.PEDIDOS_EM_CURSO]) {
  if (!f.startsWith(os.tmpdir())) {
    console.error(`ENSAIO ABORTADO: ${f} não está em ${os.tmpdir()} — não vou apagar isso.`);
    process.exit(1);
  }
  try { fs.unlinkSync(f); } catch {} // eslint-disable-line no-empty
}

// ── NADA VAI PARA O OLACLICK NESTE ENSAIO ──
// `criarPedido.criar` é substituído ANTES do index.js carregar. O bot
// chama por propriedade (`criarPedido.criar(...)`), então pega esta.
// Sem isto, ensaiar o "sim" criaria pedido de verdade na cozinha.
const criarPedido = (() => {
  try { return require("./scripts/criarPedido"); }
  catch { return require("../../scripts/criarPedido"); }
})();

const pedidosCriados = [];
criarPedido.criar = async (dados) => {
  pedidosCriados.push(dados);
  return {
    ok: true,
    public_id: "BR-ENSAIO" + pedidosCriados.length,
    total: dados.itens
      ? dados.itens.reduce((s, i) => s + (i.preco || 0) * (i.qtd || 1), 0)
      : 0,
  };
};

const bot = require("./index");
const pedidos = require("./pedidoEmCurso");
const loja = (() => {
  try { return require("./scripts/loja"); }
  catch { return require("../../scripts/loja"); }
})();

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

// ── O HORÁRIO REAL, CONGELADO ──
// Retrato do que a API devolvia em 06/11/2026: quarta a domingo,
// 18:30–23:00, segunda e terça fechadas. Fica aqui para o ensaio dar o
// mesmo resultado na minha máquina e na VM, com ou sem token.
//
// Se o dono mexer nos dias, isto envelhece — e é por isso que o ensaio
// compara com a API quando consegue falar com ela (veja `conferirHorario`).
const HORARIO_REAL = {
  sunday: { is_active: true, hours: [{ open: "18:30", close: "23:00" }] },
  monday: { is_active: false, hours: [{ open: "18:30", close: "23:00" }] },
  tuesday: { is_active: false, hours: [] },
  wednesday: { is_active: true, hours: [{ open: "18:30", close: "23:00" }] },
  thursday: { is_active: true, hours: [{ open: "18:30", close: "23:00" }] },
  friday: { is_active: true, hours: [{ open: "18:30", close: "23:00" }] },
  saturday: { is_active: true, hours: [{ open: "18:30", close: "23:00" }] },
};

// Monta o estado da loja com a LÓGICA REAL de scripts/loja.js, mudando
// só o relógio. É o que evita testar em cima de um estado inventado por
// mim — que foi exatamente o erro de ontem.
async function lojaEm(dia, hhmm, { pausada = false, fora = [], massaAcabou = false } = {}) {
  const dentro = loja.dentroDaFaixa(hhmm, HORARIO_REAL[dia].hours) && HORARIO_REAL[dia].is_active;
  const e = await loja.estado({
    empresa: { business_hours: HORARIO_REAL, currently_open: dentro && !pausada },
    agora: { hhmm, dia },
  });
  return { ...e, indisponiveis: { nomes: fora, massaAcabou } };
}

// Avisa se o horário cadastrado mudou e este arquivo ficou para trás.
async function conferirHorario() {
  if (!process.env.OLACLICK_API_TOKEN) {
    console.log("(horário: usando o retrato de 06/11/2026 — sem token para conferir)");
    return;
  }
  try {
    const olaclick = (() => {
      try { return require("./scripts/olaclickApi"); }
      catch { return require("../../scripts/olaclickApi"); }
    })();
    const empresa = await olaclick.buscarEmpresa();
    const igual = JSON.stringify(empresa?.business_hours) === JSON.stringify(HORARIO_REAL);
    console.log(igual
      ? "(horário: o retrato ainda bate com o OlaClick)"
      : "(ATENÇÃO: o horário no OlaClick MUDOU — atualize HORARIO_REAL neste arquivo)");
  } catch {
    console.log("(horário: não deu para conferir com a API agora)");
  }
}

let falhas = 0;

async function ensaiar(titulo, conversa, turnos, estadoLoja = LOJA_ABERTA) {
  console.log(`\n── ${titulo}`);
  pedidos.fechar(conversa);

  for (const turno of turnos) {
    const msg = { conversa, nome: "Ensaio", texto: turno.diz, tipo: "conversation" };
    let leitura = await bot.tratarPedidoEmCurso(msg, turno.diz, estadoLoja);
    if (!leitura) leitura = await bot.decidir(turno.diz, msg, estadoLoja);

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
    if (turno.naoPode && turno.naoPode.test(String(saida))) {
      falhas += 1;
      console.log(`  >>> FALHA: NÃO podia dizer ${turno.naoPode}`);
    }
    // "chama o dono" = o bot NÃO responde sozinho. No serviço real, todo
    // turno sem resposta que não seja repetição silenciada dispara o
    // aviso no WhatsApp e no Telegram — então calar aqui é o alerta.
    // (Checar `leitura.escalar` era asserção errada minha: o aviso não
    // depende dele.)
    if (turno.chamaODono && responde) {
      falhas += 1;
      console.log("  >>> FALHA: respondeu sozinho, e isto é do dono");
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

  // ──────────────────────────────────────────────
  // ONDE O DINHEIRO ANDA: a confirmação
  // ──────────────────────────────────────────────

  // Pix tem que vir com a CHAVE: sem ela o cliente não tem como pagar, e
  // o pedido já está na cozinha.
  await ensaiar("Diz SIM no Pix — tem que criar E mandar a chave", "ensaio-sim@lid", [
    { diz: "1 calabresa", naoPodeCalar: true },
    { diz: "Rua do Cajueiro 50, Centro", naoPodeCalar: true },
    { diz: "pix", naoPodeCalar: true },
    { diz: "sim", esperar: /chave pix|comprovante/i, naoPodeCalar: true },
  ]);

  // Dinheiro e cartão não têm chave nenhuma a mandar.
  await ensaiar("Diz SIM no dinheiro — sem chave de Pix", "ensaio-sim-dinheiro@lid", [
    { diz: "1 calabresa", naoPodeCalar: true },
    { diz: "Rua do Cajueiro 50, Centro", naoPodeCalar: true },
    { diz: "dinheiro", naoPodeCalar: true },
    { diz: "troco pra 60", naoPodeCalar: true },
    { diz: "sim", esperar: /anotado|preparar/i, naoPode: /chave pix/i, naoPodeCalar: true },
  ]);

  await ensaiar("Diz NÃO — não pode criar, e tem que chamar o dono", "ensaio-nao@lid", [
    { diz: "1 calabresa", naoPodeCalar: true },
    { diz: "Rua do Cajueiro 50, Centro", naoPodeCalar: true },
    { diz: "cartão", naoPodeCalar: true },
    { diz: "não, tá errado", chamaODono: true },
  ]);

  // Pedido mínimo é R$ 15. Uma coca sozinha dá R$ 11,99.
  await ensaiar("Abaixo do mínimo", "ensaio-minimo@lid", [
    { diz: "1 coca 1 litro zero", naoPodeCalar: true },
    { diz: "Rua do Cajueiro 50, Centro", naoPodeCalar: true },
    { diz: "dinheiro", naoPodeCalar: true },
    { diz: "não precisa de troco", esperar: /mínimo|minimo|faltam/i, naoPodeCalar: true },
  ]);

  // ──────────────────────────────────────────────
  // AS REGRAS DE HORÁRIO QUE O DONO DITOU
  // Estado vindo da lógica real de loja.js, só com o relógio mudado.
  // ──────────────────────────────────────────────

  // "em dias que eu não abro, pode mandar só a mensagem que abrimos
  //  apenas de quarta a domingo, mande a opção de agendar somente em
  //  dias que eu abro"
  await ensaiar(
    "Terça (não abre) — horário, SEM agendar",
    "ensaio-terca@lid",
    [{ diz: "boa noite", esperar: /quarta|domingo/i, naoPode: /agendar|agende|programar/i, naoPodeCalar: true }],
    await lojaEm("tuesday", "19:00"),
  );

  // "caso uma pessoa peça antes de 18:30 em dias que eu abro, aí vc
  //  avisa sobre o entregador"
  await ensaiar(
    "Sexta 16h (abre hoje, ainda não) — pode agendar",
    "ensaio-antes@lid",
    [{ diz: "boa noite", esperar: /18:30|hoje/i, naoPodeCalar: true }],
    await lojaEm("friday", "16:00"),
  );

  // "dps das 23 n ofereça agendar, diga apenas que já encerramos ou
  //  mande nosso horario padrão de funcionamento"
  await ensaiar(
    "Sexta 23:40 (já encerrou) — SEM agendar",
    "ensaio-depois@lid",
    [{ diz: "ainda tem?", naoPode: /agendar|agende|programar/i, naoPodeCalar: true }],
    await lojaEm("friday", "23:40"),
  );

  // Preço com a loja fechada: quem pergunta de tarde pede de noite.
  await ensaiar(
    "Sexta 15h — pergunta preço: responde preço E avisa",
    "ensaio-preco@lid",
    [{ diz: "quanto é o combo do duplo smash?", esperar: /40,99|R\$/i, naoPodeCalar: true }],
    await lojaEm("friday", "15:00"),
  );

  // ──────────────────────────────────────────────
  // LOJA PAUSADA E ITEM ESGOTADO
  // O dono esconde item por item; massa acabou derruba todas as pizzas.
  // ──────────────────────────────────────────────

  await ensaiar(
    "Pausada (produção cheia) — não toma pedido",
    "ensaio-pausada@lid",
    [{ diz: "quero 1 smash", naoPodeCalar: true }],
    await lojaEm("friday", "20:00", { pausada: true }),
  );

  // A lista de alternativas NÃO pode conter o que acabou — nem o próprio
  // item, nem outro que também está escondido.
  await ensaiar(
    "Calabresa esgotada — avisa e oferece só o que tem",
    "ensaio-esgotado@lid",
    [{
      diz: "1 calabresa",
      esperar: /acabou|esgot|hoje/i,
      naoPode: /tem:[^\n]*Calabrese/i,
      naoPodeCalar: true,
    }],
    await lojaEm("friday", "20:00", { fora: ["Calabrese"] }),
  );

  await ensaiar(
    "Duas pizzas fora — não oferece nenhuma das duas",
    "ensaio-esgotado2@lid",
    [{
      diz: "1 calabresa",
      // "Pepperoni al miele" é OUTRO item e continua disponível — a
      // borda de palavra evita acusar o código por acerto dele.
      naoPode: /tem:[^\n]*(\bCalabrese\b|\bPepperoni\b(?!\s+al))/i,
      naoPodeCalar: true,
    }],
    await lojaEm("friday", "20:00", { fora: ["Calabrese", "Pepperoni"] }),
  );

  await ensaiar(
    "Massa acabou — todas as pizzas fora",
    "ensaio-massa@lid",
    [{ diz: "1 calabresa", naoPodeCalar: true }],
    await lojaEm("friday", "20:00", { fora: ["Calabrese", "Margherita", "Pepperoni"], massaAcabou: true }),
  );

  // ──────────────────────────────────────────────
  // O QUE O BOT NÃO PODE RESPONDER SOZINHO
  // ──────────────────────────────────────────────

  // "cadê meu pedido?" depende do OlaClick, não do bot.
  await ensaiar("Pergunta de pedido já feito — chama o dono", "ensaio-cade@lid", [
    { diz: "cadê meu pedido BR-1234567890?", chamaODono: true },
  ]);

  // Meio a meio: existe "Pizza Metade/Metade" no cardápio, mas qual
  // metade com qual o bot não sabe montar. Tem que perguntar ou chamar,
  // nunca mandar uma pizza inteira errada para a chapa.
  await ensaiar("Pizza meio a meio — não pode chutar uma inteira", "ensaio-meia@lid", [
    { diz: "quero uma pizza meia calabresa meia frango", naoPode: /^1x Calabrese\n\*R\$ 49,00\*/ },
  ]);

  // ──────────────────────────────────────────────
  // AS CONVERSAS REAIS DAS NOITES DE 06 E 07/11/2026
  //
  // Copiadas do diário, palavra por palavra, incluindo o "e" a mais em
  // "Boa noitee". O dono leu essas noites e resumiu: "o bot tá horrível,
  // não consegue responder coisas simples". Estava certo.
  // ──────────────────────────────────────────────

  // A pior delas: pergunta sobre cardápio virava pedido e travava.
  await ensaiar(
    "Priscila, 07/11 23:34 — pergunta de pizza NÃO é pedido",
    "ensaio-priscila@lid",
    [
      {
        diz: "Boa noite \nQuais as opções de pizza ?",
        esperar: /cardapio|cardápio|pizza/i,
        naoPode: /qual desses|Metade\/Metade/i,
        naoPodeCalar: true,
      },
      // Antes, este "Sim" caía em TRAVOU e chamava o dono.
      { diz: "Sim", naoPode: /qual desses/i },
    ],
    await lojaEm("saturday", "20:34"),
  );

  // Com a massa acabada, a mensagem de esgotado tem que ganhar — essa o
  // dono viu funcionando e aprovou. Não pode virar "temos pizza sim".
  await ensaiar(
    "Pergunta de pizza com a massa acabada — avisa que acabou",
    "ensaio-pizza-fora@lid",
    [{ diz: "Ta fazendo pizza hoje?", esperar: /acabaram|massa/i, naoPode: /Temos pizza sim|Fazemos pizza sim/i, naoPodeCalar: true }],
    await lojaEm("saturday", "20:00", { fora: ["Calabrese", "Margherita"], massaAcabou: true }),
  );

  // Quatro pessoas pediram o cardápio e o bot não respondeu nenhuma.
  for (const frase of ["me envia o cardápio", "Cardápio", "Qual cardápio?", "Manda o cardápio por favor"]) {
    await ensaiar(
      `Cardápio: "${frase}"`,
      `ensaio-cardapio-${frase.length}@lid`,
      [{ diz: frase, esperar: /ola\.click|cardápio/i, naoPodeCalar: true }],
      await lojaEm("saturday", "20:00"),
    );
  }

  // Saudações que a regex antiga não aceitava.
  for (const frase of ["Boa noitee", "Boa noite meu patrão", "boa noite", "Oiii", "opa"]) {
    await ensaiar(
      `Saudação: "${frase}"`,
      `ensaio-saud-${frase.length}@lid`,
      [{ diz: frase, esperar: /bem-vindo|cardápio|ola\.click/i, naoPodeCalar: true }],
      await lojaEm("saturday", "20:00"),
    );
  }

  await ensaiar(
    "Agradecimento no fim da conversa",
    "ensaio-obrigada@lid",
    [{ diz: "Obrigada", naoPodeCalar: true }],
    await lojaEm("saturday", "20:00"),
  );

  // Elogio virava pedido: "Deliciosa batata viu" → "qual desses?
  // Batata Frita Pequena / Média".
  await ensaiar(
    "Elogio não é pedido",
    "ensaio-elogio@lid",
    [{ diz: "Deliciosa batata viu", naoPode: /qual desses/i, naoPodeCalar: true }],
    await lojaEm("saturday", "20:00"),
  );

  // Perguntas de Pix: a chave responde todas, e ela já estava aqui.
  for (const frase of ["Vai ser pix viu", "O pix", "Tu tem uma chave Pix de CPF ou celular ?", "O nome do pix é vitória régia?"]) {
    await ensaiar(
      `Pix: "${frase}"`,
      `ensaio-pix-${frase.length}@lid`,
      [{ diz: frase, esperar: /chave pix/i, naoPodeCalar: true }],
      await lojaEm("saturday", "20:00"),
    );
  }

  // Com a loja ABERTA isto devolvia undefined e o bot calava — justamente
  // quando a resposta era "sim, pode pedir".
  for (const frase of ["Ainda faz entrega ?", "Ainda consigo fazer pedido?", "vocês estão recebendo pedido?"]) {
    await ensaiar(
      `Loja aberta: "${frase}"`,
      `ensaio-aberto-${frase.length}@lid`,
      [{ diz: frase, esperar: /abertos|ola\.click/i, naoPodeCalar: true }],
      await lojaEm("saturday", "20:00"),
    );
  }

  // O que NÃO é do bot continua não sendo. Pastel não existe no cardápio
  // e o bot respondia "Simple Bruthus - Combo — R$ 38,99. Qual coca?".
  await ensaiar(
    "Item que a loja não vende — chama o dono",
    "ensaio-pastel@lid",
    [{ diz: "Tem pastel de carne de sol? Qto?", chamaODono: true }],
    await lojaEm("saturday", "20:00"),
  );

  // O pedido reenviado pelo botão do OlaClick: 26 nas duas noites, todos
  // sem resposta porque a forma de pagamento era buscada na API, onde
  // ainda não existe. Texto real, encurtado.
  const PEDIDO_BOTAO = (pagamento) => `👋 Venho de https://bruthusburger.com?utm_source=bot
BR-7110269696
🗓️ 06/11/2026 ⏰ 19:05

*Tipo de serviço: Delivery*

Nome: Francisco Benício Sousa Abreu
Telefone: 55 85992086828
Endereço: Centro, Avenida doutor Aramis Paiva  #201

*📝 Produtos*
*X1 Duplo Smash Bruthus  R$ 26,99*

Subtotal: R$ 26,99
Delivery: R$ 2,00
*Total: R$ 28,99*

*💲 Pagamento*
Estado do pagamento: Não pago
*Total a pagar: R$ 28,99*
${pagamento}

👆 Por favor, envie-nos esta mensagem agora.`;

  await ensaiar(
    "Pedido pelo botão, PIX — tem que mandar a chave",
    "ensaio-botao-pix@lid",
    [{ diz: PEDIDO_BOTAO("PIX 28.99\nPor favor, enviar o comprovante via whatsapp"), esperar: /chave pix|comprovante/i, naoPodeCalar: true }],
    await lojaEm("saturday", "20:00"),
  );

  await ensaiar(
    "Pedido pelo botão, Cartão — agradece, sem chave",
    "ensaio-botao-card@lid",
    [{ diz: PEDIDO_BOTAO("Cartão 28.99"), naoPode: /chave pix/i, naoPodeCalar: true }],
    await lojaEm("saturday", "20:00"),
  );

  await ensaiar(
    "Pedido pelo botão, Dinheiro — agradece, sem chave",
    "ensaio-botao-cash@lid",
    [{ diz: PEDIDO_BOTAO("Dinheiro 28.99"), naoPode: /chave pix/i, naoPodeCalar: true }],
    await lojaEm("saturday", "20:00"),
  );

  // ── O interruptor da IA (/semia e /comia no Telegram) ──
  // O que importa não é o Telegram responder bonito: é o estado
  // SOBREVIVER a um restart do container. Pausar às 19h e a IA voltar
  // sozinha às 21h porque o Docker reiniciou seria pior que não ter
  // interruptor nenhum — o dono acharia que está pausada.
  //
  // Este ensaio mexe em USAR_IA de propósito: a suíte inteira roda com
  // USAR_IA=0, e com ele ligado NADA deve religar a IA. A hierarquia é
  // o ponto, não um detalhe.
  {
    const antesEnv = process.env.USAR_IA;
    const recarregar = () => {
      delete require.cache[require.resolve("./modoIA")];
      return require("./modoIA");
    };
    const casos = [
      ["USAR_IA=0 manda, e o Telegram não religa", () => {
        process.env.USAR_IA = "0";
        return recarregar().definir(true, "ensaio").ia === false;
      }],
      ["com a IA permitida, o padrão é ligada", () => {
        process.env.USAR_IA = "1";
        return recarregar().estado().ia === true;
      }],
      ["/semia pausa", () => recarregar().definir(false, "ensaio").ia === false],
      ["segue pausada depois de reler do disco (restart)", () => recarregar().ligada() === false],
      ["/comia religa", () => recarregar().definir(true, "ensaio").ia === true],
    ];
    for (const [nome, prova] of casos) {
      let ok = false;
      try { ok = prova(); } catch { ok = false; }
      console.log(`${ok ? "ok   " : "FALHA"} interruptor da IA: ${nome}`);
      if (!ok) falhas++;
    }
    process.env.USAR_IA = antesEnv;
    recarregar();
  }

  await conferirHorario();
  console.log(`\npedidos criados no ensaio (nenhum foi para o OlaClick): ${pedidosCriados.length}`);
  console.log(falhas ? `\n${falhas} FALHA(S) — não suba assim.` : "\nTodos os ensaios passaram.");
  process.exit(falhas ? 1 : 0);
})();
