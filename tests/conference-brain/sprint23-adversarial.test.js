"use strict";
/* ============================================================================
 * Testes adversariais do Sprint 2.3 — correção cirúrgica dos bloqueadores da
 * rechecagem do Sprint 2.2 (docs/conference-brain/deliveryos-recheck-
 * multidimensional-v2/docs/auditoria/CONFERENCE_BRAIN_SPRINT22_RECHECK.md,
 * commit 1d6bc44, lido via worktree audit/recheck-conference-live-
 * multidimensional-v2, nunca incorporado a este branch).
 *
 * Cada describe corresponde a um bloqueador da rechecagem e adiciona
 * regressões OFICIAIS equivalentes aos casos independentes de
 * tests/auditoria/conference-sprint22-recheck.test.js (que permanece
 * intocado — ver Fase 0, SPRINT23_FAILURE_REPRODUCTION.md).
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PiiGuard = require("../../src/conference-brain/live/pii-guard");
const { sanitizeExcerpt, buildEvidenceRecord } = require("../../src/conference-brain/live/evidence");
const Reconciliation = require("../../src/conference-brain/live/reconciliation");
const Grouping = require("../../src/conference-brain/live/grouping");
const Multidimensional = require("../../src/conference-brain/live/multidimensional-observation");
const DimensionEvents = require("../../src/conference-brain/live/dimension-events");
const Preflight = require("../../src/conference-brain/live/playwright-preflight");
const Browser = require("../../src/conference-brain/live/browser-adapter");
const Clock = require("../../src/conference-brain/live/clock");
const Panel = require("../../tools/conference-brain/operator-panel-server");
const { createStore } = require("../../src/conference-brain/storage/store");
const { createLiveObserver } = require("../../src/conference-brain/live/observer");

const HEALTHY_SIGNALS = Object.freeze({
  containerFound: true, ordersFound: 1, emptyOrderRatio: 0,
  criticalFieldsMissing: [], consecutiveFailures: 0
});

function observerFor(store, scripts, runId = "s23-run") {
  let i = 0;
  return createLiveObserver({
    store, runId,
    fetchOrders: async () => {
      const orders = scripts[Math.min(i++, scripts.length - 1)] || [];
      return { orders, signals: { ...HEALTHY_SIGNALS, ordersFound: orders.length } };
    }
  });
}

/* ---------------------------------------------------------------------------
 * Bloqueador 1 — PII no caminho completo (captura -> evidência -> observador
 * -> erro do coletor), nunca só regex de forma de nome.
 * ------------------------------------------------------------------------- */
describe("bloqueador 1 — PII no caminho completo", () => {
  test("allowlist so libera correspondencia INTEIRA, nunca substring de frase mista", () => {
    const mixed = "Avisar pedido pronto para Joao Silva";
    const sanitized = PiiGuard.sanitizeText(mixed, "action_label");
    assert.equal(PiiGuard.isRedactedMarker(sanitized), true);
    assert.equal(JSON.stringify(sanitized).includes("Joao Silva"), false);
    // controle: o proprio rotulo exato (sem sufixo) continua passando literal
    assert.equal(PiiGuard.sanitizeText("Avisar Pedido Pronto", "action_label"), "Avisar Pedido Pronto");
  });

  test("evidencia redige nome minusculo e CJK por token (nao por forma de nome)", () => {
    for (const marker of ["joao silva", "李明", "MARIA santos"]) {
      const msg = sanitizeExcerpt(`falha ao processar pedido de ${marker}`);
      assert.equal(msg.includes(marker), false, `vazou: ${marker}`);
    }
  });

  test("registro de evidencia carrega hash auditavel mesmo com excerto redigido", () => {
    const record = buildEvidenceRecord({ diagnosticExcerpt: "falha para joao silva" });
    assert.equal(record.diagnostic_excerpt.includes("joao silva"), false);
    assert.ok(record.diagnostic_excerpt_hash, "hash do excerto original precisa existir para auditoria");
  });

  test("vocabulario operacional dentro de frase livre sobrevive; o resto e' suprimido", () => {
    const msg = sanitizeExcerpt("status CANCELLED detectado para joao silva");
    assert.match(msg, /CANCELLED/);
    assert.equal(msg.includes("joao silva"), false);
  });

  test("observador real: raw_status e customer_note desconhecidos nunca chegam brutos a persistencia", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = observerFor(store, [[{
      external_id: "S23-PII-1",
      raw_status: "Pronto para Ana Beatriz 李明",
      customerNote: "sem cebola, tel (11) 98888-7777"
    }]], "s23-pii-observer");
    await obs.runCycle();
    const serialized = JSON.stringify(store.all("live_observations"));
    for (const marker of ["Ana Beatriz", "李明", "98888-7777"]) {
      assert.equal(serialized.includes(marker), false, `persistencia vazou ${marker}`);
    }
    // vocabulario conhecido (courier "Na loja") continua passando literal —
    // a correcao nunca deve mascarar sinal operacional legitimo.
    const store2 = createStore({ memoryOnly: true });
    const obs2 = observerFor(store2, [[{
      external_id: "S23-PII-2", raw_status: "Pronto", courier: { rawText: "Na loja" }
    }]], "s23-pii-observer-2");
    await obs2.runCycle();
    const persisted2 = store2.all("live_observations")[0];
    assert.equal(persisted2.dimensions.courier.raw_text, "Na loja");
    assert.equal(persisted2.dimensions.courier.state, "at_store");
  });

  test("observador real: raw_status persistido continua STRING (contrato de schema)", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = observerFor(store, [[{ external_id: "S23-PII-3", raw_status: "Pronto para Joao Silva" }]], "s23-pii-3");
    const r = await obs.runCycle();
    assert.equal(r.ok, true);
    const persisted = store.all("live_observations")[0];
    assert.equal(typeof persisted.raw_status, "string");
    assert.equal(persisted.raw_status.includes("Joao Silva"), false);
  });

  test("erro do coletor (fetchOrders lanca) nunca persiste mensagem bruta", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = createLiveObserver({
      store, runId: "s23-pii-error",
      fetchOrders: async () => { throw new Error("falha Carlos Drummond 11999999999"); }
    });
    await obs.runCycle();
    const serialized = JSON.stringify(store.all("live_cycle_runs"));
    assert.equal(serialized.includes("Carlos Drummond"), false);
    assert.equal(serialized.includes("11999999999"), false);
    assert.match(serialized, /redacted|text_hash/);
  });
});

/* ---------------------------------------------------------------------------
 * Bloqueador 2 — integração multidimensional: agrupamento, agenda e
 * indicadores capturados de verdade chegam à reconciliação e ao painel.
 * ------------------------------------------------------------------------- */
describe("bloqueador 2 — captura real transporta todas as dimensões", () => {
  test("grouping/schedule/indicators capturados chegam a reconciliacao a partir do observador real", async () => {
    const store = createStore({ memoryOnly: true });
    const raw = {
      external_id: "S23-INT-1", raw_status: "Pronto", courier: { rawText: "Na loja" },
      grouping: { observed: true, groupId: "G-S23", memberOrderIds: ["S23-INT-1", "S23-INT-9"] },
      schedule: { is_scheduled: true, scheduled_for: "2026-07-25T20:00:00-03:00" },
      indicatorsObserved: true,
      indicators: [{ code: "PREPARATION_DELAYED", category: "alerta", severity: "high" }]
    };
    const obs = observerFor(store, [[raw]], "s23-int-1");
    await obs.runCycle();
    const dim = obs.getReconciledDimension("S23-INT-1");
    assert.equal(dim.grouping.group_id, "G-S23");
    assert.equal(dim.schedule.is_scheduled, true);
    assert.equal(dim.indicators.length, 1);
    assert.equal(dim.indicators[0].code, "PREPARATION_DELAYED");
  });

  test("sem grouping/schedule/indicators no raw, observacao continua compativel com Sprint 2.2 (sem quebrar)", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = observerFor(store, [[{ external_id: "S23-INT-2", raw_status: "Pronto" }]], "s23-int-2");
    const r = await obs.runCycle();
    assert.equal(r.ok, true);
    const dim = obs.getReconciledDimension("S23-INT-2");
    assert.equal(dim.grouping, null);
    assert.equal(dim.indicators.length, 0);
  });

  test("painel real (Panel.renderPage + ordersInPlay) mostra os tres sinais vindos do ciclo real", async () => {
    const store = createStore({ memoryOnly: true });
    const raw = {
      external_id: "S23-INT-3", raw_status: "Pronto", courier: { rawText: "Na loja" },
      grouping: { observed: true, groupId: "G-PAINEL", memberOrderIds: ["S23-INT-3", "S23-INT-4"] },
      schedule: { is_scheduled: true, scheduled_for: "2026-07-25T21:00:00-03:00" },
      indicatorsObserved: true,
      indicators: [{ code: "PREPARATION_DELAYED", category: "alerta", severity: "high" }]
    };
    const obs = observerFor(store, [[raw]], "s23-int-3");
    await obs.runCycle();
    const html = Panel.renderPage(Panel.ordersInPlay(store));
    for (const signal of ["entregador na loja", "PREPARATION_DELAYED", "agrupado", "agendado"]) {
      assert.match(html, new RegExp(signal));
    }
  });
});

/* ---------------------------------------------------------------------------
 * Bloqueador 3 — agrupamento com semântica TEMPORAL determinística.
 * ------------------------------------------------------------------------- */
describe("bloqueador 3 — agrupamento fora de ordem e' resolvido por observed_at", () => {
  test("entrada", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" }
    ]);
    assert.equal(r.current.group_id, "GA");
    assert.equal(r.current.presence, "present");
  });

  test("saida", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:01:00Z" }
    ]);
    assert.equal(r.current.presence, "removed");
  });

  test("novo grupo apos saida", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:01:00Z" },
      { observed: true, groupId: "GB", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:02:00Z" }
    ]);
    assert.equal(r.current.group_id, "GB");
  });

  test("repeticao (leitura identica consecutiva) nao cria versao nova", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:30Z" }
    ]);
    assert.equal(r.versions.length, 1);
  });

  test("atraso: leitura antiga chega por ultimo no array mas nao vence a mais nova", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GB", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:02:00Z" },
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" }
    ]);
    assert.equal(r.current.group_id, "GB");
  });

  test("evento antigo apos evento novo (remocao) nao ressuscita grupo encerrado", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GB", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:03:00Z" },
      { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:04:00Z" },
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" }
    ]);
    assert.equal(r.current.presence, "removed");
    assert.equal(r.current.group_id, null);
  });

  test("leitura parcial (sem observed:true) nunca altera presenca", () => {
    const r = Grouping.reconcileGrouping([
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: false, memberOrderIds: [], observedAt: "2026-01-01T10:05:00Z" }
    ]);
    assert.equal(r.current.group_id, "GA");
    assert.equal(r.versions.length, 1);
  });

  test("replay completo: qualquer ordem de chegada da mesma sequencia converge para o mesmo resultado final", () => {
    const sequence = [
      { observed: true, groupId: "GA", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:01:00Z" },
      { observed: true, groupId: "GB", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:02:00Z" }
    ];
    const forward = Grouping.reconcileGrouping(sequence);
    const shuffled = Grouping.reconcileGrouping([sequence[2], sequence[0], sequence[1]]);
    const reversed = Grouping.reconcileGrouping(sequence.slice().reverse());
    assert.deepEqual(forward.current, shuffled.current);
    assert.deepEqual(forward.current, reversed.current);
  });
});
