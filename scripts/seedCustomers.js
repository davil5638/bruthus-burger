const { pool, conectar, upsertCliente, registrarPedido } = require("./dbClientes");
const { recalcularTodos } = require("./customerScoring");

const NOMES = [
  "Ana", "Bruno", "Caio", "Daniela", "Eduardo", "Fernanda", "Gabriel", "Helena",
  "Igor", "Júlia", "Kauã", "Larissa", "Marcos", "Natália", "Otávio", "Patrícia",
  "Quésia", "Rafael", "Sofia", "Thiago", "Ursula", "Vitor", "Wesley", "Yasmin",
  "Zeca", "Amanda", "Beatriz", "Carlos", "Diego", "Elaine", "Felipe", "Gabriela",
  "Hugo", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olivia",
];
const SOBRENOMES = [
  "Silva", "Souza", "Oliveira", "Santos", "Pereira", "Costa", "Lima", "Almeida",
  "Cavalcante", "Rocha", "Barbosa", "Ribeiro", "Carvalho", "Gomes", "Martins",
  "Ferreira", "Araújo", "Nogueira", "Mendes", "Teixeira",
];

function aleatorio(min, max) { return Math.random() * (max - min) + min; }
function inteiro(min, max)   { return Math.floor(aleatorio(min, max + 1)); }
function escolha(arr)        { return arr[Math.floor(Math.random() * arr.length)]; }
function telefoneFake() {
  const ddd = escolha(["85", "85", "11", "21", "31", "61"]); // Fortaleza dominante
  const num = "9" + String(inteiro(10000000, 99999999));
  return ddd + num.slice(0, 8);
}
function nomeFake() { return `${escolha(NOMES)} ${escolha(SOBRENOMES)}`; }

function dataAtras(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

// Perfis sintéticos com distribuição realista
const PERFIS = [
  // VIP: ticket alto, frequente, recente
  { tipo: "vip",       peso: 8,  pedidos: [10, 25], intervalo: [7, 14],  ticket: [55, 95],  recencia: [1, 20],  cupomPct: 0.15, finsSemana: 0.4, noturno: 0.2 },
  // Regular: médio em tudo
  { tipo: "regular",   peso: 22, pedidos: [4, 9],   intervalo: [14, 28], ticket: [35, 60],  recencia: [3, 25],  cupomPct: 0.2,  finsSemana: 0.5, noturno: 0.25 },
  // Em risco: era ativo mas sumiu
  { tipo: "em_risco",  peso: 14, pedidos: [4, 10],  intervalo: [10, 20], ticket: [40, 70],  recencia: [35, 70], cupomPct: 0.25, finsSemana: 0.5, noturno: 0.3 },
  // Perdido: muito tempo sem comprar
  { tipo: "perdido",   peso: 14, pedidos: [3, 8],   intervalo: [15, 30], ticket: [35, 65],  recencia: [95, 180], cupomPct: 0.3, finsSemana: 0.5, noturno: 0.3 },
  // Novo: 1-2 pedidos recentes
  { tipo: "novo",      peso: 12, pedidos: [1, 2],   intervalo: [7, 21],  ticket: [30, 55],  recencia: [2, 25],  cupomPct: 0.1,  finsSemana: 0.5, noturno: 0.3 },
  // Impulsivo: fins de semana / noturno, variação grande
  { tipo: "impulsivo", peso: 10, pedidos: [5, 12],  intervalo: [10, 20], ticket: [25, 95],  recencia: [3, 35],  cupomPct: 0.15, finsSemana: 0.85, noturno: 0.7 },
  // Sensível a desconto: quase tudo com cupom
  { tipo: "sensivel",  peso: 10, pedidos: [4, 10],  intervalo: [12, 25], ticket: [30, 50],  recencia: [5, 40],  cupomPct: 0.75, finsSemana: 0.4, noturno: 0.2 },
  // Sazonal: poucos pedidos espalhados
  { tipo: "regular",   peso: 10, pedidos: [2, 5],   intervalo: [25, 50], ticket: [40, 60],  recencia: [10, 60], cupomPct: 0.2,  finsSemana: 0.4, noturno: 0.2 },
];

function sortearPerfil() {
  const total = PERFIS.reduce((s, p) => s + p.peso, 0);
  let r = Math.random() * total;
  for (const p of PERFIS) { r -= p.peso; if (r <= 0) return p; }
  return PERFIS[0];
}

function gerarTimestampNo(dia, finsSemana, noturno) {
  const d = new Date(dia);
  // Hora: 11h-23h, com bias noturno
  let hora = inteiro(11, 23);
  if (Math.random() < noturno) hora = inteiro(21, 26) % 24;
  d.setHours(hora, inteiro(0, 59), 0, 0);
  return d;
}

const CUPONS = ["VOLTA10", "DESCONTO15", "SAUDADE20", "BEMVINDO10", "FRETE0", "HOJE12"];

async function seedClientes(qtd = 80, { resetar = false } = {}) {
  await conectar();
  if (resetar) {
    console.log("🧹 Limpando tabelas de teste...");
    await pool.query("TRUNCATE campanhas_envios, pedidos, clientes RESTART IDENTITY CASCADE");
  }

  let criados = 0;
  for (let i = 0; i < qtd; i++) {
    const perfil = sortearPerfil();
    const cliente = await upsertCliente({
      telefone: telefoneFake(),
      nome:     nomeFake(),
      email:    null,
    });
    if (!cliente) continue;

    const nPedidos     = inteiro(perfil.pedidos[0], perfil.pedidos[1]);
    const intervaloMed = inteiro(perfil.intervalo[0], perfil.intervalo[1]);
    const recencia     = inteiro(perfil.recencia[0], perfil.recencia[1]);

    // gera datas: do mais antigo até "hoje - recencia"
    const datas = [];
    let cursor = recencia;
    for (let p = 0; p < nPedidos; p++) {
      datas.unshift(cursor); // mais antigo no início
      cursor += Math.max(2, Math.round(intervaloMed * aleatorio(0.6, 1.4)));
    }

    for (const diasAtras of datas) {
      const dt = gerarTimestampNo(dataAtras(diasAtras), perfil.finsSemana, perfil.noturno);
      const valor = +(perfil.ticket[0] + Math.random() * (perfil.ticket[1] - perfil.ticket[0])).toFixed(2);
      const temCupom = Math.random() < perfil.cupomPct;
      await registrarPedido({
        clienteId:  cliente.id,
        externalId: `SEED-${cliente.id}-${diasAtras}`,
        origem:     "seed",
        dataPedido: dt,
        valor,
        cupom:      temCupom ? escolha(CUPONS) : null,
        itens:      [{ nome: "Burger", qtd: 1, valor }],
        payload:    { perfil: perfil.tipo },
      });
    }
    criados++;
  }

  console.log(`🌱 ${criados} clientes fake criados. Recalculando scores...`);
  const stats = await recalcularTodos();
  return { criados, ...stats };
}

if (require.main === module) {
  const qtd = Number(process.argv[2] || 80);
  const resetar = process.argv.includes("--reset");
  seedClientes(qtd, { resetar })
    .then(r => { console.log("✅ Seed concluído:", r); process.exit(0); })
    .catch(e => { console.error("❌ Erro no seed:", e); process.exit(1); });
}

module.exports = { seedClientes };
