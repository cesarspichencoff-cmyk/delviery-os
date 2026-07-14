/* ============================================================================
 * DeliveryOS · investigação de volume · SERVIDOR (irmão do servir_d4a, NÃO
 * o mesmo arquivo — servir_d4a.js permanece INTOCADO nesta investigação)
 * ----------------------------------------------------------------------------
 * Serve a MESMA interface V1 (app-v1, também intocada) e expõe os cenários
 * de investigação (Ambiente/Foco) pelo MESMO adaptador D4A (montarJanela,
 * INTOCADO) que a D4A já usa. Nenhuma lógica nova de decisão — só transporte.
 * Uso: node tools/live/interface/servir_investigacao_volume.js
 *      → http://localhost:5181/
 * ==========================================================================*/
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..", "..");
const { executarCenario } = require("../simulator/executor");
const { CENARIO_AMBIENTE, CENARIO_FOCO } = require("../simulator/investigacao_volume/cenarios_volume");
const { montarPayloadInterface } = require(path.join(RAIZ, "src", "live", "interface", "adaptador.js"));

const PORT = 5181;
const TZ = "America/Sao_Paulo";
const SEED = "investigacao-volume-v1";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const CENARIOS = { ambiente: CENARIO_AMBIENTE, foco: CENARIO_FOCO };

function payload(nomeCenario) {
  const def = CENARIOS[nomeCenario];
  if (!def) throw new Error(`cenario_investigacao_desconhecido: ${nomeCenario}`);
  const r = executarCenario({ cenario: def, seed: SEED, storeTimeZone: TZ });
  return montarPayloadInterface({
    snapshot: r.snapshot, storeTimeZone: TZ, origem: "simulator",
    replayStatus: { em_andamento: false, ultimo: r.replay }, agoraIso: r.snapshot.gerado_em
  });
}

http.createServer((req, res) => {
  const [rota, qs] = req.url.split("?");
  const query = new URLSearchParams(qs || "");
  const json = (obj, code) => { res.writeHead(code || 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  try {
    if (rota === "/") { res.writeHead(302, { Location: "/app-v1/index.html" }); res.end(); return; }
    if (rota === "/api/config") { json({ fonte: "simulator", flag_bruta: "simulator", degraded_state: null, fallback: null }); return; }
    if (rota === "/api/fonte") { json(payload(query.get("cenario") || "ambiente")); return; }
    const f = path.join(RAIZ, decodeURIComponent(rota));
    if (!f.startsWith(RAIZ)) { res.writeHead(403); res.end("403"); return; }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
      res.end(d);
    });
  } catch (erro) {
    json({ erro: String(erro.message || erro) }, 500);
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Investigação de volume: http://localhost:${PORT}/`);
});
