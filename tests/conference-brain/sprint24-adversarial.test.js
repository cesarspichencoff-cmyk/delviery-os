"use strict";
/* ============================================================================
 * Testes adversariais do Sprint 2.4 — correção final dos dois bloqueadores
 * do gate independente relâmpago do Sprint 2.3
 * (deliveryos-recheck-multidimensional-v2/tests/auditoria/
 * conference-sprint23-lightning.test.js, commit c42fbda, worktree
 * audit/recheck-conference-live-multidimensional-v2, nunca incorporado a
 * este branch).
 *
 * Cada describe corresponde a um bloqueador e adiciona regressões OFICIAIS
 * equivalentes aos casos independentes de
 * tests/auditoria/conference-sprint23-lightning.test.js (que permanece
 * intocado — ver Fase 0, SPRINT24_FAILURE_REPRODUCTION.md).
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const Grouping = require("../../src/conference-brain/live/grouping");
const Clock = require("../../src/conference-brain/live/clock");
const Multidimensional = require("../../src/conference-brain/live/multidimensional-observation");
const Reconciliation = require("../../src/conference-brain/live/reconciliation");
const Legacy = require("../../src/conference-brain/live/legacy-compat");
const PiiGuard = require("../../src/conference-brain/live/pii-guard");
const { createStore } = require("../../src/conference-brain/storage/store");
const { createLiveObserver } = require("../../src/conference-brain/live/observer");

const HEALTHY_SIGNALS = Object.freeze({
  containerFound: true, ordersFound: 1, emptyOrderRatio: 0,
  criticalFieldsMissing: [], consecutiveFailures: 0
});

function observerFor(store, scripts, runId = "s24-run") {
  let i = 0;
  return createLiveObserver({
    store, runId,
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

/* ---------------------------------------------------------------------------
 * Bloqueador 1 — agrupamento determinístico com observed_at empatado.
 * ------------------------------------------------------------------------- */
describe("bloqueador 1 — agrupamento nao depende de ordem de chegada, nem em empate", () => {
  test("PRESENT e REMOVED com o mesmo timestamp: forward e reversed convergem", () => {
    const present = { observed: true, groupId: "S24-TIE", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00.000Z" };
    const removed = { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:00:00.000Z" };
    const forward = Grouping.reconcileGrouping([present, removed]);
    const reversed = Grouping.reconcileGrouping([removed, present]);
    assert.deepEqual(forward.current, reversed.current);
    assert.equal(forward.current.presence, "conflict");
  });

  test("conflito explicito nunca afirma pertencimento a grupo (default seguro)", () => {
    const present = { observed: true, groupId: "S24-TIE2", memberOrderIds: ["A"], observedAt: "2026-01-01T10:00:00Z" };
    const removed = { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:00:00Z" };
    const r = Grouping.reconcileGrouping([present, removed]);
    assert.equal(r.current.group_id, null);
    assert.deepEqual(r.current.member_order_ids, []);
    assert.ok(Array.isArray(r.current.conflicting_candidates));
    assert.equal(r.current.conflicting_candidates.length, 2);
  });

  test("todas as permutacoes de 3 leituras (sem empate) convergem para o mesmo resultado", () => {
    const timeline = [
      { observed: true, groupId: "S24-P1", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" },
      { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:01:00Z" },
      { observed: true, groupId: "S24-P2", memberOrderIds: ["A", "C"], observedAt: "2026-01-01T10:02:00Z" }
    ];
    const expected = Grouping.reconcileGrouping(timeline);
    for (const order of permutations(timeline)) {
      assert.deepEqual(Grouping.reconcileGrouping(order), expected);
    }
  });

  test("mesmo timestamp com sequence distinta desempata pelo maior sequence, nao pela ordem do array", () => {
    const older = { observed: true, groupId: "S24-SEQ-OLD", memberOrderIds: ["A"], observedAt: "2026-01-01T10:00:00Z", sequence: 1 };
    const newer = { observed: true, groupId: "S24-SEQ-NEW", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z", sequence: 2 };
    const forward = Grouping.reconcileGrouping([newer, older]);
    const reversed = Grouping.reconcileGrouping([older, newer]);
    assert.deepEqual(forward.current, reversed.current);
    assert.equal(forward.current.group_id, "S24-SEQ-NEW");
    assert.notEqual(forward.current.presence, "conflict");
  });

  test("mesmo timestamp com version distinta (sem sequence) desempata pelo maior version", () => {
    const older = { observed: true, groupId: "S24-VER-OLD", memberOrderIds: ["A"], observedAt: "2026-01-01T10:00:00Z", version: 1 };
    const newer = { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:00:00Z", version: 2 };
    const forward = Grouping.reconcileGrouping([older, newer]);
    const reversed = Grouping.reconcileGrouping([newer, older]);
    assert.deepEqual(forward.current, reversed.current);
    assert.equal(forward.current.presence, "removed");
  });

  test("conflito sem nenhuma causalidade disponivel (sem sequence/version) fica marcado, nunca escolhido a esmo", () => {
    const a = { observed: true, groupId: "S24-NC-A", memberOrderIds: ["A"], observedAt: "2026-01-01T10:00:00Z" };
    const b = { observed: true, groupId: "S24-NC-B", memberOrderIds: ["C"], observedAt: "2026-01-01T10:00:00Z" };
    const r1 = Grouping.reconcileGrouping([a, b]);
    const r2 = Grouping.reconcileGrouping([b, a]);
    assert.deepEqual(r1.current, r2.current);
    assert.equal(r1.current.presence, "conflict");
  });

  test("leituras identicas no mesmo timestamp colapsam sem virar conflito", () => {
    const a = { observed: true, groupId: "S24-SAME", memberOrderIds: ["A", "B"], observedAt: "2026-01-01T10:00:00Z" };
    const b = { observed: true, groupId: "S24-SAME", memberOrderIds: ["B", "A"], observedAt: "2026-01-01T10:00:00Z" };
    const r = Grouping.reconcileGrouping([a, b]);
    assert.equal(r.current.presence, "present");
    assert.equal(r.versions.length, 1);
  });

  test("tombstone temporalmente posterior (sem empate) nao e' ressuscitado por conflito anterior", () => {
    const conflictA = { observed: true, groupId: "S24-TS-A", memberOrderIds: ["A"], observedAt: "2026-01-01T10:00:00Z" };
    const conflictB = { observed: true, groupId: "S24-TS-B", memberOrderIds: ["C"], observedAt: "2026-01-01T10:00:00Z" };
    const laterRemoval = { observed: true, memberOrderIds: [], observedAt: "2026-01-01T10:05:00Z" };
    const r = Grouping.reconcileGrouping([conflictA, laterRemoval, conflictB]);
    assert.equal(r.current.presence, "removed");
  });

  test("replay em disco preserva o desempate (nao regride para escolha arbitraria)", async () => {
    const store = createStore({ memoryOnly: true });
    const d1 = PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
      externalId: "S24-REPLAY-1", observedAt: "2026-01-01T10:00:00.000Z", orderStateText: "Pronto",
      grouping: { observed: true, groupId: "S24-RG", memberOrderIds: ["S24-REPLAY-1", "S24-REPLAY-2"] }
    }));
    const d2 = PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
      externalId: "S24-REPLAY-1", observedAt: "2026-01-01T10:00:00.000Z", orderStateText: "Pronto",
      grouping: { observed: true, memberOrderIds: [] }
    }));
    const expected = Reconciliation.reconcileMultidimensional("S24-REPLAY-1", [d1, d2]);
    for (const o of [store.put("live_observations", { run_id: "r", cycle_id: "1", external_id: "S24-REPLAY-1", observed_at: d1.observed_at, raw_status: "Pronto", source_health: "available", confidence: "alta", status: "ready", dimensions: d1 }),
                      store.put("live_observations", { run_id: "r", cycle_id: "2", external_id: "S24-REPLAY-1", observed_at: d2.observed_at, raw_status: "Pronto", source_health: "available", confidence: "alta", status: "ready", dimensions: d2 })]) {
      assert.equal(o.ok, true);
    }
    const obs = observerFor(store, [[]], "s24-replay-check");
    const actual = obs.getReconciledDimension("S24-REPLAY-1");
    assert.deepEqual(actual.grouping, expected.grouping);
    assert.equal(actual.grouping.presence, "conflict");
  });
});
