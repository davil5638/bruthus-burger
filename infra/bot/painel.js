// ──────────────────────────────────────────────
// painel.js — ver o que o bot está respondendo
//
// POR QUE EXISTE:
// O dono não consegue ler no WhatsApp as mensagens que a Evolution
// envia: no aparelho dele aparece "Aguardando mensagem", o aviso do
// WhatsApp para mensagem que o aparelho não conseguiu descriptografar.
// A mensagem chega no cliente; quem fica sem ver é ele.
//
// Isso é limitação do WhatsApp com vários aparelhos conectados, não do
// nosso código, e pode nem ter conserto no nosso lado. Mas a cegueira
// tem: o bot já grava tudo que recebe e tudo que responde. Esta página
// mostra, por conversa, o que entrou e o que saiu.
//
// Fica atrás de um segredo na URL, como o webhook: são conversas de
// cliente, com nome e endereço.
// ──────────────────────────────────────────────

const fs = require("fs");

function lerDiario(caminho) {
  try {
    return fs.readFileSync(caminho, "utf8").split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// Agrupa por conversa e devolve as mais recentes primeiro — quem está
// falando agora é o que importa numa noite de movimento.
function agrupar(linhas) {
  const conversas = new Map();
  const hooks = [];

  for (const l of linhas) {
    if (l.hook === "olaclick") { hooks.push(l); continue; }
    const id = l.conversa || "?";
    if (!conversas.has(id)) conversas.set(id, { id, nome: null, turnos: [] });
    const c = conversas.get(id);
    if (l.nome) c.nome = l.nome;
    c.turnos.push(l);
  }

  const lista = [...conversas.values()].map((c) => ({
    ...c,
    ultima: c.turnos[c.turnos.length - 1]?.em,
    precisaDeVoce: c.turnos.some((t) => t.decisao === "chama_o_dono" || t.decisao === "travou"),
  }));
  lista.sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));
  return { conversas: lista, hooks: hooks.slice(-40).reverse() };
}

const ESCAPAR = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ESCAPAR[c]);
const hora = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
};

function montarHtml({ conversas, hooks }, estado) {
  const bolhas = (c) => c.turnos.map((t) => {
    const partes = [];
    if (t.texto) {
      partes.push(`<div class="cli"><b>${esc(c.nome || "cliente")}</b> ${esc(t.texto)}<i>${hora(t.em)}</i></div>`);
    }
    const resposta = t.leitura?.mensagem;
    if (t.decisao === "responde" && resposta) {
      const falhou = t.envio && t.envio !== "enviado";
      partes.push(`<div class="bot ${falhou ? "erro" : ""}">${esc(resposta)}<i>${falhou ? "FALHOU: " + esc(t.envio) : "enviado"}</i></div>`);
    } else if (t.decisao === "chama_o_dono") {
      partes.push(`<div class="voce">⚠️ ${esc(t.leitura?.acao || "precisa de você")}<i>não respondeu</i></div>`);
    } else if (t.decisao === "travou") {
      // Pedido rodando em círculo. É o pior caso: cliente esperando com
      // pedido pela metade. Vermelho, não laranja.
      partes.push(`<div class="travou">🛑 ${esc(t.leitura?.acao || "travou no meio do pedido")}<i>pedido em curso — assume você</i></div>`);
    } else if (t.decisao === "calou") {
      partes.push(`<div class="calou">— não repetiu o que já tinha dito —</div>`);
    } else if (t.leitura?.intencao === "dono_assumiu") {
      partes.push(`<div class="calou">— você assumiu, o bot calou —</div>`);
    }
    return partes.join("");
  }).join("");

  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atendente — Bruthus</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--cli:#232832;--bot:#1f3d2b;--voce:#4a2a18;--txt:#e8eaed;--mut:#8b919c;--ok:#4ade80;--err:#f87171}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,-apple-system,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid #262a33;padding:12px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:16px;margin:0;font-weight:600}
.tag{font-size:12px;color:var(--mut)}
.tag b{color:var(--ok)}
main{padding:16px;display:grid;gap:14px;max-width:760px;margin:0 auto}
.conversa{background:var(--card);border-radius:12px;padding:12px;border-left:3px solid transparent}
.conversa.alerta{border-left-color:#f59e0b}
.cab{display:flex;justify-content:space-between;font-size:13px;color:var(--mut);margin-bottom:8px}
.cli,.bot,.voce{padding:8px 10px;border-radius:9px;margin:5px 0;white-space:pre-wrap;word-break:break-word;font-size:14px}
.cli{background:var(--cli)}
.bot{background:var(--bot);margin-left:22px}
.bot.erro{background:#4a1d1d}
.voce{background:var(--voce);margin-left:22px}
.travou{background:#4a1d1d;border:1px solid var(--err);padding:8px 10px;border-radius:9px;margin:5px 0 5px 22px;font-size:14px;white-space:pre-wrap}
.travou i{color:var(--err)}
.calou{color:var(--mut);font-size:12px;font-style:italic;margin:4px 0 4px 22px}
i{display:block;font-size:11px;color:var(--mut);font-style:normal;margin-top:4px}
.bot.erro i{color:var(--err)}
.vazio{color:var(--mut);text-align:center;padding:40px}
.hooks{background:var(--card);border-radius:12px;padding:12px;font-size:13px}
.hooks div{color:var(--mut);padding:2px 0}
</style>
<header>
  <h1>🍔 Atendente</h1>
  <span class="tag">loja <b>${esc(estado?.situacao || "?")}</b></span>
  <span class="tag">${conversas.length} conversa(s)</span>
  <span class="tag">atualiza sozinho a cada 15s</span>
</header>
<main>
${conversas.length ? conversas.map((c) => `
  <section class="conversa ${c.precisaDeVoce ? "alerta" : ""}">
    <div class="cab"><span>${esc(c.nome || "sem nome")}</span><span>${hora(c.ultima)}</span></div>
    ${bolhas(c)}
  </section>`).join("") : '<div class="vazio">Nenhuma conversa ainda hoje.</div>'}
${hooks.length ? `<section class="hooks"><b>Status de pedido enviados</b>
  ${hooks.map((h) => `<div>${hora(h.em)} — ${esc(h.pedido || "?")} · ${esc(h.etapa || h.leitura?.intencao)} · ${esc(h.envio || "-")}</div>`).join("")}
</section>` : ""}
</main>
<script>setTimeout(()=>location.reload(),15000)</script>
</html>`;
}

module.exports = { lerDiario, agrupar, montarHtml };
