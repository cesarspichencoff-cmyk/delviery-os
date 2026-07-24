"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createInbox } = require("../../../src/integrations/ifood-official/inbox/inbox");
const { createOutbox } = require("../../../src/integrations/ifood-official/outbox/outbox");
const { buildIntegrationHealth } = require("../../../src/integrations/ifood-official/health/health");
const { sanitizeFreeText, redactForLog, isKnownSafeToken } = require("../../../src/integrations/ifood-official/security/pii-guard");
const { createAdapter, ADAPTER_RESPONSIBILITIES } = require("../../../src/integrations/ifood-official/adapter/ifood-official-adapter");
const { createAuthContext } = require("../../../src/integrations/ifood-official/auth/auth-context");
const { projectToMultidimensionalHint } = require("../../../src/integrations/ifood-official/projection/order-projection-bridge");

describe("health: agrega inbox/outbox/auth sem tocar paineis de producao", () => {
  test("estado vazio produz saude neutra, nunca erro", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const outbox = createOutbox(createStore({ memoryOnly: true }));
    const h = buildIntegrationHealth({ inbox, outbox });
    assert.equal(h.inbox_backlog, 0);
    assert.equal(h.auth_status, "absent");
  });

  test("backlog, quarentena e duplicados refletem o estado real da inbox", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const e = { eventType: "order_placed", externalEventId: "E1", merchantId: "M1", orderId: "O1", source: "webhook", schemaVersion: "v1", receivedAt: new Date().toISOString() };
    inbox.receive(e);
    inbox.receive(e); // duplicado
    inbox.receive({ source: "webhook", receivedAt: new Date().toISOString() }); // quarentena
    const h = buildIntegrationHealth({ inbox });
    assert.equal(h.quarantine_count, 1);
    assert.equal(h.duplicate_event_count, 1);
    assert.equal(h.inbox_backlog, 1); // so o evento "received" (nao terminal) conta
  });

  test("outbox pendente e' contado separadamente do backlog da inbox", () => {
    const inbox = createInbox(createStore({ memoryOnly: true }));
    const outbox = createOutbox(createStore({ memoryOnly: true }));
    outbox.prepare({ idempotencyKey: "K1", actionType: "acknowledgement" });
    const h = buildIntegrationHealth({ inbox, outbox });
    assert.equal(h.outbox_pending_count, 1);
  });
});

describe("security: privacidade -- allowlist por token, nunca blocklist", () => {
  test("vocabulario funcional conhecido sobrevive literal", () => {
    assert.equal(isKnownSafeToken("confirmed"), true);
    assert.equal(isKnownSafeToken("PLACED"), true);
  });

  test("nome de pessoa (qualquer script/caixa) nunca sobrevive em texto livre", () => {
    for (const marker of ["Joao Silva", "joao silva", "李明", "MARIA OLIVEIRA"]) {
      const out = sanitizeFreeText(`Pedido concluded para ${marker}`);
      assert.equal(out.includes(marker), false, marker);
      assert.match(out, /concluded/);
    }
  });

  test("redactForLog omite campos sensiveis pelo NOME da chave, nunca so pelo valor", () => {
    const out = redactForLog({ customer_name: "Joao Silva", phone: "11999999999", status: "confirmed", order_id: "O1" });
    assert.equal(JSON.stringify(out).includes("Joao Silva"), false);
    assert.equal(JSON.stringify(out).includes("11999999999"), false);
    assert.equal(out.customer_name, "[campo-sensivel-omitido]");
    assert.equal(out.status, "confirmed"); // vocabulario conhecido preservado
  });

  test("redactForLog nunca lanca em estruturas profundas/arrays", () => {
    const out = redactForLog({ trail: [{ note: "sem cebola" }, "confirmed", 42, null] });
    assert.doesNotThrow(() => JSON.stringify(out));
  });
});

describe("adapter: responsabilidade ausente nunca falha em silencio", () => {
  test("todas as 10 responsabilidades ficam explicitas mesmo sem implementacao", async () => {
    const adapter = createAdapter({}, { label: "vazio" });
    assert.equal(adapter.missing.length, ADAPTER_RESPONSIBILITIES.length);
    for (const r of ADAPTER_RESPONSIBILITIES) {
      const result = await adapter[r]();
      assert.equal(result.ok, false);
      assert.match(result.reason, /nao_implementado/);
    }
  });

  test("implementacao parcial mistura implementado/faltante sem quebrar", async () => {
    const adapter = createAdapter({ pollEvents: async () => ({ ok: true, events: [] }) }, { label: "parcial" });
    assert.equal(adapter.implemented.includes("pollEvents"), true);
    assert.equal(adapter.missing.includes("authenticate"), true);
    assert.equal((await adapter.pollEvents()).ok, true);
    assert.equal((await adapter.authenticate()).ok, false);
  });
});

describe("auth: token sintetico, nunca segredo real", () => {
  test("estado inicial e' ABSENT", () => {
    const auth = createAuthContext({});
    assert.equal(auth.status().state, "absent");
  });
  test("token expirado precisa de renovacao", () => {
    const auth = createAuthContext({});
    auth.set("ref-1", new Date().toISOString(), new Date(Date.now() - 1000).toISOString());
    assert.equal(auth.status().state, "expired");
    assert.equal(auth.needsRenewal(), true);
  });
});

describe("projection bridge: hipotese, nunca ligada a producao", () => {
  test("cancelamento vira completion_state_hint cancelled", () => {
    const h = projectToMultidimensionalHint({ order_status: "cancelled" });
    assert.equal(h.completion_state_hint, "cancelled");
  });
  test("readiness_state_hint e grouping_hint sempre null (sem campo documentado na API)", () => {
    const h = projectToMultidimensionalHint({ order_status: "ready_for_pickup" });
    assert.equal(h.readiness_state_hint, null);
    assert.equal(h.grouping_hint, null);
  });
  test("snapshot vazio nunca vira um palpite de estado ativo", () => {
    const h = projectToMultidimensionalHint({});
    assert.equal(h.completion_state_hint, "unknown");
    assert.equal(h.order_state_hint, "unknown");
  });
});
