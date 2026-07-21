/* ============================================================================
 * Servidor do painel interno mínimo (Sprint 2, Fase 11).
 * ----------------------------------------------------------------------------
 * Standalone, zero dependências, NUNCA conectado à interface pública do
 * Copiloto (porta e processo próprios). Só sobe se `CONFERENCE_OPERATOR_PANEL_V1`
 * estiver ligada — em produção, isso nunca acontece por padrão (flags.js).
 *
 * Existe para registrar os eventos do relógio que o iFood não fornece
 * (início/pausa/retomada/finalização/liberação da Conferência) — nunca para
 * mostrar dado de cliente, nunca para ranquear ninguém.
 *
 * Uso: CONFERENCE_OPERATOR_PANEL_V1=1 NODE_ENV=development node tools/conference-brain/operator-panel-server.js
 *      (porta: PANEL_PORT, padrão 5183)
 * ==========================================================================*/
"use strict";

const http = require("http");
const path = require("path");
const DIR = path.join(__dirname, "..", "..");

const flags = require(path.join(DIR, "src", "conference-brain", "flags.js"));
const { createStore } = require(path.join(DIR, "src", "conference-brain", "storage", "store.js"));
const { panelRow, applyAction } = require(path.join(DIR, "src", "conference-brain", "live", "operator-panel.js"));
const { CLOCK_EVENT_TYPES } = require(path.join(DIR, "src", "conference-brain", "contracts", "live-states.js"));

const PORT = parseInt(process.env.PANEL_PORT || "5183", 10);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function ordersInPlay(store) {
  const byOrder = new Map();
  for (const ev of store.all("conference_clock_events")) {
    if (!byOrder.has(ev.order_id)) byOrder.set(ev.order_id, []);
    byOrder.get(ev.order_id).push(ev);
  }
  const rows = [];
  for (const [orderId, events] of byOrder) {
    events.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const last = events[events.length - 1];
    if (last.event_type === CLOCK_EVENT_TYPES.DEPARTED_OBSERVED ||
        last.event_type === CLOCK_EVENT_TYPES.CANCELLED) continue; // ciclo encerrado, some do painel
    rows.push(Object.assign(panelRow({ external_id: orderId, clock_events: events }), { order_id: orderId }));
  }
  return rows.sort((a, b) => (b.minutes_since_ready || 0) - (a.minutes_since_ready || 0));
}

function renderPage(rows) {
  const items = rows.map((r) => `
    <tr>
      <td>${esc(r.short_id)}</td>
      <td>${r.minutes_since_ready == null ? "—" : r.minutes_since_ready + " min"}</td>
      <td>${esc(r.state)}</td>
      <td>${esc(r.source_health)}</td>
      <td>
        ${r.actions.map((a) => `
          <form method="post" action="/action" style="display:inline">
            <input type="hidden" name="order_id" value="${esc(r.order_id)}">
            <input type="hidden" name="action" value="${esc(a.key)}">
            ${a.irreversible ? '<input type="hidden" name="confirm" value="1">' : ""}
            <button type="submit"${a.irreversible ? ' onclick="return confirm(\'Confirmar ' + esc(a.label) + '?\')"' : ""}>${esc(a.label)}</button>
          </form>`).join(" ")}
      </td>
    </tr>`).join("\n");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Painel interno — Conferência (Sprint 2, sombra)</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;background:#111;color:#eee}
  table{border-collapse:collapse;width:100%} td,th{padding:8px 12px;border-bottom:1px solid #333;text-align:left}
  button{background:#222;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 10px;cursor:pointer}
  button:hover{background:#333}
  .aviso{color:#f5a623;margin-bottom:16px}
</style></head><body>
<h1>Painel interno da Conferência</h1>
<p class="aviso">Ferramenta interna, atrás de feature flag. Não é a interface do Copiloto. Sem identificação de funcionário, sem ranking.</p>
<table>
<tr><th>Pedido</th><th>Desde o pronto</th><th>Estado</th><th>Saúde da fonte</th><th>Ações</th></tr>
${items || '<tr><td colspan="5">Nenhum pedido em Conferência agora.</td></tr>'}
</table>
</body></html>`;
}

function createServer(store) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        const html = renderPage(ordersInPlay(store));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (req.method === "POST" && req.url === "/action") {
        const body = await readBody(req);
        const params = new URLSearchParams(body);
        const orderId = params.get("order_id");
        const action = params.get("action");
        const confirm = params.get("confirm") === "1";
        const events = store.all("conference_clock_events")
          .filter((e) => e.order_id === orderId)
          .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        const result = applyAction(action, {
          order_id: orderId, existing_events: events, confirmToken: confirm || null
        });
        if (result.ok) store.put("conference_clock_events", result.event);
        res.writeHead(302, { Location: "/" });
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("nao encontrado");
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("erro interno: " + String((e && e.message) || e));
    }
  });
}

function main() {
  if (!flags.conferenceOperatorPanelV1()) {
    console.log("CONFERENCE_OPERATOR_PANEL_V1 desligada — painel nao sobe. " +
      "Defina CONFERENCE_OPERATOR_PANEL_V1=1 (e NODE_ENV=development ou test) para ligar.");
    process.exitCode = 1;
    return;
  }
  const store = createStore();
  const server = createServer(store);
  server.listen(PORT, () => {
    console.log(`Painel interno da Conferencia em http://localhost:${PORT}/ (Sprint 2, sombra, uso interno)`);
  });
}

if (require.main === module) main();

module.exports = { createServer, ordersInPlay, renderPage };
