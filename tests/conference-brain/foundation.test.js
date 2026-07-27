/* ============================================================================
 * Fundação do cérebro da Conferência (Sprint 1) — ingestão, pedidos, snapshots,
 * estado sombra, composição, flags e compatibilidade.
 * ==========================================================================*/
"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const R = path.join(__dirname, "..", "..");
const { validate } = require(path.join(R, "src/conference-brain/contracts/schemas"));
const S = require(path.join(R, "src/conference-brain/contracts/states"));
const RV = require(path.join(R, "src/conference-brain/contracts/rule-version"));
const { createStore } = require(path.join(R, "src/conference-brain/storage/store"));
const { createIngestion } = require(path.join(R, "src/conference-brain/ingestion/pipeline"));
const { createStructuredPayloadAdapter } = require(path.join(R, "src/conference-brain/ingestion/adapters/structured-payload"));
const { createHistoricalHtmlAdapter, extractOrderCards, inferReportDate } = require(path.join(R, "src/conference-brain/ingestion/adapters/historical-html"));
const N = require(path.join(R, "src/conference-brain/normalize/normalizer"));
const D = require(path.join(R, "src/conference-brain/normalize/dedupe"));
const { buildSnapshots, computeRhythm } = require(path.join(R, "src/conference-brain/snapshots/engine"));
const { evaluateShadowState, baseStateFromLoad } = require(path.join(R, "src/conference-brain/shadow/conference-state"));
const { orderHints, buildCatalogIndex } = require(path.join(R, "src/conference-brain/composition/hints"));
const F = require(path.join(R, "src/conference-brain/flags"));

const T0 = "2026-06-20T20:00:00-03:00";
const at = (min) => new Date(Date.parse(T0) + min * 60000).toISOString();

function payload(n, over) {
  return Object.assign({
    order_id: "o" + n, external_id: "o" + n, status: "CONCLUDED",
    received_at: at(0), items: [{ name: "Temaki de Salmão", quantity: 1 }]
  }, over || {});
}
function ingest(records, opts) {
  const ad = createStructuredPayloadAdapter(records);
  return createIngestion(ad, Object.assign({ storeOptions: { memoryOnly: true }, keepRaw: false }, opts || {})).run();
}

/* ------------------------------ INGESTÃO ---------------------------------- */
describe("ingestao", () => {
  test("importacao valida persiste pedido, itens e eventos", () => {
    const r = ingest([payload(1, { ready_at: at(20) })]);
    assert.equal(r.run.status, "concluido");
    assert.equal(r.run.normalized_count, 1);
    assert.equal(r.store.count("orders"), 1);
    assert.equal(r.store.count("order_items"), 1);
    assert.ok(r.store.count("order_status_events") >= 2);
  });

  test("registro incompleto (sem id) vai para quarentena, nao derruba a ingestao", () => {
    const r = ingest([{ status: "CONCLUDED", received_at: at(0) }, payload(2)]);
    assert.equal(r.run.status, "concluido");
    assert.equal(r.run.normalized_count, 1);
    assert.equal(r.run.rejected_count, 1);
    assert.ok(r.anomalies.some((a) => a.status === "quarentena"));
  });

  test("duplicidade e detectada e registrada, nunca apagada em silencio", () => {
    const r = ingest([payload(3), payload(3)]);
    assert.equal(r.run.duplicate_count, 1);
    assert.equal(r.store.count("orders"), 1);
    assert.ok(r.anomalies.some((a) => a.type.startsWith("duplicidade")));
  });

  test("conflito entre lotes registra divergencia e rebaixa confianca", () => {
    const r = ingest([payload(4, { total_value: 10 }), payload(4, { total_value: 99 })]);
    const a = r.anomalies.find((x) => x.type === "duplicidade_com_divergencia");
    assert.ok(a, "esperava anomalia de divergencia");
    assert.ok(a.evidence.divergences.some((d) => d.field === "total_value"));
    assert.equal(r.store.all("orders")[0].confidence, S.CONFIDENCE.MEDIUM);
  });

  test("retomada por checkpoint nao reprocessa o que ja passou", () => {
    const r = ingest([payload(5), payload(6), payload(7)], { checkpoint: { index: 2 } });
    assert.equal(r.run.normalized_count, 1);
    assert.equal(r.store.count("orders"), 1);
  });

  test("dry-run nao persiste nada", () => {
    const r = ingest([payload(8)], { dryRun: true });
    assert.equal(r.run.dry_run, true);
    assert.equal(r.store.count("orders"), 0);
  });

  test("bruto e preservado com hash e versao do parser", () => {
    const ad = createStructuredPayloadAdapter([payload(9)]);
    const r = createIngestion(ad, { storeOptions: { memoryOnly: true }, keepRaw: true }).run();
    const raw = r.store.all("ingestion_raw_records")[0];
    assert.ok(raw.payload_hash && raw.payload_hash.length === 64);
    assert.ok(raw.parser_version);
    assert.ok(raw.raw, "o bruto deve ser preservado");
  });

  test("reportHealth declara fonte parcial quando falta carimbo de pronto", () => {
    const r = ingest([payload(10)]);
    assert.equal(r.health.source_state, S.SOURCE_STATES.PARTIAL);
    assert.ok(r.health.missing_fields.includes("ready_at"));
  });
});

/* ------------------------------- PEDIDOS ---------------------------------- */
describe("pedidos e normalizacao", () => {
  test("status da plataforma vira status canonico (DECLINED = cancelado com nota)", () => {
    assert.equal(N.normalizeStatus("CONCLUDED"), S.ORDER_STATUS.CONCLUDED);
    assert.equal(N.normalizeStatus("DECLINED"), S.ORDER_STATUS.CANCELLED);
    assert.equal(N.statusNote("DECLINED"), "recusado_pela_loja_ou_plataforma");
    assert.equal(N.normalizeStatus("XPTO"), S.ORDER_STATUS.UNKNOWN);
  });

  test("timestamp BR vira ISO com offset de Sao Paulo", () => {
    assert.equal(N.parseLocalDateTime("20/06/2026 11:05"), "2026-06-20T11:05:00-03:00");
    assert.equal(N.parseLocalDateTime("data ruim"), null);
  });

  test("dinheiro e contagens sao parseados; valor invalido vira null (nunca 0)", () => {
    assert.equal(N.parseMoney("R$ 90,99"), 90.99);
    assert.equal(N.parseMoney("R$ 1.234,50"), 1234.5);
    assert.equal(N.parseMoney("—"), null);
    assert.deepEqual(N.parseItemCounts("5 dist. / 7 un."), { distinct: 5, units: 7 });
  });

  test("itens e quantidades sao extraidos, observacao e preservada", () => {
    const items = N.parseItemsHtml("2x Uramaki Ebiten\n1x Yakissoba <em>(sem cebola)</em>");
    assert.equal(items.length, 2);
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].raw_name, "Uramaki Ebiten");
    assert.equal(items[1].observation, "sem cebola");
    assert.equal(items[1].raw_name, "Yakissoba");
  });

  test("carimbo ausente vira null e e declarado — nunca estimado", () => {
    const r = N.normalizeHistoricalRow({ dt: "20/06/2026 11:05", oid: "x", status: "CONCLUDED" }, {});
    assert.equal(r.order.ready_at, null);
    assert.ok(r.missing_fields.includes("ready_at"));
    assert.ok(r.missing_fields.includes("dispatched_at"));
  });

  test("divergencia entre unidades declaradas e somadas vira aviso", () => {
    const r = N.normalizeHistoricalRow(
      { dt: "20/06/2026 11:05", oid: "y", status: "CONCLUDED", nitens: "1 dist. / 9 un.", itens_html: "1x Temaki" }, {});
    assert.ok(r.warnings.some((w) => w.startsWith("unidades_divergentes")));
  });

  // Defeito real encontrado nos dados historicos: 3 pedidos tinham observacao
  // com quebra de linha, e o resto da frase virava um item fantasma
  // ("pode colocar salmao"). A quebra e' do TEXTO, nao separa itens.
  test("observacao com quebra de linha nao cria item fantasma", () => {
    const it = N.parseItemsHtml(
      "1x Combinado Kids\n1x Ceviche <em>(nao gosto de tilapia ao inves\npode colocar salmao)</em>");
    assert.equal(it.length, 2, "duas linhas de item, nao tres");
    assert.equal(it[1].raw_name, "Ceviche");
    assert.ok(!it.some((x) => /pode colocar salmao/i.test(x.raw_name)), "nome nao pode conter a observacao");
  });

  test("a quebra escrita pelo cliente e' preservada na observacao", () => {
    const it = N.parseItemsHtml("2x Temaki de Salmao <em>(1 - sem cream cheese\n1 - normal)</em>");
    assert.equal(it.length, 1);
    assert.equal(it[0].quantity, 2);
    // texto do cliente inteiro, com a quebra original — nada inventado, nada perdido
    assert.equal(it[0].observation, "1 - sem cream cheese\n1 - normal");
  });

  test("dedup preserva o mais completo e registra o que divergiu", () => {
    const a = { order_id: "z", status: "concluido", received_at: at(0), total_value: null, first_observed_at: at(0) };
    const b = { order_id: "z", status: "concluido", received_at: at(0), total_value: 50, first_observed_at: at(1) };
    const res = D.resolve(a, b);
    assert.equal(res.action, "replace");
    assert.equal(res.reason, "incoming_mais_completo");
    const anomaly = D.toAnomaly("z", res, "run1");
    assert.ok(anomaly.evidence.rule.startsWith("dedupe-v1"));
  });
});

/* ------------------------------ SNAPSHOTS --------------------------------- */
describe("snapshots", () => {
  function scenario(nActive, nReady) {
    const orders = [];
    for (let i = 0; i < nActive; i++) orders.push({ order_id: "a" + i, received_at: at(-20 - i), ready_at: null });
    for (let i = 0; i < nReady; i++) orders.push({ order_id: "r" + i, received_at: at(-30), ready_at: at(1) });
    return orders;
  }

  test("conta entrada, prontos e convergencia na janela", () => {
    const s = buildSnapshots(scenario(10, 9), { windowMinutes: 5 });
    const win = s.find((x) => x.ready_in_window > 0);
    assert.equal(win.ready_in_window, 9);
    assert.equal(win.convergence, 9);
  });

  test("pedidos ativos sao contados quando ha carimbo de pronto", () => {
    const s = buildSnapshots(scenario(12, 3), { windowMinutes: 5 });
    // os pedidos chegam ao longo do tempo: o pico e' que deve refletir o total vivo
    const pico = Math.max(...s.map((x) => x.active_orders || 0));
    assert.equal(pico, 15, "12 sem pronto + 3 vivos ate ficarem prontos");
    // e a curva precisa cair depois que os 3 ficam prontos
    assert.ok(s[s.length - 1].active_orders < pico, "ativos devem cair apos os prontos");
  });

  test("fonte sem carimbo de pronto: ativos e convergencia ficam null e a janela e parcial", () => {
    const s = buildSnapshots([{ order_id: "x", received_at: at(0), ready_at: null }], { windowMinutes: 5 });
    assert.equal(s[0].active_orders, null);
    assert.equal(s[0].convergence, null);
    assert.equal(s[0].source_state, S.SOURCE_STATES.PARTIAL);
    assert.match(s[0].notes, /nao_observa_pronto/);
  });

  test("fila crescendo e fila recuperando aparecem no ritmo", () => {
    const s = buildSnapshots(scenario(20, 2), { windowMinutes: 5 });
    const i = s.findIndex((x) => x.active_orders != null);
    const r = computeRhythm(s, Math.max(i, 1));
    assert.ok(typeof r.growing_windows === "number");
    assert.ok("recovering" in r);
  });

  test("janela nao suportada e recusada", () => {
    assert.throws(() => buildSnapshots([], { windowMinutes: 7 }), /janela_nao_suportada/);
  });

  test("snapshot respeita o contrato", () => {
    const s = buildSnapshots(scenario(5, 5), { windowMinutes: 5 });
    for (const x of s) assert.equal(validate("operational_snapshots", x).ok, true, JSON.stringify(validate("operational_snapshots", x).errors));
  });
});

/* ---------------------------- ESTADO SOMBRA ------------------------------- */
describe("estado sombra da Conferencia", () => {
  const snap = (over) => Object.assign({
    snapshot_at: T0, window_minutes: 5, active_orders: 10,
    received_in_window: 1, ready_in_window: 1, concluded_in_window: 1,
    convergence: 1, avg_ready_minutes: 20, queue_delta: 0,
    source_state: S.SOURCE_STATES.AVAILABLE, confidence: S.CONFIDENCE.HIGH, rule_version: "x"
  }, over || {});

  test("faixas base: <30 calmo, 30-49 fluindo, 50-69 atencao, 70+ urgencia", () => {
    assert.equal(baseStateFromLoad(29), S.CONFERENCE_STATES.CALM);
    assert.equal(baseStateFromLoad(30), S.CONFERENCE_STATES.FLOWING);
    assert.equal(baseStateFromLoad(49), S.CONFERENCE_STATES.FLOWING);
    assert.equal(baseStateFromLoad(50), S.CONFERENCE_STATES.ATTENTION);
    assert.equal(baseStateFromLoad(69), S.CONFERENCE_STATES.ATTENTION);
    assert.equal(baseStateFromLoad(70), S.CONFERENCE_STATES.URGENCY);
  });

  test("ATENCAO ABAIXO DE 50 por convergencia forte", () => {
    const st = evaluateShadowState({ snapshot: snap({ active_orders: 46, convergence: 12 }) });
    assert.equal(st.base_state, S.CONFERENCE_STATES.FLOWING);
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.ATTENTION);
    assert.ok(st.modifiers.includes("HIGH_CONVERGENCE"));
    assert.ok(st.reasons.some((r) => r.code === "HIGH_CONVERGENCE"));
  });

  test("atencao abaixo de 50 por fila crescendo", () => {
    const st = evaluateShadowState({
      snapshot: snap({ active_orders: 40, convergence: 1 }),
      rhythm: { growing_windows: 3, inflow: 9, outflow: 2, inflow_over_outflow: true, ready_growth_ratio: null, avg_ready_minutes: 20 }
    });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.ATTENTION);
    assert.ok(st.modifiers.includes("QUEUE_GROWING"));
  });

  test("atencao por tempo ate pronto crescendo", () => {
    const st = evaluateShadowState({
      snapshot: snap({ active_orders: 35 }),
      rhythm: { growing_windows: 0, inflow: 1, outflow: 1, inflow_over_outflow: false, ready_growth_ratio: 1.6, avg_ready_minutes: 32 }
    });
    assert.ok(st.modifiers.includes("READY_TIME_GROWING"));
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.ATTENTION);
  });

  test("modificador nao eleva estado em operacao muito pequena (piso)", () => {
    const st = evaluateShadowState({ snapshot: snap({ active_orders: 5, convergence: 20 }) });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.CALM);
  });

  test("fonte indisponivel: nunca afirma estado operacional", () => {
    const st = evaluateShadowState({ snapshot: snap({ source_state: S.SOURCE_STATES.UNAVAILABLE }) });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.SOURCE_UNAVAILABLE);
    assert.equal(st.confidence, S.CONFIDENCE.LOW);
  });

  test("fonte inconsistente vira leitura parcial, nao estado confiante", () => {
    const st = evaluateShadowState({ snapshot: snap({ source_state: S.SOURCE_STATES.INCONSISTENT }) });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.PARTIAL_READING);
  });

  test("sem sinal de ativos: leitura parcial, jamais 'calmo' falso", () => {
    const st = evaluateShadowState({ snapshot: snap({ active_orders: null, convergence: null, source_state: S.SOURCE_STATES.PARTIAL }) });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.PARTIAL_READING);
    assert.notEqual(st.suggested_state, S.CONFERENCE_STATES.CALM);
    assert.ok(st.missing_data.includes("pedidos_ativos"));
  });

  test("fonte degradada rebaixa a confianca", () => {
    const st = evaluateShadowState({ snapshot: snap({ source_state: S.SOURCE_STATES.DELAYED }) });
    assert.equal(st.confidence, S.CONFIDENCE.MEDIUM);
  });

  test("saida e sempre sombra, decomponivel e versionada", () => {
    const st = evaluateShadowState({ snapshot: snap() });
    assert.equal(st.mode, "shadow");
    assert.ok(Array.isArray(st.reasons) && st.reasons.length);
    assert.ok(st.rule_version.startsWith("conference-shadow"));
    assert.equal(validate("conference_state", st).ok, true);
  });

  test("modo 'active' e recusado pelo contrato no Sprint 1", () => {
    const st = evaluateShadowState({ snapshot: snap() });
    const forced = Object.assign({}, st, { mode: "active" });
    assert.equal(validate("conference_state", forced).ok, false);
  });
});

/* ----------------------------- COMPOSICAO --------------------------------- */
describe("composicao (contexto, nunca estado global)", () => {
  const seed = require(path.join(R, "data/cardapio_knowledge_seed.json")).itens;
  const cat = buildCatalogIndex(seed);

  test("composicao NUNCA promove urgencia global sozinha", () => {
    const h = orderHints({ order_id: "p" }, [
      { line_index: 0, raw_name: "Combinado Kids", normalized_name: "combinado kids", quantity: 30 }
    ], cat);
    assert.equal(h.affects_global_state, false);
    const st = evaluateShadowState({
      snapshot: {
        snapshot_at: T0, window_minutes: 5, active_orders: 5, received_in_window: 1,
        ready_in_window: 0, concluded_in_window: 0, convergence: 0, avg_ready_minutes: 10,
        queue_delta: 0, source_state: S.SOURCE_STATES.AVAILABLE, confidence: "alta", rule_version: "x"
      }
    });
    assert.equal(st.suggested_state, S.CONFERENCE_STATES.CALM);
  });

  test("restricao alimentar so quando DECLARADA em texto", () => {
    const com = orderHints({ order_id: "a" }, [{ line_index: 0, raw_name: "Temaki", normalized_name: "temaki", quantity: 1, observation: "tenho alergia a camarao" }], cat);
    assert.ok(com.hints.some((x) => x.code === "DECLARED_RESTRICTION"));
    const sem = orderHints({ order_id: "b" }, [{ line_index: 0, raw_name: "Camarão Empanado", normalized_name: "camarao empanado", quantity: 1 }], cat);
    assert.ok(!sem.hints.some((x) => x.code === "DECLARED_RESTRICTION"), "nao inferir alergia pelo nome do prato");
  });

  test("muitas unidades e possivel multiplo volume sao sinalizados", () => {
    const h = orderHints({ order_id: "c" }, [{ line_index: 0, raw_name: "Temaki", normalized_name: "temaki", quantity: 20 }], cat);
    assert.ok(h.hints.some((x) => x.code === "MANY_UNITS"));
    assert.ok(h.hints.some((x) => x.code === "POSSIBLE_MULTI_VOLUME"));
  });

  test("item sem correspondencia e declarado, nao adivinhado", () => {
    const h = orderHints({ order_id: "d" }, [{ line_index: 0, raw_name: "Prato Inexistente XYZ", normalized_name: "prato inexistente xyz", quantity: 1 }], cat);
    assert.ok(h.hints.some((x) => x.code === "CATALOG_MATCH_INCOMPLETE"));
    assert.equal(h.facts.unmatched_items, 1);
  });

  test("nao existe peso/score de complexidade por prato", () => {
    const h = orderHints({ order_id: "e" }, [{ line_index: 0, raw_name: "Temaki", normalized_name: "temaki", quantity: 1 }], cat);
    const s = JSON.stringify(h);
    assert.ok(!/complexity_score|peso|weight|score/i.test(s));
  });

  test("o campo generico risco_de_erro do seed nao e usado", () => {
    const src = require("node:fs").readFileSync(path.join(R, "src/conference-brain/composition/hints.js"), "utf8");
    assert.ok(!/\brisco_de_erro\b\s*[=:]/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
  });
});

/* ------------------------------- FLAGS ------------------------------------ */
describe("feature flags", () => {
  test("desligadas em producao, habilitaveis em teste", () => {
    assert.equal(F.conferenceBrainFoundationV1({ NODE_ENV: "production" }), false);
    assert.equal(F.conferenceShadowStateV1({ NODE_ENV: "production" }), false);
    assert.equal(F.conferenceCompositionHintsV1({ NODE_ENV: "production" }), false);
    assert.equal(F.conferenceBrainFoundationV1({ NODE_ENV: "test" }), true);
  });

  test("estado sombra e composicao exigem a fundacao ligada", () => {
    const env = { NODE_ENV: "production", CONFERENCE_SHADOW_STATE_V1: "1", CONFERENCE_COMPOSITION_HINTS_V1: "1" };
    assert.equal(F.conferenceShadowStateV1(env), false);
    assert.equal(F.conferenceCompositionHintsV1(env), false);
  });

  test("decisao automatica e o estado sombra nunca dirigem o produto", () => {
    assert.equal(F.automaticDecisionsEnabled(), false);
    assert.equal(F.shadowStateMayDriveProduct(), false);
    assert.equal(F.automaticDecisionsEnabled({ NODE_ENV: "production", QUALQUER: "1" }), false);
  });
});

/* --------------------------- COMPATIBILIDADE ------------------------------ */
describe("compatibilidade com o que ja existe", () => {
  test("celulas operacionais seguem intactas", () => {
    const CEL = require(path.join(R, "src/live/interface/celulas-operacionais"));
    assert.equal(typeof CEL.leituraCaixa, "function");
    assert.equal(typeof CEL.estadoAgregado, "function");
  });

  test("adaptador V3.3 e o vocabulario das areas seguem intactos", () => {
    const AD = require(path.join(R, "src/live/interface/adaptador-v33"));
    assert.equal(AD.areaHintFromSit("praca", "cozinha_quentes"), "Cozinha");
    assert.equal(AD.areaHintFromSit("praca", "enrolados_quentes"), "Quentes");
    assert.ok(AD.AREA_ORDER.includes("Entregas"));
  });

  test("Capacidade Viva continua em sombra, sem decisao automatica", () => {
    const cfg = require(path.join(R, "src/capacidade-viva/shadow/config")).loadShadowConfig();
    assert.equal(cfg.status, "shadow_only");
    assert.equal(cfg.automatic_decisions_allowed, false);
  });

  test("shadow config mantem o hash canonico", () => {
    const C = require(path.join(R, "src/capacidade-viva/shadow/config"));
    const cfg = C.loadShadowConfig();
    assert.equal(cfg.ready, true);
    assert.equal(cfg.actual_sha256, C.METADATA.expected_sha256);
  });

  test("o cerebro da Conferencia nao depende de ENTREGAS", () => {
    const fs = require("node:fs");
    const dir = path.join(R, "src/conference-brain");
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const f of walk(dir)) {
      const src = fs.readFileSync(f, "utf8");
      assert.ok(!/require\([^)]*entregas/i.test(src), "dependencia de ENTREGAS em " + f);
    }
  });

  test("nenhum campo de PII nos contratos", () => {
    const { FORBIDDEN_FIELDS } = require(path.join(R, "src/conference-brain/contracts/schemas"));
    const bad = validate("orders", {
      order_id: "1", external_id: "1", channel: "iFood", status: "recebido",
      first_observed_at: T0, last_observed_at: T0, confidence: "alta", source: "s", telefone: "9"
    });
    assert.equal(bad.ok, false);
    assert.ok(FORBIDDEN_FIELDS.includes("telefone"));
  });
});

/* ------------------------ ADAPTADOR HISTORICO ----------------------------- */
describe("adaptador historico", () => {
  test("extrai cards de relatorio diario com itens e observacao", () => {
    const html = `<div class="order-card status-concluded">
      <span class="order-id-text">#abc-123</span>
      <span class="order-time">🕐 21:02</span>
      <span class="badge badge-concluded">CONCLUDED</span>
      <span class="order-total">R$ 70,98</span>
      <td class="col-name">Temaki de Salmão</td><td class="col-qty">2</td>
      <div class="obs-text">sem cebola</div></div>`;
    const { rows } = extractOrderCards(html, "01/07/2026");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].oid, "abc-123");
    assert.equal(rows[0].dt, "01/07/2026 21:02");
    assert.match(rows[0].itens_html, /2x Temaki de Salmão/);
    assert.match(rows[0].itens_html, /sem cebola/);
  });

  test("sem data do relatorio, dt fica nulo (nao inventa o dia)", () => {
    const html = `<div class="order-card"><span class="order-id-text">#z</span><span class="order-time">🕐 10:00</span></div>`;
    const { rows } = extractOrderCards(html, null);
    assert.equal(rows[0].dt, null);
  });

  test("infere a data do relatorio pelo caminho", () => {
    assert.equal(inferReportDate("x/ifood_2026-07-01/relatorio.html"), "01/07/2026");
  });

  test("arquivo inexistente vira issue, nao excecao", () => {
    const ad = createHistoricalHtmlAdapter("caminho/que/nao/existe.html");
    assert.deepEqual(ad.observe(), []);
    assert.equal(ad.issues[0].error, "arquivo_inexistente");
  });
});

/* ------------------------ VERSIONAMENTO DE REGRA -------------------------- */
describe("versionamento de regra", () => {
  test("toda regra do Sprint 1 nasce em sombra e pode reverter", () => {
    for (const r of [RV.LOAD_BANDS_V1, RV.CONFERENCE_SHADOW_V1, RV.SNAPSHOT_WINDOW_V1, RV.COMPOSITION_HINTS_V1]) {
      assert.equal(r.mode, "shadow");
      assert.ok(r.id && r.version && r.date && r.source);
      assert.ok("revert_to" in r);
    }
  });

  test("regra sem identidade e recusada", () => {
    assert.throws(() => RV.defineRule({ id: "x" }), /obrigatorios/);
  });
});
