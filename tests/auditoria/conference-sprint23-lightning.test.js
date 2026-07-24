"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TARGET = process.env.DELIVERYOS_AUDIT_TARGET_ROOT;
if (!TARGET) throw new Error("DELIVERYOS_AUDIT_TARGET_ROOT obrigatorio");

function fromTarget(relativePath) {
  return require(path.join(TARGET, relativePath));
}

const PiiGuard = fromTarget("src/conference-brain/live/pii-guard");
const Preflight = fromTarget("src/conference-brain/live/playwright-preflight");
const Grouping = fromTarget("src/conference-brain/live/grouping");
const Clock = fromTarget("src/conference-brain/live/clock");
const Multidimensional = fromTarget("src/conference-brain/live/multidimensional-observation");
const Reconciliation = fromTarget("src/conference-brain/live/reconciliation");
const Legacy = fromTarget("src/conference-brain/live/legacy-compat");
const Panel = fromTarget("tools/conference-brain/operator-panel-server");
const { createStore } = fromTarget("src/conference-brain/storage/store");
const { createLiveObserver } = fromTarget("src/conference-brain/live/observer");

const HEALTHY_SIGNALS = Object.freeze({
  containerFound: true,
  ordersFound: 1,
  emptyOrderRatio: 0,
  criticalFieldsMissing: [],
  consecutiveFailures: 0
});

function observerFor(store, scripts, runId) {
  let i = 0;
  return createLiveObserver({
    store,
    runId: runId || "s23-lightning",
    fetchOrders: async () => {
      const orders = scripts[Math.min(i++, scripts.length - 1)] || [];
      return { orders, signals: { ...HEALTHY_SIGNALS, ordersFound: orders.length } };
    }
  });
}

function permutations(values) {
  if (values.length < 2) return [values.slice()];
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const head = values[i];
    const rest = values.slice(0, i).concat(values.slice(i + 1));
    for (const tail of permutations(rest)) out.push([head].concat(tail));
  }
  return out;
}

test("PII composta atravessa observador e painel sem reaparecer, preservando enum operacional", async () => {
  const store = createStore({ memoryOnly: true });
  const markers = ["Joao Silva", "李明", "cliente@example.com", "11987654321"];
  const obs = observerFor(store, [[{
    external_id: "LIGHT-PII-1",
    raw_status: `Pronto — Avisar Pedido Pronto — ${markers[0]} ${markers[1]}`,
    courier: { rawText: "Na loja" },
    customerNote: `Entregador na loja; ${markers[2]}; ${markers[3]}`
  }]], "light-pii");
  await obs.runCycle();
  const persisted = store.all("live_observations")[0];
  const surface = JSON.stringify({ persisted, html: Panel.renderPage(Panel.ordersInPlay(store)) });
  for (const marker of markers) assert.equal(surface.includes(marker), false, marker);
  assert.equal(persisted.dimensions.courier.state, "at_store");
  assert.equal(persisted.dimensions.courier.raw_text, "Na loja");
});

test("PII aninhada em arrays vira marcador auditavel sem mascarar textos operacionais inteiros", () => {
  const input = {
    status: "Pronto",
    trail: ["Na loja", { note: "Joao Silva", contact: ["cliente@example.com"] }]
  };
  const output = PiiGuard.sanitizeDeep(input, { category: "lightning_nested" });
  assert.equal(output.status, "Pronto");
  assert.equal(output.trail[0], "Na loja");
  for (const marker of [output.trail[1].note, output.trail[1].contact[0]]) {
    assert.equal(marker.redacted, true);
    assert.equal(typeof marker.text_hash, "string");
    assert.equal(typeof marker.text_length, "number");
  }
  assert.equal(JSON.stringify(output).includes("Joao Silva"), false);
  assert.equal(JSON.stringify(output).includes("cliente@example.com"), false);
});

test("URL com credenciais codificadas e host em caixa mista continua recusada antes da allowlist", () => {
  const result = Preflight.checkAllowedUrl(
    "https://u%73er:p%40ss@PARCEIRO.IFOOD.COM.BR./gestor",
    ["parceiro.ifood.com.br"]
  );
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "credenciais_embutidas_na_url");
});

test("porta e caixa nao alteram host exato; subdominio com porta nunca herda permissao", () => {
  const exact = Preflight.checkAllowedUrl(
    "https://PARCEIRO.IFOOD.COM.BR.:443/gestor",
    ["https://parceiro.ifood.com.br"]
  );
  const child = Preflight.checkAllowedUrl(
    "https://painel.PARCEIRO.IFOOD.COM.BR:8443/gestor",
    ["parceiro.ifood.com.br"]
  );
  assert.equal(exact.allowed, true);
  assert.equal(exact.host, "parceiro.ifood.com.br");
  assert.equal(child.allowed, false);
  assert.equal(child.reason, "host_fora_da_allowlist");
});

test("representacoes ambiguas por homografo Unicode e ponto codificado nao equivalem ao host permitido", () => {
  const homograph = "https://parceiro.ifo\u043Ed.com.br/gestor";
  const encodedDot = "https://parceiro%2eifood.com.br.evil.example/gestor";
  for (const url of [homograph, encodedDot]) {
    const result = Preflight.checkAllowedUrl(url, ["parceiro.ifood.com.br"]);
    assert.equal(result.allowed, false, url);
  }
});

test("todas as permutacoes de uma sequencia temporal de agrupamento convergem", () => {
  const timeline = [
    { observed: true, groupId: "L-G1", memberOrderIds: ["L-A", "L-B"], observedAt: "2026-07-24T10:00:00Z" },
    { observed: true, memberOrderIds: [], observedAt: "2026-07-24T10:01:00Z" },
    { observed: true, groupId: "L-G2", memberOrderIds: ["L-A", "L-C"], observedAt: "2026-07-24T10:02:00Z" }
  ];
  const expected = Grouping.reconcileGrouping(timeline);
  for (const order of permutations(timeline)) {
    assert.deepEqual(Grouping.reconcileGrouping(order), expected);
  }
});

test("empate temporal contraditorio de agrupamento nao pode depender da ordem de replay", () => {
  const present = {
    observed: true, groupId: "L-TIE", memberOrderIds: ["L-A", "L-B"],
    observedAt: "2026-07-24T10:00:00.000Z"
  };
  const removed = {
    observed: true, memberOrderIds: [], observedAt: "2026-07-24T10:00:00.000Z"
  };
  const forward = Grouping.reconcileGrouping([present, removed]);
  const reversed = Grouping.reconcileGrouping([removed, present]);
  assert.deepEqual(forward.current, reversed.current, "empate precisa de desempate canonico ou conflito explicito");
});

test("dois fatos ready com raw_status distintos mantem o mesmo estado sem serem colapsados", () => {
  const first = Clock.recordEvent({
    order_id: "L-EVENT-1", event_type: "ready_observed", observed_at: "t1",
    origin: "ifood_screen", raw_status: "Pronto", existing_events: []
  });
  const second = Clock.recordEvent({
    order_id: "L-EVENT-1", event_type: "ready_observed", observed_at: "t2",
    origin: "ifood_screen", raw_status: "Ready", existing_events: [first.event]
  });
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, false);
  assert.equal(second.event.sequence, 1);
  assert.notEqual(second.event.event_id, first.event.event_id);
});

test("dois cancelamentos observados com razoes diferentes permanecem fatos distintos", () => {
  const ready = Clock.recordEvent({
    order_id: "L-EVENT-2", event_type: "ready_observed", observed_at: "t0",
    origin: "ifood_screen", existing_events: []
  });
  const first = Clock.recordEvent({
    order_id: "L-EVENT-2", event_type: "cancelled", observed_at: "t1",
    origin: "ifood_screen", reason: "cancelamento_observado", existing_events: [ready.event]
  });
  const second = Clock.recordEvent({
    order_id: "L-EVENT-2", event_type: "cancelled", observed_at: "t2",
    origin: "operator_manual", reason: "confirmacao_posterior", existing_events: [ready.event, first.event]
  });
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, false);
  assert.equal(second.event.sequence, 2);
});

test("crash apos prontidao multidimensional persistida e antes do relogio e reparado sem depender do legado", async () => {
  const store = createStore({ memoryOnly: true });
  const dimension = PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
    externalId: "L-CRASH-1",
    observedAt: "2026-07-24T10:00:00Z",
    orderStateText: "",
    readiness: { confirmationText: "Pedido pronto avisado" }
  }));
  const projected = Reconciliation.reconcileMultidimensional("L-CRASH-1", [dimension]);
  const status = Legacy.deriveLegacyLiveStatus(projected);
  assert.equal(Clock.isReadyFromMultidimensional(projected), true, "o contrato multidimensional afirma prontidao");
  store.put("live_observations", {
    run_id: "crashed", cycle_id: "before-clock", external_id: "L-CRASH-1",
    observed_at: dimension.observed_at, raw_status: "", source_health: "available",
    confidence: "alta", status, dimensions: dimension
  });
  const observer = observerFor(store, [[{
    external_id: "L-CRASH-1", raw_status: "",
    readiness: { confirmationText: "Pedido pronto avisado" }
  }]], "after-crash");
  await observer.runCycle();
  const events = store.all("conference_clock_events").filter((e) => e.order_id === "L-CRASH-1");
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "ready_observed");
});

test("restauracao em disco recompõe exatamente agrupamento, agenda e encerramento de indicador", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s23-lightning-restore-"));
  try {
    const d1 = PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
      externalId: "L-RESTORE-1", observedAt: "2026-07-24T10:00:00Z", orderStateText: "Pronto",
      grouping: { observed: true, groupId: "L-RG", memberOrderIds: ["L-RESTORE-1", "L-RESTORE-2"] },
      schedule: { is_scheduled: true, scheduled_for: "2026-07-24T12:00:00Z" },
      indicatorsObserved: true,
      indicators: [{ code: "PREPARATION_DELAYED", category: "alerta", severity: "high" }]
    }));
    const d2 = PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
      externalId: "L-RESTORE-1", observedAt: "2026-07-24T10:05:00Z", orderStateText: "Pronto",
      grouping: { observed: true, memberOrderIds: [] },
      schedule: { is_scheduled: false, scheduled_for: null },
      indicatorsObserved: true, indicators: []
    }));
    const expected = Reconciliation.reconcileMultidimensional("L-RESTORE-1", [d1, d2]);
    const firstStore = createStore({ dir });
    for (const [index, dimension] of [d1, d2].entries()) {
      const result = firstStore.put("live_observations", {
        run_id: "restore", cycle_id: `c${index + 1}`, external_id: "L-RESTORE-1",
        observed_at: dimension.observed_at, raw_status: "Pronto", source_health: "available",
        confidence: "alta", status: "ready", dimensions: dimension
      });
      assert.equal(result.ok, true, JSON.stringify(result.errors));
    }
    const restoredStore = createStore({ dir });
    assert.equal(restoredStore.load("live_observations"), 2);
    const restoredObserver = observerFor(restoredStore, [[]], "restored");
    const actual = restoredObserver.getReconciledDimension("L-RESTORE-1");
    assert.deepEqual(actual, expected);
    assert.equal(actual.grouping.presence, "removed");
    assert.equal(actual.schedule.is_scheduled, false);
    assert.deepEqual(actual.indicators, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
