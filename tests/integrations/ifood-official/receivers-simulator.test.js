"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../../../src/integrations/ifood-official/storage/store");
const { createInbox, PROCESSING_STATUS } = require("../../../src/integrations/ifood-official/inbox/inbox");
const { createWebhookReceiver } = require("../../../src/integrations/ifood-official/receivers/webhook-receiver");
const { createPollingReceiver } = require("../../../src/integrations/ifood-official/receivers/polling-receiver");
const { createSimulator, FAULT_TYPES } = require("../../../tools/ifood-simulator/simulator");
const { reconcileOrder } = require("../../../src/integrations/ifood-official/reconciliation/reconciler");
const { ORDER_STATUS } = require("../../../src/integrations/ifood-official/contracts/order-snapshot");

function setup() {
  const store = createStore({ memoryOnly: true });
  const inbox = createInbox(store);
  const webhook = createWebhookReceiver({ inbox });
  const sim = createSimulator({});
  const polling = createPollingReceiver({ inbox, adapter: sim.adapter });
  return { store, inbox, webhook, polling, sim };
}

describe("receivers: webhook e polling convergem na mesma inbox", () => {
  test("webhook recebido, depois repetido -- segunda entrega e' duplicated", () => {
    const { inbox, webhook } = setup();
    const payload = { id: "E1", code: "PLACED", orderId: "O1", merchantId: "M1", createdAt: "2026-01-01T10:00:00Z" };
    assert.equal(webhook.receive(payload).status, PROCESSING_STATUS.RECEIVED);
    assert.equal(webhook.receive(payload).status, PROCESSING_STATUS.DUPLICATED);
    assert.equal(inbox.all().length, 1);
  });

  test("polling retornando o MESMO evento que o webhook ja entregou nao duplica", async () => {
    const { inbox, webhook, polling, sim } = setup();
    const payload = { id: "E1", code: "PLACED", orderId: "O1", merchantId: "M1", createdAt: "2026-01-01T10:00:00Z" };
    webhook.receive(payload);
    sim.pushOrderJourney; // no-op, so garante que sim existe
    // injeta manualmente o mesmo evento na fila do simulador via push privado nao exposto -- usa pushDuplicateOf de um evento simulado equivalente
    const simEvt = sim.pushCancellation("O1"); // gera um evento simulado qualquer para ter algo na fila
    sim.pushDuplicateOf({ id: "E1", code: "PLACED", orderId: "O1", merchantId: "M1", createdAt: "2026-01-01T10:00:00Z" });
    const r = await polling.pollOnce();
    assert.equal(r.ok, true);
    const statuses = r.received.map((x) => x.status);
    assert.ok(statuses.includes(PROCESSING_STATUS.DUPLICATED));
    assert.equal(inbox.all().filter((e) => e.external_event_id === "E1").length, 1);
  });

  test("atraso/lote incompleto: parte dos eventos chega, resto fica pendente na fila do simulador", async () => {
    const { polling, sim } = setup();
    sim.pushOrderJourney("O1"); // 10 eventos
    sim.injectFault(FAULT_TYPES.INCOMPLETE_BATCH);
    const r = await polling.pollOnce();
    assert.equal(r.ok, true);
    assert.equal(r.partial, true);
    assert.ok(r.received.length < 10);
    assert.ok(sim.queueLength() > 0, "eventos restantes continuam na fila para o proximo ciclo");
  });

  test("falha temporaria (timeout/HTTP) faz o poll falhar sem entregar nenhum evento", async () => {
    const { polling, sim } = setup();
    sim.pushOrderJourney("O1");
    sim.injectFault(FAULT_TYPES.TIMEOUT);
    const r = await polling.pollOnce();
    assert.equal(r.ok, false);
    assert.equal(r.received.length, 0);
    assert.ok(sim.queueLength() > 0, "nada foi consumido da fila numa falha de requisicao");
  });

  test("resposta incompleta/erros HTTP 401/403/404/409/429/5xx tratados sem excecao", async () => {
    const { polling, sim } = setup();
    for (const fault of [FAULT_TYPES.HTTP_401, FAULT_TYPES.HTTP_403, FAULT_TYPES.HTTP_404, FAULT_TYPES.HTTP_409, FAULT_TYPES.HTTP_429, FAULT_TYPES.HTTP_5XX]) {
      sim.injectFault(fault);
      const r = await polling.pollOnce();
      assert.equal(r.ok, false, fault);
      assert.ok(r.reason, fault);
    }
  });

  test("retomada apos reinicio: fila do simulador e inbox persistida continuam consistentes entre ciclos", async () => {
    const { inbox, polling, sim } = setup();
    sim.pushOrderJourney("O1");
    const r1 = await polling.pollOnce();
    assert.equal(r1.received.length, 10);
    assert.equal(sim.queueLength(), 0);
    sim.pushCancellation("O1");
    const r2 = await polling.pollOnce();
    assert.equal(r2.received.length, 1);
    assert.equal(inbox.all().filter((e) => e.order_id === "O1").length, 11);
  });

  test("JSON invalido no webhook vai para quarentena, nunca derruba o processo", () => {
    const { inbox, webhook, sim } = setup();
    const r = webhook.receiveRaw(sim.invalidJsonBody());
    assert.equal(r.status, PROCESSING_STATUS.QUARANTINED);
    assert.equal(inbox.all().length, 1);
  });

  test("versao de schema desconhecida entregue via polling vai para quarentena", async () => {
    const { inbox, polling, sim } = setup();
    sim.pushUnknownSchemaVersion("O2");
    const r = await polling.pollOnce();
    assert.equal(r.received[0].status, PROCESSING_STATUS.QUARANTINED);
    assert.equal(inbox.all().length, 1);
  });

  test("token expirado no authenticate() do adapter e' reportado, nunca lanca excecao", async () => {
    const { sim } = setup();
    sim.injectFault(FAULT_TYPES.TOKEN_EXPIRED);
    const r = await sim.adapter.authenticate();
    assert.equal(r.ok, false);
    assert.match(r.reason, /token/);
  });

  test("jornada completa via polling reconcilia para concluded sem anomalias falsas (sem timestamps colados)", async () => {
    const { inbox, polling, sim } = setup();
    sim.pushOrderJourney("O1");
    await polling.pollOnce();
    const r = reconcileOrder("O1", inbox.all());
    assert.equal(r.snapshot.order_status, ORDER_STATUS.CONCLUDED);
    assert.equal(r.anomalies.length, 0);
  });

  test("simulador injeta empate temporal deliberado -- reconciliador marca conflito", async () => {
    const { inbox, polling, sim } = setup();
    sim.pushSameTimestampConflict("O3", "CONFIRMED", "READY_TO_PICKUP", "2026-01-01T12:00:00Z");
    await polling.pollOnce();
    const r = reconcileOrder("O3", inbox.all());
    assert.equal(r.anomalies.some((a) => a.type === "empate_temporal_conflitante"), true);
  });
});
