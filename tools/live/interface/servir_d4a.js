/* ============================================================================
 * DeliveryOS · tools/live/interface · SERVIDOR D4A (irmão do servir_v1)
 * ----------------------------------------------------------------------------
 * Serve a MESMA interface V1 (app-v1 intacta em espírito) + dois endpoints:
 *   GET /api/config → resultado da feature flag DELIVERYOS_LIVE_SOURCE
 *   GET /api/fonte  → payload do adaptador sobre um cenário simulado
 *                     certificado (3A). Parâmetros de demonstração:
 *                     ?cenario=<id do catálogo>&seed=<seed>
 *                     ?estado=<força um estado da fonte p/ demonstrar
 *                              degradação: initializing|replaying|stale|
 *                              disconnected|degraded|failed|stopped>
 * O servidor NÃO decide nada: executa o cenário pela API pública, adapta a
 * projeção e entrega. servir_v1.js segue intocado (fonte atual preservada).
 * Uso: DELIVERYOS_LIVE_SOURCE=simulator node tools/live/interface/servir_d4a.js
 *      → http://localhost:5180/
 * ==========================================================================*/
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..", "..");
const { executarCenario } = require("../simulator/executor");
const ev = require("../simulator/eventos");
const { montarPayloadInterface } = require(path.join(RAIZ, "src", "live", "interface", "adaptador.js"));
const { selecionarFonteDoAmbiente } = require(path.join(RAIZ, "src", "live", "interface", "fonte.js"));

// cenários de DEMONSTRAÇÃO de estado degradado — produzem o snapshot de forma
// honesta (a fonte realmente termina naquele estado), nunca por rótulo forjado.
const INICIO_DEMO = "2026-08-01T18:00:00.000Z";
const tsDemo = (ctx, em) => new Date(ctx.inicioMs + em * 1000).toISOString();
const pedidoDemo = (ctx) => ({ ifood: ctx.ids.proximoIfood(), interno: ctx.ids.proximoInterno(), job: ctx.ids.proximoJob(), itens: ev.itensSinteticos(ctx.aleatorio) });
const CEN_DEMO = {
  stale: { id: "demo_stale", inicio: INICIO_DEMO, fim_ms: 320000, passos(ctx) { const p = pedidoDemo(ctx); return [
    { em_ms: 0, evento: ev.eventoStatus(ctx, tsDemo(ctx, 0), p, "em_preparo") },
    { em_ms: 300000, evento: ev.eventoComanda(ctx, tsDemo(ctx, 300), p) } ]; } },
  disconnected: { id: "demo_disconnected", inicio: INICIO_DEMO, fim_ms: 90000, passos(ctx) { const p = pedidoDemo(ctx); return [
    { em_ms: 0, evento: ev.eventoComanda(ctx, tsDemo(ctx, 0), p) },
    { em_ms: 30000, evento: ev.eventoStatus(ctx, tsDemo(ctx, 30), p, "em_preparo") },
    { em_ms: 60000, evento: ev.eventoFonteDesconectada(ctx, tsDemo(ctx, 60), "sim_status") } ]; } },
  degraded: { id: "demo_degraded", inicio: INICIO_DEMO, fim_ms: 80000, passos(ctx) { const p = pedidoDemo(ctx); return [
    { em_ms: 0, evento: ev.eventoComanda(ctx, tsDemo(ctx, 0), p) },
    { em_ms: 40000, evento: ev.eventoStatus(ctx, tsDemo(ctx, 40), p, "em_preparo") } ]; } },
  replaying: { id: "demo_replaying", inicio: INICIO_DEMO, fim_ms: 80000, passos(ctx) { const p = pedidoDemo(ctx); return [
    { em_ms: 0, evento: ev.eventoComanda(ctx, tsDemo(ctx, 0), p) },
    { em_ms: 40000, evento: ev.eventoStatus(ctx, tsDemo(ctx, 40), p, "em_preparo") } ]; } }
};

const PORT = 5180;
const TZ = "America/Sao_Paulo";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const selecao = selecionarFonteDoAmbiente(process.env);

function payloadDaFonte(query) {
  const estadoForcado = query.get("estado");
  if (estadoForcado && estadoForcado !== "ready") {
    // demonstração de degradação: estados sem janela corrente
    const forca = {
      initializing: { inicializando: true },
      replaying: { replayStatus: { em_andamento: true, eventos_relidos: 0 } },
      failed: { erro: new Error("falha_demonstracao") },
      stopped: { parada: true },
      degraded: { degradedState: "degradacao_demonstracao" }
    }[estadoForcado] || {};
    let snapshot = null;
    // replaying/degraded também precisam de um snapshot base (há dados parciais
    // durante replay; a degradação não apaga o que já se sabe).
    if (["stale", "disconnected", "degraded", "replaying"].includes(estadoForcado)) {
      const cen = CEN_DEMO[estadoForcado] || CEN_DEMO.stale;
      snapshot = executarCenario({ cenario: cen, seed: query.get("seed") || "demo-d4a", storeTimeZone: TZ }).snapshot;
    }
    return montarPayloadInterface({
      snapshot, storeTimeZone: TZ, origem: "simulator", ...forca,
      agoraIso: new Date().toISOString()
    });
  }
  const r = executarCenario({
    cenario: query.get("cenario") || "fluxo_normal",
    seed: query.get("seed") || "demo-d4a",
    storeTimeZone: TZ
  });
  return montarPayloadInterface({
    snapshot: r.snapshot, storeTimeZone: TZ, origem: "simulator",
    replayStatus: { em_andamento: false, ultimo: r.replay }, agoraIso: r.snapshot.gerado_em
  });
}

http.createServer((req, res) => {
  const [rota, qs] = req.url.split("?");
  const query = new URLSearchParams(qs || "");
  const json = (obj, code) => {
    res.writeHead(code || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  try {
    if (rota === "/") { res.writeHead(302, { Location: "/app-v1/index.html" }); res.end(); return; }
    if (rota === "/api/config") { json(selecao); return; }
    if (rota === "/api/fonte") {
      if (selecao.fonte !== "simulator") {
        json({ erro: "fonte_simulada_desligada", selecao }, 409); return;
      }
      json(payloadDaFonte(query)); return;
    }
    const f = path.join(RAIZ, decodeURIComponent(rota));
    if (!f.startsWith(RAIZ)) { res.writeHead(403); res.end("403"); return; }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
      res.end(d);
    });
  } catch (erro) {
    // erro nunca se perde em silêncio: vira payload failed
    json(montarPayloadInterface({
      snapshot: null, storeTimeZone: TZ, origem: "simulator", erro,
      agoraIso: new Date().toISOString()
    }), 500);
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`D4A: http://localhost:${PORT}/  flag=${selecao.fonte}` +
    (selecao.degraded_state ? ` (degraded: ${selecao.degraded_state})` : "") +
    (selecao.fallback ? ` (${selecao.fallback})` : ""));
});
