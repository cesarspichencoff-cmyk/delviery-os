"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "..", "..");
const PiiGuard = require(path.join(ROOT, "src/conference-brain/live/pii-guard"));
const Mapping = require(path.join(ROOT, "src/conference-brain/live/mapping-mode"));
const Evidence = require(path.join(ROOT, "src/conference-brain/live/evidence"));
const Reconciliation = require(path.join(ROOT, "src/conference-brain/live/reconciliation"));
const Grouping = require(path.join(ROOT, "src/conference-brain/live/grouping"));
const Multidimensional = require(path.join(ROOT, "src/conference-brain/live/multidimensional-observation"));
const Legacy = require(path.join(ROOT, "src/conference-brain/live/legacy-compat"));
const DimensionEvents = require(path.join(ROOT, "src/conference-brain/live/dimension-events"));
const Preflight = require(path.join(ROOT, "src/conference-brain/live/playwright-preflight"));
const Browser = require(path.join(ROOT, "src/conference-brain/live/browser-adapter"));
const Clock = require(path.join(ROOT, "src/conference-brain/live/clock"));
const Panel = require(path.join(ROOT, "tools/conference-brain/operator-panel-server"));
const { createStore } = require(path.join(ROOT, "src/conference-brain/storage/store"));
const { createLiveObserver } = require(path.join(ROOT, "src/conference-brain/live/observer"));

const HEALTHY_SIGNALS = Object.freeze({
  containerFound: true,
  ordersFound: 1,
  emptyOrderRatio: 0,
  criticalFieldsMissing: [],
  consecutiveFailures: 0
});

function observerFor(store, scripts, runId = "audit-run") {
  let i = 0;
  return createLiveObserver({
    store,
    runId,
    fetchOrders: async () => {
      const orders = scripts[Math.min(i++, scripts.length - 1)] || [];
      return { orders, signals: { ...HEALTHY_SIGNALS, ordersFound: orders.length } };
    }
  });
}

function clockEvent(orderId, type, existing, at) {
  return Clock.recordEvent({
    order_id: orderId,
    event_type: type,
    observed_at: at || "2026-07-22T20:00:00-03:00",
    origin: "operator_manual",
    existing_events: existing || []
  });
}

test("PII-A: mapping mode redige nomes, Unicode, telefone, email e endereco", () => {
  const markers = ["Joao Silva", "José D'Ávila", "李明", "(11) 91234-5678", "a@b.com", "Rua A, 10"];
  const html = markers.map((v) => `<div class="customer-status">${v}</div>`).join("");
  const serialized = JSON.stringify(Mapping.captureStructuralSignature(html));
  for (const marker of markers) assert.equal(serialized.includes(marker), false, `vazou: ${marker}`);
  assert.match(serialized, /"redacted":true/);
});

test("PII-B: texto livre misturado com vocabulario conhecido continua redigido", () => {
  const mixed = "Avisar pedido pronto para Joao Silva";
  const sanitized = PiiGuard.sanitizeText(mixed, "action_label");
  assert.equal(PiiGuard.isRedactedMarker(sanitized), true, "regex parcial da allowlist nao pode liberar a frase inteira");
  assert.equal(JSON.stringify(sanitized).includes("Joao Silva"), false);
});

test("PII-C: evidencia redige nomes minusculos e CJK em estrutura hash/tamanho/categoria", () => {
  for (const marker of ["joao silva", "李明"]) {
    const record = Evidence.buildEvidenceRecord({ diagnosticExcerpt: `falha para ${marker}` });
    const serialized = JSON.stringify(record);
    assert.equal(serialized.includes(marker), false, `evidencia vazou ${marker}`);
    assert.match(serialized, /text_hash|excerpt_hash|redacted/, "evidencia deve registrar estrutura redigida, nao sumir silenciosamente");
  }
});

test("PII-D: caminho observador -> persistencia nunca grava status/nota desconhecidos brutos", async () => {
  const store = createStore({ memoryOnly: true });
  const markers = ["Joao Silva", "李明", "11999999999", "cliente@example.com", "Rua das Flores 123"];
  const obs = observerFor(store, [[{
    external_id: "SIM-ORDER-PII",
    raw_status: `Pronto para ${markers[0]} ${markers[1]}`,
    customerNote: markers.slice(2).join(" | ")
  }]], "pii-persist");
  await obs.runCycle();
  const serialized = JSON.stringify(store.all("live_observations"));
  for (const marker of markers) assert.equal(serialized.includes(marker), false, `persistencia vazou ${marker}`);
  assert.match(serialized, /redacted|text_hash/, "conteudo desconhecido precisa deixar marcador redigido auditavel");
});

test("PII-E: erro do coletor nunca persiste mensagem bruta com PII", async () => {
  const store = createStore({ memoryOnly: true });
  const obs = createLiveObserver({
    store,
    runId: "pii-error",
    fetchOrders: async () => { throw new Error("falha Joao Silva 11999999999 李明"); }
  });
  await obs.runCycle();
  const serialized = JSON.stringify(store.all("live_cycle_runs"));
  for (const marker of ["Joao Silva", "11999999999", "李明"]) {
    assert.equal(serialized.includes(marker), false, `erro persistido vazou ${marker}`);
  }
  assert.match(serialized, /redacted|text_hash/);
});

test("BIND-A: resolucao aceita somente loopback e recusa curingas/LAN/hostname", () => {
  assert.deepEqual(Panel.resolvePanelHost({}), { ok: true, host: "127.0.0.1", source: "padrao" });
  assert.equal(Panel.resolvePanelHost({ PANEL_HOST: "::1" }).ok, true);
  for (const host of ["0.0.0.0", "::", "192.168.1.20", "painel.local", "example.com"]) {
    assert.equal(Panel.resolvePanelHost({ PANEL_HOST: host }).ok, false, host);
  }
});

test("BIND-B: socket criado pelo servidor exportado fica realmente em 127.0.0.1", async () => {
  const server = Panel.createServer(createStore({ memoryOnly: true }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  assert.equal(server.address().address, "127.0.0.1");
  await new Promise((resolve) => server.close(resolve));
});

test("INTEGRACAO-A: observador persiste dimensao e status legado deriva da reconciliacao", async () => {
  const store = createStore({ memoryOnly: true });
  const raw = {
    external_id: "INT-1",
    raw_status: "Pronto",
    courier: { rawText: "Na loja" },
    items: [{ raw_name: "ITEM-SINTETICO", quantity: 1 }],
    totalValue: 42
  };
  const obs = observerFor(store, [[raw]], "integration-a");
  await obs.runCycle();
  const persisted = store.all("live_observations")[0];
  const reconciled = obs.getReconciledDimension("INT-1");
  assert.ok(persisted.dimensions);
  assert.equal(reconciled.courier_state, "at_store");
  assert.deepEqual(reconciled.items_current, raw.items);
  assert.equal(persisted.status, Legacy.deriveLegacyLiveStatus(reconciled));
});

test("INTEGRACAO-B: captura real transporta agrupamento, agenda e indicadores ate painel/eventos", async () => {
  const store = createStore({ memoryOnly: true });
  const raw = {
    external_id: "INT-2",
    raw_status: "Pronto",
    courier: { rawText: "Na loja" },
    grouping: { observed: true, groupId: "G-SIM", memberOrderIds: ["INT-2", "INT-3"] },
    schedule: { is_scheduled: true, scheduled_for: "2026-07-23T20:00:00-03:00" },
    indicatorsObserved: true,
    indicators: [{ code: "PREPARATION_DELAYED", category: "alerta", severity: "high" }]
  };
  const obs = observerFor(store, [[raw]], "integration-b");
  await obs.runCycle();
  const dim = obs.getReconciledDimension("INT-2");
  assert.ok(dim.grouping, "agrupamento capturado deveria chegar a reconciliacao");
  assert.equal(dim.grouping.group_id, "G-SIM");
  assert.ok(dim.schedule, "agenda capturada deveria chegar a reconciliacao");
  assert.equal(dim.schedule.is_scheduled, true);
  assert.equal(dim.indicators.length, 1, "indicador capturado deveria chegar a reconciliacao");
  assert.equal(dim.indicators[0].code, "PREPARATION_DELAYED");
  const html = Panel.renderPage(Panel.ordersInPlay(store));
  for (const signal of ["entregador na loja", "PREPARATION_DELAYED", "agrupado", "agendado"]) {
    assert.match(html, new RegExp(signal));
  }
});

test("PAINEL: renderizador real exibe prioridade, cinco sinais e detalhes sem nota de cliente", () => {
  const store = createStore({ memoryOnly: true });
  const first = Clock.recordEvent({ order_id: "PANEL-1", event_type: "ready_observed", observed_at: "2026-07-22T20:00:00-03:00", origin: "ifood_screen", existing_events: [] });
  store.put("conference_clock_events", first.event);
  const second = clockEvent("PANEL-1", "conference_started", [first.event], "2026-07-22T20:01:00-03:00");
  store.put("conference_clock_events", second.event);
  const third = clockEvent("PANEL-1", "waiting_for_item", [first.event, second.event], "2026-07-22T20:02:00-03:00");
  store.put("conference_clock_events", third.event);

  const built = Multidimensional.buildOrderObservation({
    externalId: "PANEL-1", observedAt: "2026-07-22T20:03:00-03:00", orderStateText: "Pronto",
    courier: { rawText: "Na loja" }, customerNote: "NAO-RENDERIZAR-NOTA"
  });
  built.grouping = { observed: true, groupId: "G-SIM", memberOrderIds: ["PANEL-1", "PANEL-2"], observedAt: built.observed_at };
  built.schedule = { is_scheduled: true, scheduled_for: "2026-07-22T21:00:00-03:00", confidence: "alta", source: "fixture" };
  built.indicatorsObserved = true;
  built.indicators = [{ code: "PREPARATION_DELAYED", category: "alerta", severity: "high" }];
  store.put("live_observations", {
    run_id: "panel", cycle_id: "1", external_id: "PANEL-1", observed_at: built.observed_at,
    raw_status: "Pronto", source_health: "available", confidence: "alta", status: "ready", dimensions: built
  });
  const html = Panel.renderPage(Panel.ordersInPlay(store));
  for (const expected of ["bloqueado", "entregador na loja", "PREPARATION_DELAYED", "agrupado", "agendado", "<details>"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.equal(html.includes("NAO-RENDERIZAR-NOTA"), false);
  assert.ok(html.indexOf("bloqueado") < html.indexOf("entregador na loja"));
});

test("AUSENCIA: leitura parcial preserva acao; leitura completa vazia remove e registra removed_at", () => {
  const action = { code: "notify_ready", available: true, disabled: false };
  const partial = Reconciliation.reconcileAvailableActions([
    { observed_at: "2026-01-01T10:00:00Z", readiness: { actions_observed: true, available_actions: [action] } },
    { observed_at: "2026-01-01T10:01:00Z", readiness: { actions_observed: false, available_actions: [] } }
  ]);
  assert.equal(partial.current.length, 1);
  const removed = Reconciliation.reconcileAvailableActions([
    { observed_at: "2026-01-01T10:00:00Z", readiness: { actions_observed: true, available_actions: [action] } },
    { observed_at: "2026-01-01T10:01:00Z", readiness: { actions_observed: true, available_actions: [] } }
  ]);
  assert.deepEqual(removed.current, []);
  assert.equal(removed.versions.at(-1).removed_at, "2026-01-01T10:01:00Z");
});

test("AUSENCIA: leitura parcial preserva indicador; completa vazia encerra", () => {
  const indicator = { code: "PREPARATION_DELAYED" };
  const partial = Reconciliation.reconcileIndicators([
    { observed_at: "2026-01-01T10:00:00Z", indicatorsObserved: true, indicators: [indicator] },
    { observed_at: "2026-01-01T10:01:00Z", indicatorsObserved: false, indicators: [] }
  ]);
  assert.equal(partial.current.length, 1);
  const removed = Reconciliation.reconcileIndicators([
    { observed_at: "2026-01-01T10:00:00Z", indicatorsObserved: true, indicators: [indicator] },
    { observed_at: "2026-01-01T10:01:00Z", indicatorsObserved: true, indicators: [] }
  ]);
  assert.deepEqual(removed.current, []);
  assert.deepEqual(removed.ended, [{ code: "PREPARATION_DELAYED", ended_at: "2026-01-01T10:01:00Z" }]);
  const events = DimensionEvents.deriveDimensionEvents("O", { indicators: [indicator], available_actions: [] }, { indicators: [], available_actions: [] }, "2026-01-01T10:01:00Z");
  assert.equal(events[0].type, "indicator_ended");
});

test("AGRUPAMENTO-A: entrada, parcial, saida e novo grupo seguem a ordem temporal", () => {
  const result = Grouping.reconcileGrouping([
    { observed: true, groupId: "G1", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
    { observed: false, memberOrderIds: [], observedAt: "2026-01-01T10:01:00Z" },
    { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:02:00Z" },
    { observed: true, groupId: "G2", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:03:00Z" }
  ]);
  assert.equal(result.current.group_id, "G2");
  assert.equal(result.versions.length, 3);
});

test("AGRUPAMENTO-B: evento atrasado nao ressuscita grupo antigo", () => {
  const result = Grouping.reconcileGrouping([
    { observed: true, groupId: "G2", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:03:00Z" },
    { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:04:00Z" },
    { observed: true, groupId: "G1", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" }
  ]);
  assert.equal(result.current.presence, "removed", "a versao temporal mais nova e remocao");
  assert.equal(result.current.group_id, null);
});

test("AGENDAMENTO: alteracao, ativacao, desagendamento e fora de ordem escolhem versao temporal correta", () => {
  const result = Reconciliation.reconcileSchedule([
    { observed_at: "2026-01-01T10:03:00Z", schedule: { is_scheduled: false, scheduled_for: null, activation_observed_at: "2026-01-01T10:03:00Z" } },
    { observed_at: "2026-01-01T10:00:00Z", schedule: { is_scheduled: true, scheduled_for: "2026-01-01T20:00:00Z" } },
    { observed_at: "2026-01-01T10:02:00Z", schedule: { is_scheduled: true, scheduled_for: "2026-01-01T21:00:00Z" } }
  ]);
  assert.equal(result.is_scheduled, false);
  assert.equal(result.scheduled_for, "2026-01-01T21:00:00Z");
  assert.equal(result.activation_observed_at, "2026-01-01T10:03:00Z");
  assert.equal(result.versions.length, 3);
});

test("PREFLIGHT-A: matriz fail-closed e URL fora de dominio", () => {
  const empty = Preflight.verifyMappingPreconditions({});
  for (const reason of ["flag_nao_informada_ao_preflight", "url_nao_configurada", "unidade_esperada_nao_configurada"]) {
    assert.ok(empty.blockers.includes(reason));
  }
  assert.equal(Preflight.checkAllowedUrl("http://allowed.example/x", ["allowed.example"]).allowed, false);
  assert.equal(Preflight.checkAllowedUrl("https://evil.example/x", ["allowed.example"]).allowed, false);
});

test("PREFLIGHT-B: allowlist por URL nao aceita dominio-prefixo malicioso", () => {
  const result = Preflight.checkAllowedUrl(
    "https://parceiro.ifood.com.br.evil.example/gestor",
    ["https://parceiro.ifood.com.br"]
  );
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "host_fora_da_allowlist");
});

test("PREFLIGHT-C/DRIVER: fixture valida abre so apos gate e usa executavel validado", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s22-preflight-"));
  const exe = path.join(dir, "chromium-fixture.exe");
  const profile = path.join(dir, "profile");
  fs.writeFileSync(exe, "fixture");
  fs.mkdirSync(profile);
  let opened = 0;
  let launchArgs = null;
  const page = { goto: async () => {}, $: async () => null, $$: async () => [] };
  const fakePlaywright = {
    chromium: {
      launchPersistentContext: async (...args) => {
        opened++;
        launchArgs = args;
        return { pages: () => [page], newPage: async () => page, close: async () => {} };
      }
    }
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "playwright-core") return fakePlaywright;
    if (request === "playwright") throw Object.assign(new Error("fixture prefers core"), { code: "MODULE_NOT_FOUND" });
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const config = {
      flagEnabled: true,
      flagName: "CONFERENCE_LIVE_OBSERVER_V1",
      executablePath: exe,
      profileDir: profile,
      allowedUrl: "https://allowed.example/gestor",
      urlAllowlist: ["allowed.example"],
      expectedUnitId: "SIM-UNIT"
    };
    const check = Preflight.verifyMappingPreconditions(config);
    assert.equal(check.ready, true, check.blockers.join(","));
    const driver = await Browser.createPlaywrightDriver(config);
    assert.equal(driver.ok, true);
    assert.equal(opened, 1);
    assert.equal(launchArgs[0], profile);
    assert.equal(launchArgs[1].executablePath, exe);
    await driver.close();
  } finally {
    Module._load = originalLoad;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("DRIVER: config invalida retorna exatamente os motivos do preflight e nao abre", async () => {
  const config = { flagEnabled: false, allowedUrl: "http://evil.example", expectedUnitId: null };
  const expected = Preflight.verifyMappingPreconditions(config);
  const result = await Browser.createPlaywrightDriver(config);
  assert.equal(result.ok, false);
  assert.deepEqual(result.check.blockers, expected.blockers);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("IDEMPOTENCIA-A: retry identico e reconhecido; transicao invalida continua rejeitada", () => {
  const first = Clock.recordEvent({ order_id: "IDEM-1", event_type: "ready_observed", observed_at: "t1", origin: "ifood_screen", existing_events: [] });
  const retry = Clock.recordEvent({ order_id: "IDEM-1", event_type: "ready_observed", observed_at: "t1", origin: "ifood_screen", existing_events: [first.event] });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.event.event_id, first.event.event_id);
  const invalid = Clock.recordEvent({ order_id: "IDEM-2", event_type: "released", observed_at: "t1", origin: "operator_manual", existing_events: [] });
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /transicao_invalida/);
});

test("IDEMPOTENCIA-B: evento semelhante mas diferente nao e colapsado como retry", () => {
  const first = Clock.recordEvent({ order_id: "IDEM-3", event_type: "ready_observed", event_time: "2026-01-01T10:00:00Z", observed_at: "t1", origin: "ifood_screen", existing_events: [] });
  const correction = Clock.recordEvent({
    order_id: "IDEM-3",
    event_type: "ready_observed",
    event_time: "2026-01-01T10:01:00Z",
    observed_at: "t2",
    origin: "operator_manual",
    reason: "correcao_de_horario",
    existing_events: [first.event]
  });
  assert.equal(correction.idempotent, false, "mesmo tipo nao basta: identidade/conteudo sao diferentes");
  assert.notEqual(correction.event.event_id, first.event.event_id);
});

test("REPLAY-A: linhas validas sobrevivem, corrupcao/truncamento aparecem sem vazar conteudo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s22-replay-"));
  try {
    const file = path.join(dir, "live_cycle_runs.runtime.jsonl");
    const valid = (cycle) => JSON.stringify({ run_id: "r", cycle_id: cycle, started_at: "t", collector_version: "v", source_health: "available" });
    fs.writeFileSync(file, `${valid("1")}\nCORRUPTED-JOAO-SILVA\n${valid("2")}\n{\"truncado\":`);
    const store = createStore({ dir });
    assert.equal(store.load("live_cycle_runs"), 2);
    assert.equal(store.health().corrupted_lines.length, 2);
    const health = JSON.stringify(store.health());
    assert.equal(health.includes("CORRUPTED-JOAO-SILVA"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("REPLAY-B: crash apos observacao e antes do evento e reparado no reinicio", async () => {
  const store = createStore({ memoryOnly: true });
  store.put("live_observations", {
    run_id: "crashed", cycle_id: "c1", external_id: "REC-READY",
    observed_at: "2026-01-01T10:00:00Z", raw_status: "Pronto",
    source_health: "available", confidence: "alta", status: "ready"
  });
  const obs = observerFor(store, [[{ external_id: "REC-READY", raw_status: "Pronto" }]], "restart");
  await obs.runCycle();
  const events = store.all("conference_clock_events").filter((e) => e.order_id === "REC-READY");
  assert.equal(events.length, 1, "o fato pronto conhecido nao pode ficar sem ready_observed apos retomada");
  assert.equal(events[0].event_type, "ready_observed");
});

test("REPLAY-C: replay repetido nao duplica estado/evento quando evento ja foi persistido", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s22-restart-ok-"));
  try {
    const store1 = createStore({ dir });
    const obs1 = observerFor(store1, [[{ external_id: "REC-OK", raw_status: "Pronto" }]], "run-1");
    await obs1.runCycle();
    const eventLinesBefore = fs.readFileSync(store1.fileFor("conference_clock_events"), "utf8").trim().split("\n").length;
    const store2 = createStore({ dir });
    store2.load("live_observations");
    store2.load("conference_clock_events");
    const obs2 = observerFor(store2, [[{ external_id: "REC-OK", raw_status: "Pronto" }]], "run-2");
    await obs2.runCycle();
    const eventLinesAfter = fs.readFileSync(store2.fileFor("conference_clock_events"), "utf8").trim().split("\n").length;
    assert.equal(eventLinesAfter, eventLinesBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CONCORRENCIA: duas instancias independentes nao possuem lock/unique atomico no JSONL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s22-multiprocess-"));
  try {
    const a = createStore({ dir });
    const b = createStore({ dir });
    const r = Clock.recordEvent({ order_id: "MP-1", event_type: "ready_observed", observed_at: "t", origin: "ifood_screen", existing_events: [] });
    assert.equal(a.put("conference_clock_events", r.event).ok, true);
    assert.equal(b.put("conference_clock_events", r.event).ok, true);
    const lines = fs.readFileSync(a.fileFor("conference_clock_events"), "utf8").trim().split("\n");
    assert.equal(lines.length, 2, "evidencia da limitacao: sem lock, o mesmo evento foi anexado duas vezes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
