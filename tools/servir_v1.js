/* ============================================================================
 * Servidor da Interface V1 · Copiloto V3.3. Zero dependências.
 * ----------------------------------------------------------------------------
 * Serve a RAIZ do repo (o app carrega o cérebro real de src/perfil-delivery/
 * e os dados de data/ — nada é duplicado dentro da interface) e expõe:
 *   GET /api/config → fonte efetiva (flag DELIVERYOS_LIVE_SOURCE + realidade)
 *   GET /api/fonte  → payload do adaptador D4A sobre cenário simulado
 *                     ?cenario=foco|ambiente (cenários de volume, motor real)
 *                     ou id do catálogo certificado 3A · ?seed=<seed>
 *
 * EXECUÇÃO REPRODUTÍVEL (correção da "janela real não encontrada"):
 * data/generated/v1_janela_real.json é DADO REAL e fica fora do Git — num
 * worktree limpo ele NÃO existe, e tools/gerar_janela_v1.js também não roda
 * (depende de data/raw/** e node_modules/xlsx, ambos fora do Git). Por isso:
 *   - flag ausente + janela real presente  → fonte atual (comportamento
 *     histórico preservado, byte-idêntico);
 *   - flag ausente + janela real AUSENTE   → simulador certificado, com
 *     fallback REGISTRADO no /api/config e rótulo de demonstração na UI
 *     (dado sintético nunca aparece como real);
 *   - flag explícita "current"             → fonte atual sempre (se faltar a
 *     janela, a interface mostra o estado técnico com a instrução);
 *   - flag explícita "simulator"           → simulador sempre.
 * Uso: node tools/servir_v1.js  →  http://localhost:5179/
 *      (porta alternativa: PORT=5199 node tools/servir_v1.js)
 * ==========================================================================*/
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const DIR = path.join(__dirname, "..");
const PORT = parseInt(process.env.PORT || "5179", 10);
const TZ = "America/Sao_Paulo";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jsonl": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const { executarCenario } = require("./live/simulator/executor");
const { CENARIO_AMBIENTE, CENARIO_FOCO } = require("./live/simulator/investigacao_volume/cenarios_volume");
const { montarPayloadInterface } = require(path.join(DIR, "src", "live", "interface", "adaptador.js"));
const { selecionarFonteDoAmbiente } = require(path.join(DIR, "src", "live", "interface", "fonte.js"));

const JANELA_REAL = path.join(DIR, "data", "generated", "v1_janela_real.json");

/* Cenários de volume (motor real produz Calmo→Ambiente→Foco legitimamente —
 * ver docs/preloja/Investigacao_Cenarios_Volume_Ambiente_Foco_V0.md). */
const CENARIOS_VOLUME = { ambiente: CENARIO_AMBIENTE, foco: CENARIO_FOCO };

function selecaoEfetiva() {
  const selecao = selecionarFonteDoAmbiente(process.env);
  const temJanelaReal = fs.existsSync(JANELA_REAL);
  if (selecao.flag_bruta === "current") return { ...selecao, fonte: "current" };
  if (selecao.fonte === "simulator") return selecao;
  if (temJanelaReal) return selecao; // fonte atual, comportamento histórico
  return {
    ...selecao,
    fonte: "simulator",
    fallback: "janela_real_ausente_usando_simulador_rotulado"
  };
}

function payloadDaFonte(query) {
  const nome = query.get("cenario") || "foco";
  const cenario = CENARIOS_VOLUME[nome] || nome; // objeto (volume) ou id do catálogo 3A
  const r = executarCenario({ cenario, seed: query.get("seed") || "copiloto-v33", storeTimeZone: TZ });
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
    if (rota === "/api/config") { json(selecaoEfetiva()); return; }
    if (rota === "/api/fonte") {
      const sel = selecaoEfetiva();
      if (sel.fonte !== "simulator") { json({ erro: "fonte_simulada_desligada", selecao: sel }, 409); return; }
      json(payloadDaFonte(query)); return;
    }
    const p = decodeURIComponent(rota);
    const f = path.join(DIR, p);
    if (!f.startsWith(DIR)) { res.writeHead(403); res.end("403"); return; }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(d);
    });
  } catch (erro) {
    json(montarPayloadInterface({
      snapshot: null, storeTimeZone: TZ, origem: "simulator", erro,
      agoraIso: new Date().toISOString()
    }), 500);
  }
}).listen(PORT, "0.0.0.0", () => {
  const sel = selecaoEfetiva();
  const ips = [].concat(...Object.values(os.networkInterfaces())).filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("Copiloto V3.3: http://localhost:" + PORT + "/  fonte=" + sel.fonte +
    (sel.fallback ? " (" + sel.fallback + ")" : "") +
    (ips.length ? "  ·  no celular: http://" + ips[0] + ":" + PORT + "/" : ""));
});
