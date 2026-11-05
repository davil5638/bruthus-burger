// ──────────────────────────────────────────────
// loja.js — a loja está aberta, pausada ou fechada? o que acabou?
//
// POR QUE ISTO EXISTE:
// O dono repete essas duas respostas dezenas de vezes por noite. Quando
// pausa por alta demanda, o pessoal continua chegando pelo WhatsApp com
// print e mensagem, e ele tem que avisar um por um. Quando acaba a massa
// de pizza, idem. É o atendimento mais repetitivo que ele faz, e o que
// mais dá para automatizar sem risco nenhum: é informação, não venda.
//
// COMO O DONO SINALIZA CADA COISA (e NÃO é como eu supus primeiro):
//   item acabou      → marca INVISÍVEL  (visible:false). Não usa "esgotado".
//   massa acabou     → TODAS as pizzas invisíveis de uma vez.
//   alta demanda     → botão de pausar, por um tempo que ele escolhe.
//
// A ARMADILHA:
// `currently_open` vem falso nos DOIS casos — fora do horário e pausado.
// Responder "estamos fechados" para quem chegou numa sexta às 20h, só
// porque a produção está cheia, perde a venda de quem esperaria. Quem
// separa os dois é o relógio contra o horário cadastrado.
// ──────────────────────────────────────────────

// O dotenv TEM que vir antes do require abaixo: olaclickApi lê o token no
// carregamento do módulo. Carregar depois dá "token não configurado" com o
// .env ali do lado, preenchido. Já custou tempo nesta base mais de uma vez.
if (require.main === module) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const olaclick = require("./olaclickApi");

const TZ = "America/Fortaleza";
const DIAS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Hora local da loja como "HH:MM", independente de onde o servidor roda.
// O Render fica em UTC; sem isto, às 21h de Fortaleza o código acharia
// que já é meia-noite e diria que a loja fechou com ela cheia.
function agoraEm(tz = TZ) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const diaIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { hhmm: `${p.hour}:${p.minute}`, dia: DIAS[diaIdx] };
}

// "18:30" <= agora < "23:00". Comparação de texto funciona em HH:MM com
// zero à esquerda, e evita fuso de novo no meio do caminho.
function dentroDaFaixa(hhmm, faixas = []) {
  return faixas.some((f) => f.open && f.close && hhmm >= f.open && hhmm < f.close);
}

/**
 * Estado da loja agora.
 *
 * situacao:
 *   "aberta"   — atende normalmente
 *   "pausada"  — dentro do horário, mas o dono pausou (alta demanda)
 *   "fechada"  — fora do horário cadastrado
 */
async function estado() {
  const empresa = await olaclick.buscarEmpresa();
  const { hhmm, dia } = agoraEm();
  const hoje = empresa?.business_hours?.[dia] || {};
  const deveriaEstarAberta = Boolean(hoje.is_active) && dentroDaFaixa(hhmm, hoje.hours);
  const aberta = empresa?.currently_open === true;

  let situacao;
  if (aberta) situacao = "aberta";
  else if (deveriaEstarAberta) situacao = "pausada";
  else situacao = "fechada";

  return {
    situacao,
    agora: hhmm,
    dia,
    horarioDeHoje: hoje.is_active ? hoje.hours : [],
    // "de quarta a domingo, das 18:30 às 23:00" — derivado, nunca escrito
    // à mão, para não envelhecer quando o dono mexer nos dias.
    funcionamento: diasDeFuncionamento(empresa),
    // Hoje a loja abre, mas ainda não abriu. Muda a resposta: em vez de
    // "voltamos quarta", é "abrimos hoje às 18:30, já pode agendar".
    abreHojeMaisTarde: Boolean(hoje.is_active) && !deveriaEstarAberta
      && (hoje.hours || []).some((f) => hhmm < f.open),
    proximaAbertura: situacao === "fechada" ? proximaAbertura(empresa, dia, hhmm) : null,
  };
}

const PT_DIA = {
  sunday: "domingo", monday: "segunda", tuesday: "terça", wednesday: "quarta",
  thursday: "quinta", friday: "sexta", saturday: "sábado",
};

// "de quarta a domingo, das 18:30 às 23:00", montado do horário cadastrado.
//
// NÃO escrito à mão de propósito. A mensagem da OlaClick diz "quinta a
// domingo" em texto fixo e vai ficar errada no dia que a quarta entrar —
// é esse o erro que isto evita. Mudou no painel, muda aqui sozinho.
function diasDeFuncionamento(empresa) {
  // Semana começando na segunda, que é como se fala "de quarta a domingo".
  const ordem = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const ativos = ordem.filter((d) => {
    const x = empresa?.business_hours?.[d];
    return x?.is_active && x.hours?.length;
  });
  if (!ativos.length) return null;

  // Contíguos viram faixa ("de quarta a domingo"); soltos viram lista.
  const indices = ativos.map((d) => ordem.indexOf(d));
  const contiguo = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  const dias = ativos.length === 1
    ? PT_DIA[ativos[0]]
    : contiguo
      ? `de ${PT_DIA[ativos[0]]} a ${PT_DIA[ativos[ativos.length - 1]]}`
      : ativos.map((d) => PT_DIA[d]).join(", ");

  // O horário costuma ser o mesmo em todos os dias; se não for, mostra o
  // do primeiro em vez de inventar uma faixa que não existe.
  const h = empresa.business_hours[ativos[0]].hours[0];
  return { dias, abre: h.open, fecha: h.close, texto: `${dias}, das ${h.open} às ${h.close}` };
}

// Quando abre de novo, para a mensagem de fora de horário poder dizer
// "abrimos quinta às 18:30" em vez de um genérico "estamos fechados".
function proximaAbertura(empresa, diaAtual, hhmm) {
  const PT = PT_DIA;
  const base = DIAS.indexOf(diaAtual);
  for (let i = 0; i < 8; i++) {
    const dia = DIAS[(base + i) % 7];
    const d = empresa?.business_hours?.[dia];
    if (!d?.is_active || !d.hours?.length) continue;
    const abre = d.hours[0].open;
    if (i === 0 && hhmm >= abre) continue;   // hoje já passou da abertura
    return { dia: PT[dia], hora: abre, hoje: i === 0 };
  }
  return null;
}

/**
 * O que está fora do ar agora. O dono esconde item por item, então dá
 * para dizer o nome ao cliente em vez de um "não temos" seco.
 */
async function indisponiveis() {
  const produtos = await olaclick.listarProdutos();
  const fora = produtos.filter((p) => p.visible === false);

  // Pizza tem categoria própria. Se TODAS sumiram de uma vez, foi a massa
  // que acabou — e aí nem adianta oferecer outro sabor.
  const ehPizza = (p) => /pizza|margherita|calabres|pepperoni|manzo|frango crema|diavola/i.test(p.name);
  const pizzas = produtos.filter(ehPizza);
  const pizzasFora = pizzas.filter((p) => p.visible === false);
  const massaAcabou = pizzas.length > 0 && pizzasFora.length === pizzas.length;

  return {
    nomes: fora.map((p) => p.name),
    total: fora.length,
    massaAcabou,
    pizzasFora: pizzasFora.map((p) => p.name),
    totalProdutos: produtos.length,
  };
}

// ──────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const e = await estado();
    console.log("SITUAÇÃO:", e.situacao.toUpperCase(), `(${e.dia} ${e.agora})`);
    if (e.horarioDeHoje.length) console.log("  horário de hoje:", e.horarioDeHoje.map((h) => `${h.open}-${h.close}`).join(", "));
    else console.log("  hoje não abre");
    if (e.proximaAbertura) console.log("  próxima abertura:", e.proximaAbertura.dia, "às", e.proximaAbertura.hora);

    const i = await indisponiveis();
    console.log(`\nINDISPONÍVEIS: ${i.total} de ${i.totalProdutos} produtos`);
    if (i.massaAcabou) console.log("  ⚠️  TODAS as pizzas fora — a massa acabou");
    i.nomes.slice(0, 15).forEach((n) => console.log("  -", n));
    process.exit(0);
  })().catch((e) => { console.error("❌", e.message); process.exit(1); });
}

module.exports = { estado, indisponiveis, agoraEm, dentroDaFaixa, diasDeFuncionamento };
