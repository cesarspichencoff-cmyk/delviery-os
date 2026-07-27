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
const { reconcileMultidimensional } = require(path.join(DIR, "src", "conference-brain", "live", "reconciliation.js"));

const PORT = parseInt(process.env.PANEL_PORT || "5183", 10);

/**
 * Bind local por padrao (Sprint 2.2, Fase 2 — bloqueador 2 da rechecagem).
 * `server.listen(PORT)` sem host explicito abre em `::` (curinga IPv6,
 * aceita conexao de qualquer interface) — reproduzido antes desta correcao:
 * `server.address()` devolvia `{address:"::", family:"IPv6"}`.
 *
 * So loopback e permitido. `::1` so quando configurado explicitamente
 * (PANEL_HOST=::1) — nunca por padrao, porque nem todo ambiente tem IPv6
 * funcional e o padrao precisa ser o que sempre funciona. Qualquer outro
 * host (0.0.0.0, ::, IP de LAN, hostname nao-loopback) e RECUSADO — falha
 * fechada, o processo nao sobe.
 */
const LOOPBACK_ALLOWLIST = Object.freeze(["127.0.0.1", "localhost", "::1"]);
const REJECTED_HOSTS = Object.freeze(["0.0.0.0", "::", "0000:0000:0000:0000:0000:0000:0000:0000"]);

function resolvePanelHost(env) {
  const raw = (env || process.env).PANEL_HOST;
  if (!raw) return { ok: true, host: "127.0.0.1", source: "padrao" };
  const host = raw.trim();
  if (REJECTED_HOSTS.includes(host)) {
    return { ok: false, host, reason: `host_curinga_recusado:${host}` };
  }
  if (!LOOPBACK_ALLOWLIST.includes(host)) {
    return { ok: false, host, reason: `host_nao_loopback_recusado:${host}` };
  }
  return { ok: true, host, source: "configurado" };
}

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

/**
 * Sprint 2.2 (Fase 3/9 — bloqueador 3): antes, so lia eventos do relogio e
 * NUNCA injetava `order.dimension` — o HTML renderizado nunca continha
 * courier/bloqueio/alerta, mesmo quando esses sinais existiam no store.
 * Agora reconcilia a observacao multidimensional persistida pelo observador
 * (`live_observations[].dimensions`) da MESMA forma que `observer.js#getReconciledDimension`
 * faz — a fonte de verdade e' uma so.
 */
function reconciledDimensionFor(store, orderId) {
  const dims = store.all("live_observations")
    .filter((o) => o.external_id === orderId && o.dimensions)
    .sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")))
    .map((o) => o.dimensions);
  if (!dims.length) return null;
  return reconcileMultidimensional(orderId, dims);
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
    const dimension = reconciledDimensionFor(store, orderId);
    rows.push(Object.assign(
      panelRow({ external_id: orderId, clock_events: events, dimension }),
      { order_id: orderId }
    ));
  }
  return rows.sort((a, b) => (b.minutes_since_ready || 0) - (a.minutes_since_ready || 0));
}

/**
 * Sinais multidimensionais em ordem de prioridade fixa (Fase 9): bloqueio >
 * entregador na loja > alerta logístico > agrupado > agendado. Nunca todas
 * as dimensões juntas — o resto vira `<details>` (expansão sob demanda).
 */
function renderSignals(r) {
  if (!r.details) return ""; // sem dimensao multidimensional — nada a mostrar (compat Sprint 2)
  const chips = [];
  if (r.blocked) chips.push('<span class="chip chip-block">bloqueado</span>');
  if (r.courier_at_store) chips.push('<span class="chip chip-courier">entregador na loja</span>');
  if (r.logistics_alert) chips.push(`<span class="chip chip-alert">${esc(r.logistics_alert.code)}</span>`);
  if (r.grouped) chips.push('<span class="chip">agrupado</span>');
  if (r.scheduled) chips.push('<span class="chip">agendado</span>');

  const d = r.details;
  const detailLines = [
    d.courier_state && d.courier_state !== "not_applicable" ? `entregador: ${esc(d.courier_state)}` : null,
    d.dispatch_state && d.dispatch_state !== "not_applicable" ? `despacho: ${esc(d.dispatch_state)}` : null,
    d.fulfillment_mode && d.fulfillment_mode !== "unknown" ? `modalidade: ${esc(d.fulfillment_mode)}` : null,
    d.group_id ? `grupo: ${esc(d.group_id)}` : null,
    d.scheduled_for ? `agendado para: ${esc(d.scheduled_for)}` : null,
    d.indicators && d.indicators.length ? `indicadores: ${d.indicators.map((i) => esc(i.code)).join(", ")}` : null
  ].filter(Boolean);

  const details = detailLines.length
    ? `<details><summary>detalhes</summary><ul>${detailLines.map((l) => `<li>${l}</li>`).join("")}</ul></details>`
    : "";

  return chips.join(" ") + (chips.length && details ? " " : "") + details;
}

function renderPage(rows) {
  const items = rows.map((r) => `
    <tr>
      <td>${esc(r.short_id)}</td>
      <td>${r.minutes_since_ready == null ? "—" : r.minutes_since_ready + " min"}</td>
      <td>${esc(r.state)}</td>
      <td>${esc(r.source_health)}</td>
      <td>${renderSignals(r)}</td>
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
  .chip{display:inline-block;background:#2a2a2a;border:1px solid #444;border-radius:12px;padding:2px 8px;margin:0 4px 2px 0;font-size:12px}
  .chip-block{border-color:#f5a623;color:#f5a623}
  .chip-courier{border-color:#4ade80;color:#4ade80}
  .chip-alert{border-color:#f87171;color:#f87171}
  details{display:inline-block;font-size:12px;color:#aaa}
  details ul{margin:4px 0 0 16px;padding:0}
</style></head><body>
<h1>Painel interno da Conferência</h1>
<p class="aviso">Ferramenta interna, atrás de feature flag. Não é a interface do Copiloto. Sem identificação de funcionário, sem ranking.</p>
<table>
<tr><th>Pedido</th><th>Desde o pronto</th><th>Estado</th><th>Saúde da fonte</th><th>Sinais</th><th>Ações</th></tr>
${items || '<tr><td colspan="6">Nenhum pedido em Conferência agora.</td></tr>'}
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
  const hostCheck = resolvePanelHost();
  if (!hostCheck.ok) {
    console.error(`PANEL_HOST recusado: ${hostCheck.reason}. So loopback e permitido ` +
      `(127.0.0.1, localhost, ::1 quando explicito). Painel nao sobe.`);
    process.exitCode = 1;
    return;
  }
  const store = createStore();
  const server = createServer(store);
  server.listen(PORT, hostCheck.host, () => {
    const { address, port } = server.address();
    console.log(`Painel interno da Conferencia em http://${hostCheck.host}:${port}/ ` +
      `(bind real: ${address}) (Sprint 2, sombra, uso interno)`);
  });
}

if (require.main === module) main();

module.exports = {
  createServer, ordersInPlay, renderPage, resolvePanelHost, LOOPBACK_ALLOWLIST, REJECTED_HOSTS,
  reconciledDimensionFor, renderSignals
};
