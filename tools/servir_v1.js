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
    /* Fase 2B — inteligência e Capacidade Viva (sem redesenhar UI) */
    if (rota === "/api/inteligencia/forecast") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const hist = String(query.get("hist") || "2,3,4,5,6,7,8,9,10,11,12")
        .split(",").map(Number).filter((n) => !Number.isNaN(n));
      json(intel.buildForecastForArea({
        area: query.get("area") || "conferencia",
        queue_history: hist,
        horizon_min: Number(query.get("horizon") || 15),
        demo: query.get("demo") === "1"
      }));
      return;
    }
    if (rota === "/api/inteligencia/action") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const pb = intel.suggestPlaybookForArea(query.get("area") || "conferencia");
      json(intel.adaptActionTrack({
        stateId: query.get("state") || "recomendacao",
        playbook: pb,
        from_engine: true
      }));
      return;
    }
    if (rota === "/api/inteligencia/closing") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const mem = intel.newShiftMemory({
        pressures: query.get("calm") === "1" ? [] : [{ area: "conferencia" }],
        unexplained: query.get("q") === "1"
          ? [{ id: "u1", observation: "queda sem causa", unknown: "ação manual?", question: "Houve apoio não registrado?", importance: 0.8, info_gain: 0.8 }]
          : []
      });
      json(intel.adaptClosing(mem, Number(query.get("step") || 0)));
      return;
    }
    if (rota === "/api/inteligencia/voice") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      json(intel.adaptVoiceIntent(query.get("q") || "Como está a Conferência?", {
        focus_conclusion: "Conferência sob leitura atual.",
        focus_detail: "Sinais no organismo.",
        focus_area: "Conferência"
      }));
      return;
    }
    if (rota === "/api/capacidade-viva/avaliar") {
      const CV = require(path.join(DIR, "src", "capacidade-viva"));
      const demo = require(path.join(DIR, "data", "capacidade-viva", "fixtures", "items-demo.json"));
      const items = (demo.items || []).filter((it) => it.praca === (query.get("praca") || "sushi"));
      const av = CV.avaliar({
        turno: {
          equipe: {
            sushi: Number(query.get("sushi") || 8),
            quentes: Number(query.get("quentes") || 3),
            conferencia: Number(query.get("conferencia") || 5),
            caixa: 3,
            cozinha: 2,
            motoboy: 4,
            flutuantes: 1
          }
        },
        por_praca: {
          sushi: { items: items.length ? items : demo.items.filter((i) => i.praca === "sushi") },
          quentes: { items: demo.items.filter((i) => i.praca === "quentes"), envelhecimento: Number(query.get("env") || 0) },
          conferencia: { items: demo.items.filter((i) => i.praca === "conferencia") }
        },
        n_pedidos: Number(query.get("pedidos") || 45),
        orders: query.get("ex") === "motoboy"
          ? [{ id: "D-1", motoboy_esperando: true, age_min: 12, pronto: true }]
          : [],
        confianca: query.get("conf") || "media"
      });
      json({ avaliacao: av, v33: CV.toV33ViewHints(av), simulated_fixtures: true });
      return;
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
