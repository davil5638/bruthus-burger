// ──────────────────────────────────────────────
// modoIA.js — o interruptor da IA, ligável de fora sem deploy.
//
// POR QUE EM ARQUIVO, E NÃO EM MEMÓRIA:
// O dono desliga a IA às 19h porque ela aprontou. Se o container
// reiniciar às 21h — e ele reinicia, `restart: unless-stopped` —, uma
// flag em memória voltaria ligada sozinha, no meio da noite, sem ninguém
// pedir. O arquivo mora em /dados, que é volume Docker: sobrevive a
// restart, a `docker compose up -d` e a troca de imagem.
//
// HIERARQUIA, DE PROPÓSITO:
// USAR_IA=0 no compose é desligamento DURO e ganha de tudo. O comando do
// Telegram não religa o que foi desligado no compose — senão um comando
// poderia desfazer uma decisão tomada um nível acima dele.
// ──────────────────────────────────────────────

const fs = require("fs");

// `USAR_IA=0` é a trava de cima. Lido uma vez: mudar isso é deploy.
const PERMITIDA = process.env.USAR_IA !== "0";
const ARQUIVO = process.env.MODO_ARQUIVO || "/dados/modo.json";

// Cache em memória para não ler disco a cada mensagem de cliente. É um
// processo só; quem escreve é este mesmo arquivo.
let memoria = null;

function ler() {
  if (memoria) return memoria;
  try {
    const d = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    memoria = { ia: d.ia !== false, em: d.em || null, por: d.por || null };
  } catch {
    // Arquivo inexistente ou corrompido: o padrão é a IA LIGADA, que é o
    // estado normal. Um JSON quebrado não deve pausar o atendimento.
    memoria = { ia: true, em: null, por: null };
  }
  return memoria;
}

function estado() {
  const m = ler();
  return {
    ia: PERMITIDA && m.ia,
    permitida: PERMITIDA,
    pedidoPor: m.por,
    desde: m.em,
  };
}

function ligada() {
  return estado().ia;
}

// Devolve o estado novo já calculado, para quem chamou poder responder ao
// dono exatamente o que valeu — e não o que foi pedido.
function definir(ia, por) {
  memoria = { ia: Boolean(ia), em: new Date().toISOString(), por: por || "desconhecido" };
  try {
    fs.writeFileSync(ARQUIVO, JSON.stringify(memoria));
  } catch (e) {
    // Não dá para fingir que gravou. Se o disco recusou, o pedido vale
    // para esta execução, mas o dono precisa saber que um restart
    // desfaz — senão ele vai dormir achando que a IA está pausada.
    return { ...estado(), avisoDeDisco: e.message };
  }
  return estado();
}

module.exports = { ligada, estado, definir, ARQUIVO };
