const axios = require("axios");
const { calcularResumoCustom } = require("./financeiro");

const PHONE  = process.env.WHATSAPP_PHONE;
const APIKEY = process.env.CALLMEBOT_APIKEY;

// ──────────────────────────────────────────────
// Busca resumo de Ads da semana passada
// ──────────────────────────────────────────────
async function buscarResumoAds() {
  try {
    const { gerarRelatorioCompleto } = require("./createAds");
    const campanhas = await gerarRelatorioCompleto(7);
    const comDados = campanhas.filter(c => !c.erro && c.impressoes > 0);

    if (comDados.length === 0) return null;

    const totalGasto = comDados.reduce((s, c) => s + c.gasto, 0);
    const totalCliques = comDados.reduce((s, c) => s + c.linkCliques, 0);
    const ctrMedio = comDados.reduce((s, c) => s + c.ctr, 0) / comDados.length;
    const cpcMedio = comDados.reduce((s, c) => s + c.cpc, 0) / comDados.length;
    const ativas = campanhas.filter(c => c.status === "ACTIVE").length;

    // Alertas
    const alertas = [];
    for (const c of comDados) {
      if (c.status === "ACTIVE" && c.ctr < 1)      alertas.push(`⚠️ CTR baixo: ${c.nome.slice(0,20)}`);
      if (c.status === "ACTIVE" && c.cpc > 3)       alertas.push(`⚠️ CPC alto: ${c.nome.slice(0,20)}`);
      if (c.status === "ACTIVE" && c.frequencia > 3) alertas.push(`⚠️ Público saturado: ${c.nome.slice(0,20)}`);
    }

    return { totalGasto, totalCliques, ctrMedio, cpcMedio, ativas, total: campanhas.length, alertas };
  } catch (e) {
    console.warn("⚠️ Não foi possível buscar dados de Ads:", e.message);
    return null;
  }
}

// ──────────────────────────────────────────────
// Retorna o range Ter→Seg da semana PASSADA
// ──────────────────────────────────────────────
function getRangoSemanaPassada() {
  const hoje = new Date();
  const dia  = hoje.getDay(); // 0=Dom,1=Seg,2=Ter...
  const diasDesdeTerca = (dia + 5) % 7;

  // Terça desta semana
  const tercaAtual = new Date(hoje);
  tercaAtual.setDate(hoje.getDate() - diasDesdeTerca);

  // Terça da semana passada
  const tercaAnt = new Date(tercaAtual);
  tercaAnt.setDate(tercaAtual.getDate() - 7);

  // Segunda da semana passada (fim do ciclo)
  const segAnt = new Date(tercaAtual);
  segAnt.setDate(tercaAtual.getDate() - 1);

  return {
    dataInicio: tercaAnt.toISOString().slice(0, 10),
    dataFim:    segAnt.toISOString().slice(0, 10),
  };
}

function fmtBR(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function fmtData(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ──────────────────────────────────────────────
// Gera o texto do resumo semanal
// ──────────────────────────────────────────────
async function gerarTextoResumo() {
  const { dataInicio, dataFim } = getRangoSemanaPassada();
  const [resumo, ads] = await Promise.all([
    calcularResumoCustom(dataInicio, dataFim),
    buscarResumoAds(),
  ]);

  const emoji  = resumo.lucro >= 0 ? "✅" : "⚠️";
  const periodo = `${fmtData(dataInicio)} → ${fmtData(dataFim)}`;

  let txt = `🍔 *Bruthus Burger — Resumo Semanal*\n`;
  txt += `📅 ${periodo}\n\n`;
  txt += `📈 Faturamento: *${fmtBR(resumo.faturamento)}*\n`;
  txt += `📉 Gastos:      *${fmtBR(resumo.gastos)}*\n`;
  txt += `${emoji} Lucro:     *${fmtBR(resumo.lucro)}*\n`;
  txt += `📊 Margem:      *${resumo.margem}%*\n`;

  if (resumo.topDespesas?.length > 0) {
    txt += `\n🔍 *Maiores gastos:*\n`;
    resumo.topDespesas.slice(0, 3).forEach((d, i) => {
      txt += `  ${i + 1}. ${d.categoria}: ${fmtBR(d.valor)}\n`;
    });
  }

  if (resumo.totalEntradas === 0) {
    txt += `\n⚠️ Nenhum lançamento encontrado para essa semana.`;
  }

  // Seção de Ads (se houver dados)
  if (ads) {
    txt += `\n\n📣 *Meta Ads — últimos 7 dias*\n`;
    txt += `💰 Investido:  *${fmtBR(ads.totalGasto)}*\n`;
    txt += `🖱️ Cliques:    *${ads.totalCliques}*\n`;
    txt += `📈 CTR médio:  *${ads.ctrMedio.toFixed(2)}%* ${ads.ctrMedio >= 1.5 ? "✅" : "⚠️"}\n`;
    txt += `💸 CPC médio:  *${fmtBR(ads.cpcMedio)}* ${ads.cpcMedio <= 1.5 ? "✅" : "⚠️"}\n`;
    txt += `📊 Campanhas:  ${ads.ativas} ativas de ${ads.total}\n`;

    if (ads.alertas.length > 0) {
      txt += `\n🚨 *Alertas:*\n`;
      ads.alertas.forEach(a => { txt += `  ${a}\n`; });
    }
  }

  return { texto: txt, resumo, periodo };
}

// ──────────────────────────────────────────────
// Envia mensagem via CallMeBot
// ──────────────────────────────────────────────
async function enviarWhatsApp(texto) {
  if (!PHONE || !APIKEY) {
    throw new Error("WHATSAPP_PHONE ou CALLMEBOT_APIKEY não configurados no .env");
  }

  const url = `https://api.callmebot.com/whatsapp.php`;
  await axios.get(url, {
    params: {
      phone:  PHONE,
      text:   texto,
      apikey: APIKEY,
    },
  });
}

// ──────────────────────────────────────────────
// Função principal — gera e envia o resumo
// ──────────────────────────────────────────────
async function enviarResumoSemanal() {
  console.log("\n📱 Gerando resumo semanal para WhatsApp...");

  const { texto, resumo, periodo } = await gerarTextoResumo();

  console.log(`📅 Período: ${periodo}`);
  console.log(`📈 Faturamento: ${fmtBR(resumo.faturamento)}`);
  console.log(`💵 Lucro: ${fmtBR(resumo.lucro)}`);

  await enviarWhatsApp(texto);
  console.log("✅ Resumo enviado para o WhatsApp!");

  return { texto, resumo };
}

module.exports = { enviarResumoSemanal, gerarTextoResumo, enviarWhatsApp };
