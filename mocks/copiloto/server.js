/**
 * Mock server do Copiloto — somente referência para Claude.
 * Uso: node mocks/copiloto/server.js
 * Porta: COPILOTO_MOCK_PORT || 5188
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = Number(process.env.COPILOTO_MOCK_PORT || 5188);
const FIX = path.join(__dirname, "fixtures");
const SC = path.join(FIX, "scenarios");

const copiloto = require("../../src/copiloto");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function send(res, code, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function notFound(res, msg) {
  send(res, 404, { error: "not_found", message: msg });
}

function loadScenario(idOrName) {
  const index = readJson(path.join(FIX, "index.json"));
  const hit = index.scenarios.find(
    (s) => String(s.id) === String(idOrName) || s.name === idOrName || s.file === idOrName
  );
  if (!hit) return null;
  return { meta: hit, payload: readJson(path.join(SC, hit.file)) };
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  const parsed = url.parse(req.url, true);
  const p = parsed.pathname || "/";

  try {
    if (p === "/health") {
      return send(res, 200, { ok: true, service: "copiloto-mock", version: "1.0.0" });
    }
    if (p === "/v1/state") {
      const sc = loadScenario(parsed.query.scenario || 1);
      return send(res, 200, sc ? sc.payload.state || sc.payload : { error: "empty" });
    }
    if (p === "/v1/focus") {
      const sc = loadScenario(parsed.query.scenario || 4);
      return send(res, 200, (sc && (sc.payload.focus || sc.payload.focus_selection)) || { status: "none" });
    }
    if (p === "/v1/areas") {
      const sc = loadScenario(parsed.query.scenario || 1);
      return send(res, 200, (sc && sc.payload.state && sc.payload.state.areas) || {});
    }
    if (p === "/v1/forecast") {
      const horizon = Number(parsed.query.horizon || 15);
      const area = parsed.query.area || "conferencia";
      const series = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const f = copiloto.forecast.forecastArea({
        area,
        queue_history: series,
        dow: 5,
        hour: 19,
        horizon_min: horizon
      });
      return send(res, 200, f);
    }
    if (p === "/v1/anomalies") {
      const sc = loadScenario(parsed.query.scenario || 13);
      return send(res, 200, (sc && sc.payload.anomalies) || []);
    }
    if (p === "/v1/briefing") {
      const sc = loadScenario(24);
      return send(res, 200, sc.payload.briefing);
    }
    if (p === "/v1/closing") {
      const n = Number(parsed.query.questions || 0);
      const id = n >= 3 ? 27 : n === 1 ? 26 : 25;
      const sc = loadScenario(id);
      return send(res, 200, sc.payload.closing);
    }
    if (p === "/v1/voice/intents") {
      return send(res, 200, { intents: copiloto.voice.listIntents() });
    }
    if (p === "/v1/voice/match") {
      const q = parsed.query.q || "";
      return send(res, 200, copiloto.voice.matchIntentByExample(q));
    }
    if (p === "/v1/playbooks") {
      return send(res, 200, { playbooks: copiloto.playbooks.SEED_PLAYBOOKS });
    }
    if (p === "/v1/scenarios") {
      return send(res, 200, readJson(path.join(FIX, "index.json")));
    }
    if (p.startsWith("/v1/scenarios/")) {
      const id = p.split("/").pop();
      const sc = loadScenario(id);
      if (!sc) return notFound(res, "scenario");
      return send(res, 200, sc.payload);
    }
    if (p === "/v1/response/example") {
      return send(res, 200, copiloto.response.exampleConferenceResponse());
    }
    if (p === "/v1/shadow/gates") {
      return send(res, 200, { levels: copiloto.shadow.LEVELS, gates: copiloto.shadow.GATES });
    }
    if (p === "/v1/metrics") {
      return send(res, 200, { metrics: copiloto.metrics.PRODUCT_METRICS });
    }
    if (p === "/v1/openapi") {
      const oa = path.join(__dirname, "..", "..", "openapi", "copiloto-openapi.yaml");
      if (!fs.existsSync(oa)) return notFound(res, "openapi");
      res.writeHead(200, { "Content-Type": "text/yaml; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      return res.end(fs.readFileSync(oa, "utf8"));
    }
    return notFound(res, p);
  } catch (e) {
    return send(res, 500, { error: "internal", message: String(e.message || e) });
  }
});

if (require.main === module) {
  // ensure fixtures
  const idx = path.join(FIX, "index.json");
  if (!fs.existsSync(idx)) {
    require("./generate-fixtures");
  }
  server.listen(PORT, () => {
    console.log(`copiloto mock http://localhost:${PORT}`);
    console.log(`scenarios: http://localhost:${PORT}/v1/scenarios`);
  });
}

module.exports = { server, loadScenario };
