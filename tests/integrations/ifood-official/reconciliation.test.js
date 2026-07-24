"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createInbox } = require("../../../src/integrations/ifood-official/inbox/inbox");
const { reconcileOrder } = require("../../../src/integrations/ifood-official/reconciliation/reconciler");
const { ORDER_STATUS } = require("../../../src/integrations/ifood-official/contracts/order-snapshot");
const { EVENT_TYPES } = require("../../../src/integrations/ifood-official/contracts/event-types");

function seedInbox(rawEvents) {
  const store = createStore({ memoryOnly: true });
  const inbox = createInbox(store);
  for (const e of rawEvents) inbox.receive(e);
  return inbox;
}

function ev(id, type, occurredAt, extra) {
  return Object.assign({
    externalEventId: id, eventType: type, merchantId: "M1", orderId: "O1",
    source: "webhook", schemaVersion: "v1", receivedAt: new Date().toISOString(), occurredAt
  }, extra);
}

describe("reconciliation: determinismo e replay", () => {
  test("jornada completa reconcilia para concluded, sem anomalias", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_PLACED, "2026-01-01T10:00:00Z"),
      ev("e2", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T10:01:00Z"),
      ev("e3", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T10:05:00Z"),
      ev("e4", EVENT_TYPES.ORDER_CONCLUDED, "2026-01-01T10:20:00Z")
    ]);
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.CONCLUDED);
    assert.equal(r.anomalies.length, 0);
  });

  test("replay: forward, invertido e embaralhado convergem byte-a-byte (exceto last_reconciled_at)", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_PLACED, "2026-01-01T10:00:00Z"),
      ev("e2", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T10:01:00Z"),
      ev("e3", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T10:05:00Z")
    ]);
    const events = inbox.all();
    const strip = (s) => Object.assign({}, s, { last_reconciled_at: null });
    const forward = reconcileOrder("O1", events);
    const reversed = reconcileOrder("O1", events.slice().reverse());
    const shuffled = reconcileOrder("O1", [events[1], events[2], events[0]]);
    assert.deepEqual(strip(forward.snapshot), strip(reversed.snapshot));
    assert.deepEqual(strip(forward.snapshot), strip(shuffled.snapshot));
  });

  test("ordem de ENTREGA diferente da ordem de OCORRENCIA nao muda o resultado (fora de ordem corrigido por timestamp)", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    // entrega o evento mais avancado primeiro
    inbox.receive(ev("e2", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T10:05:00Z"));
    inbox.receive(ev("e1", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T10:00:00Z"));
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.READY_FOR_PICKUP, "estado final deve refletir o timestamp mais recente, nao a ordem de chegada");
  });

  test("empate temporal com fatos de progressao contraditorios vira CONFLICT explicito", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T11:00:00Z"),
      ev("e2", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T11:00:00Z")
    ]);
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.UNKNOWN, "nenhum lado do empate decide sozinho o status atual");
    assert.equal(r.anomalies.some((a) => a.type === "empate_temporal_conflitante"), true);
  });

  test("cancelamento e' terminal e sempre vence, mesmo apos progresso avancado", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_PLACED, "2026-01-01T10:00:00Z"),
      ev("e2", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T10:05:00Z"),
      ev("e3", EVENT_TYPES.ORDER_CANCELLED, "2026-01-01T10:06:00Z")
    ]);
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.CANCELLED);
  });

  test("regressao de progresso nunca e' escondida, mas o evento mais recente ainda decide o estado atual", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_READY_FOR_PICKUP, "2026-01-01T10:05:00Z"),
      ev("e2", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T10:10:00Z") // "regride" no vocabulario, mas e' o mais recente
    ]);
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.CONFIRMED);
    assert.equal(r.anomalies.some((a) => a.type === "regressao_de_progresso"), true);
  });

  test("eventos desconhecidos e paralelos (courier, disputa) nunca mudam order_status", () => {
    const inbox = seedInbox([
      ev("e1", EVENT_TYPES.ORDER_CONFIRMED, "2026-01-01T10:00:00Z"),
      ev("e2", EVENT_TYPES.COURIER_ASSIGNED, "2026-01-01T10:01:00Z"),
      ev("e3", "codigo_nunca_documentado", "2026-01-01T10:02:00Z")
    ]);
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.CONFIRMED);
  });

  test("pedido sem nenhum evento reconciliado fica UNKNOWN, nunca um palpite", () => {
    const r = reconcileOrder("O-INEXISTENTE", []);
    assert.equal(r.snapshot.order_status, ORDER_STATUS.UNKNOWN);
  });

  test("duplicidade na fonte bruta (nao vinda da inbox) e' deduplicada pelo proprio reconciliador", () => {
    const raw = [
      ev("e1", EVENT_TYPES.ORDER_PLACED, "2026-01-01T10:00:00Z"),
      ev("e1", EVENT_TYPES.ORDER_PLACED, "2026-01-01T10:00:00Z") // mesma identidade, "vinda" duas vezes
    ].map((r, i) => Object.assign({ internal_event_id: "same-id", order_id: "O1", event_type: r.eventType, occurred_at: r.occurredAt, received_at: r.receivedAt, source: "webhook" }));
    const result = reconcileOrder("O1", raw);
    assert.equal(result.duplicate_count, 1);
  });
});
