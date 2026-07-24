"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createNegotiationEngine } = require("../../../src/integrations/ifood-official/negotiation/negotiation-engine");
const { NEGOTIATION_STATUS, NEGOTIATION_ACTION_TYPES } = require("../../../src/integrations/ifood-official/contracts/negotiation");
const { createPackagingRegistry } = require("../../../src/integrations/ifood-official/packaging/packaging-registry");
const { PACKAGING_CAPABILITY_STATE } = require("../../../src/integrations/ifood-official/contracts/packaging");

describe("negotiation: acao estruturada, nunca chat livre", () => {
  function newEngine() { return createNegotiationEngine(createStore({ memoryOnly: true })); }

  test("toda acao nasce prepared", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: NEGOTIATION_ACTION_TYPES.CANCELLATION, orderId: "O1" });
    assert.equal(p.record.status, NEGOTIATION_STATUS.PREPARED);
  });

  test("enviar sem autorizar e' recusado", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: NEGOTIATION_ACTION_TYPES.CANCELLATION, orderId: "O1" });
    assert.equal(engine.markSent(p.record.action_id).ok, false);
  });

  test("autorizar sem identificar quem autoriza e' recusado", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: NEGOTIATION_ACTION_TYPES.DEADLINE_EXTENSION_REQUEST, orderId: "O1" });
    assert.equal(engine.authorize(p.record.action_id).ok, false);
  });

  test("fluxo completo: prepared -> authorized -> sent -> confirmed", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: NEGOTIATION_ACTION_TYPES.MISSING_ITEM_REPORT, orderId: "O1", proposedPayload: { item: "refrigerante" } });
    assert.equal(engine.authorize(p.record.action_id, "cesar@tata").ok, true);
    assert.equal(engine.markSent(p.record.action_id).ok, true);
    assert.equal(engine.markConfirmed(p.record.action_id).ok, true);
    assert.equal(engine.get(p.record.action_id).status, NEGOTIATION_STATUS.CONFIRMED);
  });

  test("rejeicao apos envio e' um estado terminal valido", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: NEGOTIATION_ACTION_TYPES.STRUCTURED_REFUND, orderId: "O1" });
    engine.authorize(p.record.action_id, "cesar@tata");
    engine.markSent(p.record.action_id);
    assert.equal(engine.markRejected(p.record.action_id).ok, true);
    assert.equal(engine.markConfirmed(p.record.action_id).ok, false, "estado terminal nunca aceita nova transicao");
  });

  test("preparo com tipo de acao invalido e' recusado", () => {
    const engine = newEngine();
    const p = engine.prepare({ actionType: "chat_livre", orderId: "O1" });
    assert.equal(p.ok, false);
  });
});

describe("packaging capability: padrao unknown, nunca afirma suporte sem evidencia", () => {
  function newRegistry() { return createPackagingRegistry(createStore({ memoryOnly: true })); }

  test("consulta sem registro previo e' sempre UNKNOWN", () => {
    const registry = newRegistry();
    const r = registry.get("M1", "package_count");
    assert.equal(r.state, PACKAGING_CAPABILITY_STATE.UNKNOWN);
  });

  test("registrar estado alem de unknown/candidate sem evidencia e' recusado", () => {
    const registry = newRegistry();
    const r = registry.register({ merchantId: "M1", capability: "package_count", state: "synchronized" });
    assert.equal(r.ok, false);
  });

  test("registrar com evidencia persiste e fica consultavel", () => {
    const registry = newRegistry();
    registry.register({ merchantId: "M1", capability: "package_count", state: "documented", evidenceRefs: ["doc-oficial-1"] });
    assert.equal(registry.get("M1", "package_count").state, "documented");
  });

  test("capacidades diferentes do mesmo merchant nao se sobrescrevem", () => {
    const registry = newRegistry();
    registry.register({ merchantId: "M1", capability: "package_count", state: "documented", evidenceRefs: ["doc-1"] });
    registry.register({ merchantId: "M1", capability: "bag_count", state: "candidate" });
    assert.equal(registry.get("M1", "package_count").state, "documented");
    assert.equal(registry.get("M1", "bag_count").state, "candidate");
  });
});
