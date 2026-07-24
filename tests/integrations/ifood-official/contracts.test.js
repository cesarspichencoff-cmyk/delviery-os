"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { buildEventEnvelope, eventIdentityKey } = require("../../../src/integrations/ifood-official/contracts/envelope");
const { EVENT_TYPES } = require("../../../src/integrations/ifood-official/contracts/event-types");
const { buildMerchantReference, buildOrderReference } = require("../../../src/integrations/ifood-official/contracts/references");
const { buildPackagingCapability, PACKAGING_CAPABILITY_STATE } = require("../../../src/integrations/ifood-official/contracts/packaging");
const { buildAuthConfig, evaluateTokenState, TOKEN_STATE } = require("../../../src/integrations/ifood-official/contracts/auth");
const { buildNegotiationAction, NEGOTIATION_STATUS, NEGOTIATION_ACTION_TYPES } = require("../../../src/integrations/ifood-official/contracts/negotiation");
const { validate, naturalKey } = require("../../../src/integrations/ifood-official/contracts/schemas");

describe("contracts: envelope", () => {
  test("forma invalida (event_type/source ausentes) e' recusada", () => {
    const r = buildEventEnvelope({ receivedAt: new Date().toISOString() });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });

  test("identidade real por external_event_id, nunca por posicao", () => {
    const a = eventIdentityKey("E1", EVENT_TYPES.ORDER_PLACED, "M1", "O1", "hashX");
    const b = eventIdentityKey("E1", EVENT_TYPES.ORDER_CONFIRMED, "M2", "O2", "hashY");
    assert.equal(a, b, "mesmo external_event_id -> mesma identidade, independente do resto");
  });

  test("sem external_event_id, fallback inclui hash do payload (nao colapsa conteudo distinto)", () => {
    const a = eventIdentityKey(null, EVENT_TYPES.ORDER_PLACED, "M1", "O1", "hashA");
    const b = eventIdentityKey(null, EVENT_TYPES.ORDER_PLACED, "M1", "O1", "hashB");
    assert.notEqual(a, b);
  });

  test("envelope valido produz internal_event_id estavel para a mesma identidade", () => {
    const base = { externalEventId: "E9", eventType: EVENT_TYPES.ORDER_PLACED, merchantId: "M1", orderId: "O1", receivedAt: "t1", source: "webhook", schemaVersion: "v1" };
    const r1 = buildEventEnvelope(base);
    const r2 = buildEventEnvelope(Object.assign({}, base, { receivedAt: "t2" })); // received_at pode variar
    assert.equal(r1.envelope.internal_event_id, r2.envelope.internal_event_id);
  });
});

describe("contracts: references", () => {
  test("sem external id nao ha referencia", () => {
    assert.equal(buildMerchantReference({}), null);
    assert.equal(buildOrderReference({}), null);
  });
  test("referencia valida marca origem do mapeamento", () => {
    const m = buildMerchantReference({ externalMerchantId: "EM1" });
    assert.equal(m.merchant_id_source, "nao_mapeado");
    const m2 = buildMerchantReference({ externalMerchantId: "EM1", merchantId: "M1" });
    assert.equal(m2.merchant_id_source, "confirmado");
  });
});

describe("contracts: packaging capability", () => {
  test("estado padrao (sem registro) e' unknown -- comportamento do proprio contrato ao nao receber state", () => {
    const r = buildPackagingCapability({ merchantId: "M1", capability: "package_count" });
    assert.equal(r.ok, true);
    assert.equal(r.capability_record.state, PACKAGING_CAPABILITY_STATE.UNKNOWN);
  });
  test("estado alem de unknown/candidate exige evidence_refs", () => {
    const r = buildPackagingCapability({ merchantId: "M1", capability: "package_count", state: "available" });
    assert.equal(r.ok, false);
  });
  test("candidate nao exige evidencia (hipotese em aberto)", () => {
    const r = buildPackagingCapability({ merchantId: "M1", capability: "package_count", state: "candidate" });
    assert.equal(r.ok, true);
  });
});

describe("contracts: auth (sem segredo real)", () => {
  test("config invalida sem client/secret/token_url e' recusada", () => {
    const r = buildAuthConfig({});
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes("client_id_ref_ausente"));
  });
  test("token ausente -> ABSENT", () => {
    assert.equal(evaluateTokenState({}), TOKEN_STATE.ABSENT);
  });
  test("token expirado -> EXPIRED", () => {
    const s = evaluateTokenState({ tokenReference: "ref", expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal(s, TOKEN_STATE.EXPIRED);
  });
  test("token perto de expirar (dentro da margem) -> EXPIRING_SOON", () => {
    const s = evaluateTokenState({ tokenReference: "ref", expiresAt: new Date(Date.now() + 60000).toISOString(), renewalMarginSeconds: 300 });
    assert.equal(s, TOKEN_STATE.EXPIRING_SOON);
  });
  test("token valido e fora da margem -> VALID", () => {
    const s = evaluateTokenState({ tokenReference: "ref", expiresAt: new Date(Date.now() + 3600000).toISOString(), renewalMarginSeconds: 300 });
    assert.equal(s, TOKEN_STATE.VALID);
  });
});

describe("contracts: negotiation action", () => {
  test("toda acao nasce prepared, nunca outro valor", () => {
    const a = buildNegotiationAction({ actionType: NEGOTIATION_ACTION_TYPES.CANCELLATION, orderId: "O1" });
    assert.equal(a.status, NEGOTIATION_STATUS.PREPARED);
  });
  test("tipo de acao invalido e' recusado", () => {
    assert.equal(buildNegotiationAction({ actionType: "chat_livre", orderId: "O1" }), null);
  });
});

describe("contracts: schemas (registro independente do conference-brain)", () => {
  test("PII conhecida e' recusada por nome de campo (FORBIDDEN_FIELDS)", () => {
    const r = validate("ifood_events_inbox", {
      internal_event_id: "x", event_type: "order_placed", source: "webhook",
      received_at: "t", schema_version: "v1", processing_status: "received",
      customer_name: "Joao Silva"
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.startsWith("campo_proibido_pii")));
  });
  test("naturalKey usa a chave composta declarada no schema", () => {
    const k = naturalKey("ifood_packaging_capabilities", { merchant_id: "M1", capability: "package_count" });
    assert.equal(k, "M1|package_count");
  });
});
