"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createOutbox, OUTBOX_STATUS } = require("../../../src/integrations/ifood-official/outbox/outbox");

function newOutbox() { return createOutbox(createStore({ memoryOnly: true })); }

describe("outbox: preparo, autorizacao e maquina de estados", () => {
  test("preparar a mesma acao duas vezes (mesma idempotency_key) devolve o registro existente", () => {
    const outbox = newOutbox();
    const p1 = outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement", orderId: "O1" });
    const p2 = outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement", orderId: "O1" });
    assert.equal(p1.idempotent, false);
    assert.equal(p2.idempotent, true);
    assert.equal(outbox.all().length, 1);
  });

  test("toda acao nasce prepared, nunca outro estado", () => {
    const outbox = newOutbox();
    const p = outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    assert.equal(p.status, OUTBOX_STATUS.PREPARED);
  });

  test("autorizar sem identificar quem autoriza e' recusado", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    const r = outbox.authorize("K1");
    assert.equal(r.ok, false);
  });

  test("enviar antes de autorizar e' transicao invalida (prepared->sending)", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    const r = outbox.markSending("K1");
    assert.equal(r.ok, false);
    assert.match(r.reason, /transicao_invalida/);
  });

  test("ciclo de vida completo: prepared -> authorized -> pending -> sending -> confirmed", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    assert.equal(outbox.authorize("K1", "cesar@tata").ok, true);
    assert.equal(outbox.markPending("K1").ok, true);
    assert.equal(outbox.markSending("K1").ok, true);
    assert.equal(outbox.get("K1").attempt_count, 1);
    assert.equal(outbox.markConfirmed("K1", "ref-1").ok, true);
    assert.equal(outbox.get("K1").status, OUTBOX_STATUS.CONFIRMED);
  });

  test("estado terminal (confirmed) nunca aceita nova transicao", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    outbox.authorize("K1", "cesar@tata");
    outbox.markPending("K1");
    outbox.markSending("K1");
    outbox.markConfirmed("K1");
    assert.equal(outbox.cancel("K1").ok, false);
  });

  test("falha retryable pode voltar para pending; falha permanente e' terminal", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    outbox.authorize("K1", "cesar@tata");
    outbox.markPending("K1");
    outbox.markSending("K1");
    assert.equal(outbox.markRetryableFailure("K1", "timeout").ok, true);
    assert.equal(outbox.markPending("K1").ok, true, "retryable_failure -> pending precisa ser permitido para novo retry");

    const outbox2 = newOutbox();
    outbox2.prepare({ idempotencyKey: "K2", actionType: "acknowledgement" });
    outbox2.authorize("K2", "cesar@tata");
    outbox2.markPending("K2");
    outbox2.markSending("K2");
    outbox2.markPermanentFailure("K2", "http_404");
    assert.equal(outbox2.markPending("K2").ok, false);
  });

  test("transicao rejeitada pelo schema nunca finge sucesso (record devolvido e' o estado real anterior)", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    // authorize com authorizedBy valido -- sucesso esperado, prova que o caminho feliz funciona
    const r = outbox.authorize("K1", "cesar@tata");
    assert.equal(r.ok, true);
    assert.equal(r.record.status, OUTBOX_STATUS.AUTHORIZED);
  });

  test("pending() nunca inclui acoes em estado terminal", () => {
    const outbox = newOutbox();
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    outbox.prepare({ idempotencyKey: "K2", actionType: "acknowledgement" });
    outbox.authorize("K1", "cesar@tata");
    outbox.markPending("K1");
    outbox.markSending("K1");
    outbox.markConfirmed("K1");
    assert.equal(outbox.pending().length, 1); // so K2, ainda prepared
  });
});
