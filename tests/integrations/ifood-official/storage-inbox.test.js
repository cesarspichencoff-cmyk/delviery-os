"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createInbox, PROCESSING_STATUS } = require("../../../src/integrations/ifood-official/inbox/inbox");
const { EVENT_TYPES } = require("../../../src/integrations/ifood-official/contracts/event-types");

function evt(o) {
  return Object.assign({
    eventType: EVENT_TYPES.ORDER_PLACED, merchantId: "M1", orderId: "O1",
    source: "webhook", schemaVersion: "v1", receivedAt: new Date().toISOString()
  }, o);
}

describe("storage: JSONL append-only independente", () => {
  test("linha corrompida nunca destroi as demais nem vaza conteudo (mesmo com PII no meio)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ifood-storage-"));
    try {
      const file = path.join(dir, "ifood_events_inbox.runtime.jsonl");
      const valid = (id) => JSON.stringify({
        internal_event_id: id, event_type: "order_placed", source: "webhook",
        received_at: "t", schema_version: "v1", processing_status: "received"
      });
      fs.writeFileSync(file, `${valid("a")}\nCORROMPIDO-MARIA-OLIVEIRA-11999999999\n${valid("b")}\n{"truncado":`);
      const store = createStore({ dir });
      assert.equal(store.load("ifood_events_inbox"), 2);
      const health = store.health();
      assert.equal(health.corrupted_lines.length, 2);
      const serialized = JSON.stringify(health);
      assert.equal(serialized.includes("MARIA-OLIVEIRA"), false);
      assert.equal(serialized.includes("11999999999"), false);
      for (const c of health.corrupted_lines) assert.ok(c.excerpt_hash && c.excerpt_length != null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("registro rejeitado pelo schema nunca e' escrito no arquivo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ifood-storage-reject-"));
    try {
      const store = createStore({ dir });
      const r = store.put("ifood_events_inbox", { internal_event_id: "x" }); // faltam campos obrigatorios
      assert.equal(r.ok, false);
      assert.equal(fs.existsSync(store.fileFor("ifood_events_inbox")), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("inbox: idempotencia e quarentena", () => {
  test("retry do mesmo evento (mesmo external_event_id) nunca cria segundo registro", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const e = evt({ externalEventId: "E1" });
    const first = inbox.receive(e);
    const second = inbox.receive(e);
    assert.equal(first.status, PROCESSING_STATUS.RECEIVED);
    assert.equal(second.status, PROCESSING_STATUS.DUPLICATED);
    assert.equal(inbox.all().length, 1);
  });

  test("eventos DISTINTOS com o mesmo tipo/pedido/estado final nunca sao colapsados", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const r1 = inbox.receive(evt({ externalEventId: "E1", occurredAt: "2026-01-01T10:00:00Z" }));
    const r2 = inbox.receive(evt({ externalEventId: "E2", occurredAt: "2026-01-01T10:05:00Z" }));
    assert.notEqual(r1.record.internal_event_id, r2.record.internal_event_id);
    assert.equal(inbox.all().length, 2);
  });

  test("duplicidade por polling E webhook do MESMO fato converge, nunca duplica", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const webhook = inbox.receive(evt({ externalEventId: "E1", source: "webhook" }));
    const polling = inbox.receive(evt({ externalEventId: "E1", source: "polling" }));
    assert.equal(webhook.status, PROCESSING_STATUS.RECEIVED);
    assert.equal(polling.status, PROCESSING_STATUS.DUPLICATED);
    assert.equal(inbox.all().length, 1);
  });

  test("payload que nao bate com o contrato de envelope vai para quarentena, nunca e' descartado", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const r = inbox.receive({ source: "webhook", receivedAt: new Date().toISOString() }); // sem eventType valido
    assert.equal(r.status, PROCESSING_STATUS.QUARANTINED);
    assert.ok(r.record.quarantine_reason);
    assert.equal(inbox.all().length, 1);
  });

  test("versao de schema desconhecida vai para quarentena, nunca e' adivinhada", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const r = inbox.receive(evt({ externalEventId: "E9", schemaVersion: "v99-nunca-visto" }));
    assert.equal(r.status, PROCESSING_STATUS.QUARANTINED);
    assert.match(r.record.quarantine_reason, /schema_version_desconhecida/);
  });

  test("retry nunca regride estado de processamento ja alcancado (processed/acknowledged)", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const first = inbox.receive(evt({ externalEventId: "E1" }));
    inbox.markStatus(first.record.internal_event_id, PROCESSING_STATUS.ACKNOWLEDGED);
    const retry = inbox.receive(evt({ externalEventId: "E1" }));
    assert.equal(retry.record.processing_status, PROCESSING_STATUS.ACKNOWLEDGED, "retry nunca reabre um evento ja confirmado");
  });

  test("markFailed incrementa retry_count e registra categoria, nunca some o evento", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const r = inbox.receive(evt({ externalEventId: "E1" }));
    const f1 = inbox.markFailed(r.record.internal_event_id, "timeout");
    const f2 = inbox.markFailed(r.record.internal_event_id, "timeout");
    assert.equal(f2.record.retry_count, 2);
    assert.equal(f2.record.last_error_category, "timeout");
  });

  test("replay em disco (processo reiniciado) preserva idempotencia real", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ifood-inbox-restart-"));
    try {
      const store1 = createStore({ dir });
      const inbox1 = createInbox(store1);
      inbox1.receive(evt({ externalEventId: "E1" }));
      const store2 = createStore({ dir });
      store2.load("ifood_events_inbox");
      const inbox2 = createInbox(store2);
      const retryAfterRestart = inbox2.receive(evt({ externalEventId: "E1" }));
      assert.equal(retryAfterRestart.status, PROCESSING_STATUS.DUPLICATED);
      assert.equal(inbox2.all().length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stats() conta duplicados e quarentenados neste processo", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const e = evt({ externalEventId: "E1" });
    inbox.receive(e);
    inbox.receive(e);
    inbox.receive({ source: "webhook", receivedAt: new Date().toISOString() });
    const s = inbox.stats();
    assert.equal(s.duplicates_seen, 1);
    assert.equal(s.quarantined_seen, 1);
  });
});
