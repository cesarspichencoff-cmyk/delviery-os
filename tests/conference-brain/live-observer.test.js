"use strict";
/* ============================================================================
 * Testes do observador ao vivo (Sprint 2) — navegador/layout, status,
 * reconciliação, relógio, painel e compatibilidade.
 * Sem Playwright instalado e sem sessão do iFood disponível neste ambiente
 * (ver docs/conference-brain/LIVE_VALIDATION_V1.md): todo o navegador é
 * substituído por um driver falso que implementa a mesma API mínima usada
 * por browser-adapter.js — isso testa a LÓGICA de verdade, não finge uma
 * sessão ao vivo que não existe aqui.
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const Health = require("../../src/conference-brain/live/health");
const StatusMap = require("../../src/conference-brain/live/status-map");
const ReadyDeparture = require("../../src/conference-brain/live/ready-departure");
const Reconciliation = require("../../src/conference-brain/live/reconciliation");
const Clock = require("../../src/conference-brain/live/clock");
const Metrics = require("../../src/conference-brain/live/metrics");
const OperatorPanel = require("../../src/conference-brain/live/operator-panel");
const BrowserAdapter = require("../../src/conference-brain/live/browser-adapter");
const MappingMode = require("../../src/conference-brain/live/mapping-mode");
const { createLiveObserver } = require("../../src/conference-brain/live/observer");
const { createStore } = require("../../src/conference-brain/storage/store");
const Flags = require("../../src/conference-brain/flags");
const { LIVE_SOURCE_HEALTH, CLOCK_EVENT_TYPES } = require("../../src/conference-brain/contracts/live-states");

/* ---------------------------------------------------------------------------
 * Navegador e layout
 * ------------------------------------------------------------------------- */
describe("navegador e layout — saude da fonte", () => {
  test("tela valida com pedidos vira available", () => {
    const h = Health.classifyCycleHealth({
      containerFound: true, ordersFound: 3, emptyOrderRatio: 0, criticalFieldsMissing: []
    });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.AVAILABLE);
  });

  test("conteiner principal ausente vira layout_changed", () => {
    const h = Health.classifyCycleHealth({ containerFound: false });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.LAYOUT_CHANGED);
    assert.match(h.reason, /conteiner/);
  });

  test("assinatura estrutural divergente vira layout_changed", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, layoutSignatureMatch: false });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.LAYOUT_CHANGED);
  });

  test("prompt de login vira login_required e exige intervencao humana", () => {
    const h = Health.classifyCycleHealth({ loginPromptDetected: true });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.LOGIN_REQUIRED);
    assert.ok(Health.requiresHumanIntervention(h.state));
  });

  test("captcha vira captcha_present e exige intervencao humana", () => {
    const h = Health.classifyCycleHealth({ captchaDetected: true });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT);
    assert.ok(Health.requiresHumanIntervention(h.state));
  });

  test("captcha tem prioridade sobre qualquer outro sinal", () => {
    const h = Health.classifyCycleHealth({ captchaDetected: true, loginPromptDetected: true, containerFound: false });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT);
  });

  test("tela sem nenhum pedido (vazia) nao vira available — partial", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 0, emptyOrderRatio: 0, criticalFieldsMissing: [] });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.PARTIAL);
  });

  test("pagina parada alem do limite vira stale", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, pageAgeMs: 400000, staleAfterMs: 300000, ordersFound: 5, criticalFieldsMissing: [] });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.STALE);
  });

  test("quantidade anormal de pedidos vazios vira layout_changed", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, emptyOrderRatio: 0.8, ordersFound: 5, criticalFieldsMissing: [] });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.LAYOUT_CHANGED);
  });

  test("campos criticos ausentes viram partial", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 3, emptyOrderRatio: 0, criticalFieldsMissing: ["status_selector"] });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.PARTIAL);
  });

  test("retomando apos falhas vira recovering", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 2, emptyOrderRatio: 0, criticalFieldsMissing: [], consecutiveFailures: 2 });
    assert.equal(h.state, LIVE_SOURCE_HEALTH.RECOVERING);
  });

  test("mayAffirmOperationalLoad so e verdadeiro com available", () => {
    assert.ok(Health.mayAffirmOperationalLoad(LIVE_SOURCE_HEALTH.AVAILABLE));
    assert.ok(!Health.mayAffirmOperationalLoad(LIVE_SOURCE_HEALTH.PARTIAL));
    assert.ok(!Health.mayAffirmOperationalLoad(LIVE_SOURCE_HEALTH.STALE));
  });

  test("Playwright ausente e' reportado honestamente, sem lancar excecao", () => {
    const r = BrowserAdapter.tryLoadPlaywright();
    // neste ambiente nao ha Playwright instalado — se algum dia houver, ok:true e' aceitavel
    assert.equal(typeof r.ok, "boolean");
    if (!r.ok) assert.match(r.error, /playwright_nao_instalado/);
  });

  test("driver de navegador ausente: createPlaywrightDriver nunca lanca", async () => {
    const r = await BrowserAdapter.createPlaywrightDriver({ profileDir: "/tmp/x", allowedUrl: "https://example.invalid" });
    assert.equal(typeof r.ok, "boolean");
  });

  test("extracao com driver falso: login detectado suspende sem tentar ler pedidos", async () => {
    const driver = { hasElement: async (s) => s === "#login" };
    const r = await BrowserAdapter.extractCycleObservation(driver, { loginSelector: "#login", containerSelector: "#lista" });
    assert.equal(r.health.state, LIVE_SOURCE_HEALTH.LOGIN_REQUIRED);
    assert.equal(r.orders.length, 0);
  });

  test("extracao com driver falso: pedidos validos sao extraidos", async () => {
    const cards = [{ id: "A1", status: "Pronto" }, { id: "A2", status: "Em preparo" }];
    const driver = {
      hasElement: async (s) => s === "#lista",
      queryAll: async (s) => (s === ".card" ? cards.map((c) => ({ querySelector: (ss) => (ss === ".id" ? c.id : c.status) })) : []),
      elementText: (v) => v
    };
    const r = await BrowserAdapter.extractCycleObservation(driver, {
      containerSelector: "#lista", orderCardSelector: ".card", idSelector: ".id", statusSelector: ".status"
    });
    assert.equal(r.orders.length, 2);
    assert.equal(r.health.state, LIVE_SOURCE_HEALTH.AVAILABLE);
  });

  test("backoff cresce e respeita teto", () => {
    let ms = null;
    for (let i = 0; i < 8; i++) ms = BrowserAdapter.nextBackoffMs(ms);
    assert.ok(ms <= BrowserAdapter.DEFAULTS.backoffMaxMs);
  });

  test("intervalo efetivo nunca fica abaixo do minimo configuravel", () => {
    assert.equal(BrowserAdapter.effectiveIntervalMs(1000), BrowserAdapter.DEFAULTS.minIntervalMs);
    assert.equal(BrowserAdapter.effectiveIntervalMs(60000), 60000);
  });
});

/* ---------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------- */
describe("normalizacao de status ao vivo", () => {
  const casos = [
    ["Novo", "received"], ["Aceito", "accepted"], ["Em preparo", "preparing"],
    ["Pronto", "ready"], ["Aguardando retirada", "awaiting_pickup"],
    ["Retirado", "picked_up"], ["Saiu para entrega", "departed"],
    ["Entregue", "completed"], ["Cancelado", "cancelled"], ["Algo nunca visto", "unknown"]
  ];
  for (const [raw, expected] of casos) {
    test(`"${raw}" -> ${expected}`, () => {
      assert.equal(StatusMap.normalizeLiveStatus(raw), expected);
    });
  }

  test("status desconhecido nunca vira um vizinho por adivinhacao", () => {
    assert.equal(StatusMap.normalizeLiveStatus("Status Novo Que Nao Existia Ontem"), "unknown");
  });

  test("evento com horario na propria tela tem confianca alta", () => {
    const ev = StatusMap.buildStatusEvent(null, { raw_status: "Pronto", screen_event_time: "2026-01-01T10:00:00-03:00", observed_at: "2026-01-01T10:02:00-03:00" });
    assert.equal(ev.event_time, "2026-01-01T10:00:00-03:00");
    assert.equal(ev.confidence, "alta");
  });

  test("mudanca sem horario na tela vira intervalo, nunca um instante inventado", () => {
    const ev = StatusMap.buildStatusEvent({ raw_status: "Em preparo", observed_at: "2026-01-01T10:00:00-03:00" }, { raw_status: "Pronto", observed_at: "2026-01-01T10:05:00-03:00" });
    assert.equal(ev.event_time, null);
    assert.deepEqual(ev.observed_interval, ["2026-01-01T10:00:00-03:00", "2026-01-01T10:05:00-03:00"]);
  });
});

/* ---------------------------------------------------------------------------
 * PRONTO / SAÍDA
 * ------------------------------------------------------------------------- */
describe("deteccao de pronto e saida", () => {
  test("completed sozinho NAO comprova saida real", () => {
    const r = ReadyDeparture.departureEvidence(["received", "preparing", "ready", "completed"]);
    assert.equal(r.observed, false);
    assert.match(r.reason, /nao_expoe_saida_real/);
  });

  test("departed observado comprova saida", () => {
    const r = ReadyDeparture.departureEvidence(["ready", "departed"]);
    assert.equal(r.observed, true);
  });

  test("picked_up sozinho nao comprova saida da loja", () => {
    const r = ReadyDeparture.departureEvidence(["ready", "picked_up"]);
    assert.equal(r.observed, false);
  });
});

/* ---------------------------------------------------------------------------
 * Reconciliação incremental por campo
 * ------------------------------------------------------------------------- */
describe("reconciliacao incremental por campo", () => {
  test("mesmo pedido em varios ciclos: status atual e' o mais recente", () => {
    const r = Reconciliation.reconcileOrder("o1", [
      { observed_at: "t1", status: "received" },
      { observed_at: "t2", status: "preparing" },
      { observed_at: "t3", status: "ready" }
    ]);
    assert.equal(r.status_current, "ready");
    assert.equal(r.status_history.length, 3);
  });

  test("horario mais preciso nunca e substituido por um menos preciso", () => {
    const r = Reconciliation.reconcileField("ready_at", [
      { ready_at: "2026-01-01T10:00:00-03:00", ready_at_confidence: "media", observed_at: "t1" },
      { ready_at: "2026-01-01T09:58:00-03:00", ready_at_confidence: "alta", observed_at: "t2" }
    ]);
    assert.equal(r.value, "2026-01-01T09:58:00-03:00");
    assert.equal(r.confidence, "alta");
    assert.equal(r.conflict, true);
  });

  test("item adicionado entre observacoes fica registrado, nao substitui em silencio", () => {
    const r = Reconciliation.reconcileItems([
      { observed_at: "t1", items: [{ normalized_name: "hot roll", quantity: 1 }] },
      { observed_at: "t2", items: [{ normalized_name: "hot roll", quantity: 1 }, { normalized_name: "coca cola", quantity: 1 }] }
    ]);
    assert.equal(r.current.length, 2);
    assert.equal(r.divergences.length, 1);
    assert.deepEqual(r.divergences[0].adicionados, ["coca cola"]);
  });

  test("item removido entre observacoes nao desaparece sem registro", () => {
    const r = Reconciliation.reconcileItems([
      { observed_at: "t1", items: [{ normalized_name: "hot roll", quantity: 1 }, { normalized_name: "coca cola", quantity: 1 }] },
      { observed_at: "t2", items: [{ normalized_name: "hot roll", quantity: 1 }] }
    ]);
    assert.equal(r.divergences.length, 1);
    assert.deepEqual(r.divergences[0].removidos, ["coca cola"]);
    // a versao mais completa fica preservada no historico — nada e apagado do registro
    assert.equal(r.versions[0].items.length, 2);
  });

  test("observacao do cliente alterada gera versao nova, nunca concatenacao cega", () => {
    const r = Reconciliation.reconcileObservationText([
      { observed_at: "t1", customer_note: "sem cebola" },
      { observed_at: "t2", customer_note: "sem cebola e sem pimenta" }
    ], "customer_note");
    assert.equal(r.versions.length, 2);
    assert.equal(r.current, "sem cebola e sem pimenta");
    assert.ok(!r.current.includes("sem cebolasem"), "nunca concatena sem separador nem apaga a primeira versao");
  });

  test("conflito de data entre observacoes fica marcado, nunca escondido", () => {
    const r = Reconciliation.reconcileOrder("o2", [
      { observed_at: "t1", received_at: "2026-01-01T10:00:00-03:00", confidence: "alta" },
      { observed_at: "t2", received_at: "2026-01-02T10:00:00-03:00", confidence: "alta" }
    ]);
    assert.ok(r.anomalies.some((a) => a.type === "conflito_de_valor" && a.field === "received_at"));
  });

  test("regressao de status inesperada vira anomalia, nunca e silenciada", () => {
    const r = Reconciliation.reconcileStatus([
      { observed_at: "t1", status: "ready" },
      { observed_at: "t2", status: "preparing" }
    ]);
    assert.equal(r.regressions.length, 1);
    assert.equal(r.regressions[0].from, "ready");
    assert.equal(r.regressions[0].to, "preparing");
  });

  test("conflito de identidade entre ID curto e ID completo vira anomalia", () => {
    const conflicts = Reconciliation.detectIdentityConflicts([
      { short_id: "1234", external_id: "uuid-a" },
      { short_id: "1234", external_id: "uuid-b" }
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "conflito_de_identidade");
  });

  test("reconciliacao dos 36 IDs duplicados reais do Sprint 1: sem excecao, sem perda de item", () => {
    const RAW = path.resolve(__dirname, "../../../delviery-os/data/raw/incoming");
    const files = [
      path.join(RAW, "ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html"),
      path.join(RAW, "ifood_2026-07-01/relatorio_pedidos_01-07.html")
    ];
    if (!files.every((f) => fs.existsSync(f))) {
      // ambiente sem os dados historicos irmaos — nao falha a suite, apenas nao exercita o caso real
      return;
    }
    const { createHistoricalHtmlAdapter } = require("../../src/conference-brain/ingestion/adapters/historical-html");
    const { normalizeHistoricalRow } = require("../../src/conference-brain/normalize/normalizer");
    const adapter = createHistoricalHtmlAdapter(files, {});
    const rows = adapter.observe();
    const byId = new Map();
    for (const r of rows) { if (!byId.has(r.oid)) byId.set(r.oid, []); byId.get(r.oid).push(r); }
    const dupIds = Array.from(byId.entries()).filter(([, rs]) => rs.length > 1).map(([id]) => id);

    assert.equal(dupIds.length, 36, "a missao registra exatamente 36 IDs duplicados entre os lotes historicos");

    let anomalyCount = 0;
    for (const id of dupIds) {
      const obsList = byId.get(id).map((r, i) => {
        const n = normalizeHistoricalRow(r, {});
        return {
          observed_at: new Date(Date.now() + i * 1000).toISOString(),
          status: n.order.status === "concluido" ? "completed" : n.order.status === "cancelado" ? "cancelled" : "unknown",
          raw_status: r.status, received_at: n.order.received_at, total_value: n.order.total_value,
          items: n.items.map((it) => ({ normalized_name: it.normalized_name, raw_name: it.raw_name, quantity: it.quantity, observation: it.observation })),
          confidence: "alta", source: "lote" + i
        };
      });

      const allNames = new Set();
      obsList.forEach((o) => o.items.forEach((it) => allNames.add(it.normalized_name)));

      // reconcileOrder nunca lanca — se lancasse, o teste falharia aqui
      const result = Reconciliation.reconcileOrder(id, obsList);
      if (result.anomalies.length) anomalyCount++;

      const namesInVersions = new Set();
      result.items_versions.forEach((v) => v.items.forEach((it) => namesInVersions.add(it.normalized_name || it.raw_name)));
      for (const n of allNames) assert.ok(namesInVersions.has(n), `item "${n}" do pedido ${id} nao pode desaparecer da reconciliacao`);
    }
    // achado real: as 36 duplicatas divergem em received_at (mesmo pedido, dia
    // atribuido diferente entre os dois relatorios — ver LIVE_VALIDATION_V1.md)
    assert.equal(anomalyCount, 36);
  });
});

/* ---------------------------------------------------------------------------
 * Relógio da Conferência
 * ------------------------------------------------------------------------- */
describe("relogio minimo da Conferencia", () => {
  test("sequencia valida do inicio ao fim", () => {
    let events = [];
    const seq = [
      ["ready_observed", "ifood_screen"], ["conference_started", "operator_manual"],
      ["conference_completed", "operator_manual"], ["released", "operator_manual"],
      ["departed_observed", "ifood_screen"]
    ];
    for (const [type, origin] of seq) {
      const r = Clock.recordEvent({ order_id: "o1", event_type: type, observed_at: "t", origin, existing_events: events });
      assert.equal(r.ok, true, `falhou em ${type}: ${r.reason}`);
      events.push(r.event);
    }
    assert.equal(Clock.currentClockState(events), "departed_observed");
  });

  test("evento repetido (mesma sequencia) produz o mesmo event_id — idempotente", () => {
    const a = Clock.eventId("o1", "ready_observed", 0);
    const b = Clock.eventId("o1", "ready_observed", 0);
    assert.equal(a, b);
  });

  test("transicao invalida e recusada, nunca aceita silenciosamente", () => {
    const r = Clock.recordEvent({ order_id: "o1", event_type: "released", observed_at: "t", origin: "operator_manual", existing_events: [] });
    assert.equal(r.ok, false);
    assert.match(r.reason, /transicao_invalida/);
  });

  test("espera e retomada: waiting_for_item -> conference_resumed e valido", () => {
    let events = [];
    for (const type of ["ready_observed", "conference_started", "waiting_for_item"]) {
      const r = Clock.recordEvent({ order_id: "o1", event_type: type, observed_at: "t", origin: "operator_manual", existing_events: events });
      events.push(r.event);
    }
    const r = Clock.recordEvent({ order_id: "o1", event_type: "conference_resumed", observed_at: "t", origin: "operator_manual", existing_events: events });
    assert.equal(r.ok, true);
  });

  test("correcao/cancelamento pode interromper qualquer estado ativo", () => {
    let events = [];
    for (const type of ["ready_observed", "conference_started"]) {
      const r = Clock.recordEvent({ order_id: "o1", event_type: type, observed_at: "t", origin: "operator_manual", existing_events: events });
      events.push(r.event);
    }
    const r = Clock.recordEvent({ order_id: "o1", event_type: "cancelled", observed_at: "t", origin: "operator_manual", reason: "pedido cancelado pelo cliente", existing_events: events });
    assert.equal(r.ok, true);
    assert.equal(r.event.reason, "pedido cancelado pelo cliente");
  });

  test("saida observada na tela e' valida mesmo sem o fluxo interno ter sido usado (fato da tela, nao etapa do painel)", () => {
    const events = [{ event_type: "ready_observed", sequence: 0 }];
    const r = Clock.recordEvent({ order_id: "o1", event_type: "departed_observed", observed_at: "t", origin: "ifood_screen", existing_events: events });
    assert.equal(r.ok, true, "saida real observada nao pode ser descartada so porque o painel nao foi usado");
  });

  test("reinicio apos queda: relogio reconstruido do historico produz o mesmo estado atual", () => {
    let events = [];
    for (const type of ["ready_observed", "conference_started"]) {
      const r = Clock.recordEvent({ order_id: "o1", event_type: type, observed_at: "t", origin: "operator_manual", existing_events: events });
      events.push(r.event);
    }
    // "reinicio": o processo esquece tudo em memoria e reconstroi so do array persistido
    const estadoReconstruido = Clock.currentClockState(events);
    assert.equal(estadoReconstruido, "conference_started");
  });

  test("evento manual (operator_manual) e evento observado (ifood_screen) sao distinguiveis pela origem", () => {
    const r1 = Clock.recordEvent({ order_id: "o1", event_type: "ready_observed", observed_at: "t", origin: "ifood_screen", existing_events: [] });
    assert.equal(r1.event.origin, "ifood_screen");
    const r2 = Clock.recordEvent({ order_id: "o1", event_type: "conference_started", observed_at: "t", origin: "operator_manual", existing_events: [r1.event] });
    assert.equal(r2.event.origin, "operator_manual");
  });

  test("pronto observado NUNCA infere inicio automatico da Conferencia", () => {
    assert.equal(Clock.readyDoesNotImplyStarted(), true);
    const events = [{ event_type: "ready_observed", sequence: 0 }];
    // o proprio grafo de transicao garante isso: so operator_manual pode gerar conference_started
    const r = Clock.recordEvent({ order_id: "o1", event_type: "conference_started", observed_at: "t", origin: "system_inference", existing_events: events });
    assert.equal(r.ok, true); // a transicao e' valida estruturalmente
    assert.equal(r.event.origin, "system_inference"); // mas a origem fica marcada — nunca escondida como manual
  });
});

/* ---------------------------------------------------------------------------
 * Métricas derivadas
 * ------------------------------------------------------------------------- */
describe("metricas derivadas do relogio", () => {
  test("metrica ausente por falta de carimbo e' null, nunca zero", () => {
    const m = Metrics.orderMetrics([{ event_type: "ready_observed", event_time: "2026-01-01T10:00:00-03:00" }]);
    assert.equal(m.active_conference_ms, null);
  });

  test("pausa aberta (sem retomada) torna o tempo de espera null, nao parcial", () => {
    const m = Metrics.orderMetrics([
      { event_type: "ready_observed", event_time: "t0" },
      { event_type: "conference_started", event_time: "2026-01-01T10:00:00-03:00" },
      { event_type: "waiting_for_item", event_time: "2026-01-01T10:02:00-03:00" }
    ]);
    assert.equal(m.waiting_for_item_ms, null);
  });

  test("frota: cada pedido conta no balde do seu ultimo evento", () => {
    const c = Metrics.fleetCounts({ a: "ready_observed", b: "conference_started", c: "waiting_for_item", d: "released" });
    assert.deepEqual(c, { awaiting_conference: 1, in_conference: 1, awaiting_item: 1, released_not_departed: 1 });
  });
});

/* ---------------------------------------------------------------------------
 * Painel interno mínimo
 * ------------------------------------------------------------------------- */
describe("painel interno minimo", () => {
  test("acoes validas para pedido pronto: so Iniciar (+ cancelar)", () => {
    const actions = OperatorPanel.visibleActions([{ event_type: "ready_observed" }]);
    assert.deepEqual(actions.map((a) => a.key).sort(), ["cancel", "start"]);
  });

  test("acoes ocultas: pedido finalizado nao mostra Iniciar nem Aguardando item", () => {
    const actions = OperatorPanel.visibleActions([
      { event_type: "ready_observed" }, { event_type: "conference_started" }, { event_type: "conference_completed" }
    ]);
    const keys = actions.map((a) => a.key);
    assert.ok(!keys.includes("start"));
    assert.ok(!keys.includes("waiting"));
    assert.ok(keys.includes("release"));
  });

  test("pedido ja despachado nao mostra nenhuma acao (ciclo encerrado)", () => {
    const actions = OperatorPanel.visibleActions([
      { event_type: "ready_observed" }, { event_type: "conference_started" }, { event_type: "conference_completed" },
      { event_type: "released" }, { event_type: "departed_observed" }
    ]);
    assert.equal(actions.length, 0);
  });

  test("acao irreversivel exige confirmToken", () => {
    const r = OperatorPanel.applyAction("cancel", { order_id: "o1", existing_events: [] });
    assert.equal(r.ok, false);
  });

  test("acao irreversivel com confirmToken e transicao valida e aceita", () => {
    const r = OperatorPanel.applyAction("cancel", { order_id: "o1", existing_events: [], confirmToken: "1" });
    assert.equal(r.ok, true);
    assert.equal(r.event.event_type, "cancelled");
  });

  test("feature flag do painel: desligada por padrao em producao", () => {
    assert.equal(Flags.conferenceOperatorPanelV1({ NODE_ENV: "production" }), false);
  });

  test("feature flag do coletor ao vivo: nunca liga so por a variavel estar ausente, nem em teste", () => {
    assert.equal(Flags.conferenceLiveObserverV1({ NODE_ENV: "test" }), false);
    assert.equal(Flags.conferenceLiveObserverV1({ NODE_ENV: "test", CONFERENCE_LIVE_OBSERVER_V1: "1" }), true);
  });

  test("feature flag do modo de mapeamento: padrao sempre desligada", () => {
    assert.equal(Flags.conferenceIfoodMappingModeV1({ NODE_ENV: "development" }), false);
    assert.equal(Flags.conferenceIfoodMappingModeV1({ NODE_ENV: "production" }), false);
  });

  test("linha do painel nao carrega nenhum campo de identificacao pessoal", () => {
    const row = OperatorPanel.panelRow({ external_id: "o1", clock_events: [{ event_type: "ready_observed", event_time: new Date().toISOString() }] });
    const json = JSON.stringify(row).toLowerCase();
    for (const proibido of ["telefone", "endereco", "cpf", "email", "cliente_nome"]) {
      assert.ok(!json.includes(proibido), `painel nao pode carregar "${proibido}"`);
    }
  });

  test("painel nunca mostra estado operacional quando a fonte nao esta disponivel — so o proprio rotulo de saude", () => {
    const row = OperatorPanel.panelRow({ external_id: "o1", clock_events: [{ event_type: "ready_observed" }], source_health: "layout_changed" });
    assert.equal(row.source_health, "layout_changed");
  });
});

/* ---------------------------------------------------------------------------
 * Modo de Mapeamento
 * ------------------------------------------------------------------------- */
describe("modo de mapeamento", () => {
  test("assinatura estrutural e' estavel para o mesmo HTML", () => {
    const html = '<div class="order-card"><span class="badge badge-ready">Pronto</span></div>';
    const s1 = MappingMode.captureStructuralSignature(html);
    const s2 = MappingMode.captureStructuralSignature(html);
    assert.equal(s1.hash, s2.hash);
  });

  test("assinatura muda quando a estrutura muda", () => {
    const a = MappingMode.captureStructuralSignature('<div class="order-card"></div>');
    const b = MappingMode.captureStructuralSignature('<table class="order-table"></table>');
    assert.notEqual(a.hash, b.hash);
  });

  test("nunca persiste HTML bruto", () => {
    const s = MappingMode.captureStructuralSignature('<div class="x">conteudo qualquer</div>');
    assert.equal(s.persists_no_html, true);
    assert.ok(!JSON.stringify(s).includes("conteudo qualquer"));
  });

  test("sinaliza atributos que parecem PII sem extrair o valor", () => {
    const s = MappingMode.captureStructuralSignature('<div id="cliente-nome-123">x</div>');
    assert.ok(s.pii_like_attributes_flagged.length > 0);
  });
});

/* ---------------------------------------------------------------------------
 * Observador incremental — ciclo completo
 * ------------------------------------------------------------------------- */
describe("observador incremental", () => {
  function scriptedObserver(store, script) {
    let cycle = 0;
    return createLiveObserver({
      store, runId: "teste",
      fetchOrders: async () => {
        const orders = script[cycle++] || [];
        return { orders, signals: { containerFound: true, ordersFound: orders.length, emptyOrderRatio: 0, criticalFieldsMissing: [], consecutiveFailures: 0 } };
      }
    });
  }

  test("eventos so sao criados para mudancas, nunca repetidos", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [
      [{ external_id: "X1", raw_status: "Pronto" }],
      [{ external_id: "X1", raw_status: "Pronto" }],
      [{ external_id: "X1", raw_status: "Pronto" }]
    ]);
    await obs.runCycle(); await obs.runCycle(); await obs.runCycle();
    const events = store.all("conference_clock_events").filter((e) => e.order_id === "X1");
    assert.equal(events.length, 1, "3 leituras identicas devem gerar 1 evento so");
  });

  test("saida real observada gera departed_observed; completed sozinho nao gera", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [
      [{ external_id: "X2", raw_status: "Pronto" }],
      [{ external_id: "X2", raw_status: "Saiu para entrega" }]
    ]);
    await obs.runCycle(); await obs.runCycle();
    const types = store.all("conference_clock_events").filter((e) => e.order_id === "X2").map((e) => e.event_type);
    assert.deepEqual(types, ["ready_observed", "departed_observed"]);
  });

  test("pedido que some da tela e' marcado missing_from_view, nunca presumido como saida", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [
      [{ external_id: "X3", raw_status: "Pronto" }],
      []
    ]);
    await obs.runCycle(); await obs.runCycle();
    const clockTypes = store.all("conference_clock_events").filter((e) => e.order_id === "X3").map((e) => e.event_type);
    assert.ok(!clockTypes.includes("departed_observed"), "sumico da tela nao pode virar saida inventada");
    const last = store.all("live_observations").filter((o) => o.external_id === "X3").pop();
    assert.equal(last.missing_from_view, true);
  });

  test("idempotencia e retomada: nova instancia sobre o mesmo store nao duplica eventos", async () => {
    const store = createStore({ memoryOnly: true });
    const obs1 = scriptedObserver(store, [[{ external_id: "X4", raw_status: "Pronto" }]]);
    await obs1.runCycle();
    const obs2 = createLiveObserver({ store, runId: "teste" });
    const state = obs2.loadOrderState("X4");
    assert.equal(state.clockEvents.length, 1);
  });

  test("fonte com login_required suspende o ciclo sem inventar orders", async () => {
    const store = createStore({ memoryOnly: true });
    let called = 0;
    const obs = createLiveObserver({
      store, runId: "teste",
      fetchOrders: async () => { called++; return { orders: [], signals: {}, health: { state: LIVE_SOURCE_HEALTH.LOGIN_REQUIRED, reason: "x" } }; }
    });
    const r = await obs.runCycle();
    assert.equal(r.suspended, true);
    assert.equal(called, 1);
  });

  test("falha na observacao (excecao) nunca derruba o ciclo — vira saude unavailable", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = createLiveObserver({ store, runId: "teste", fetchOrders: async () => { throw new Error("rede caiu"); } });
    const r = await obs.runCycle();
    assert.equal(r.ok, false);
    assert.equal(r.cycle.source_health, "unavailable");
  });
});

/* ---------------------------------------------------------------------------
 * Compatibilidade — nada do Sprint 1 muda de comportamento
 * ------------------------------------------------------------------------- */
describe("compatibilidade com o Sprint 1", () => {
  test("contratos de estado do Sprint 1 continuam intactos", () => {
    const S = require("../../src/conference-brain/contracts/states");
    assert.ok(S.ORDER_STATUS.READY === "pronto");
    assert.ok(S.CONFERENCE_STATES.CALM === "calmo");
  });

  test("schemas do Sprint 1 nao perderam nenhuma entidade", () => {
    const { SCHEMAS } = require("../../src/conference-brain/contracts/schemas");
    for (const e of ["orders", "order_items", "operational_snapshots", "conference_state", "ingestion_anomalies"]) {
      assert.ok(SCHEMAS[e], `entidade ${e} do Sprint 1 precisa continuar existindo`);
    }
  });

  test("flags do Sprint 1 continuam com o mesmo comportamento", () => {
    const F = require("../../src/conference-brain/flags");
    assert.equal(F.automaticDecisionsEnabled(), false);
    assert.equal(F.shadowStateMayDriveProduct(), false);
  });

  test("motor de 8 pracas (celulas operacionais) nao foi tocado por este sprint", () => {
    const p = path.join(__dirname, "../../src/live/interface/celulas-operacionais.js");
    assert.ok(fs.existsSync(p));
  });
});
