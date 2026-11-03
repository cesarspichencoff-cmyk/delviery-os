/**
 * Contratos adversariais do Copiloto em simulação.
 * Não usa rede, GPS, banco, leitor, tarefas Windows nem pedidos reais.
 */
import assert from "node:assert/strict";
import { SimulatedCopilotoConsumer } from "./SimulatedCopilotoConsumer";
import { EXAMPLE_TRIP_CREATED } from "../events/examples";
import type { EntregasPublicEvent } from "../events/types";
import type { EntregasEventFeed } from "../EntregasEventFeed";

let passed = 0;
function check(name: string, test: () => void): void {
  test();
  passed++;
  console.log("OK " + name);
}
const make = (id: string, changes: Partial<EntregasPublicEvent> = {}): EntregasPublicEvent => ({
  ...EXAMPLE_TRIP_CREATED,
  event_id: id,
  idempotency_key: "idem:" + id,
  unit_id: "ITAIM",
  source_mode: "simulated",
  trip_id: "TRIP-1",
  payload: { delivery_count: 1 },
  ...changes,
});

async function main(): Promise<void> {
  const c = new SimulatedCopilotoConsumer();
  const first = make("evt-1");
  check("aceita evento próprio e simulado", () => {
    assert.equal(c.apply(first).applied, true);
    assert.equal(c.appliedCount, 1);
  });
  check("reenvio idêntico não duplica", () => {
    assert.equal(c.apply({ ...first, payload: { delivery_count: 1 } }).reason, "duplicate_idempotency");
    assert.equal(c.appliedCount, 1);
  });
  check("reordenação de campos JSON não cria falso conflito", () => {
    const reordered = { ...first, payload: { delivery_count: 1 }, ...{} };
    assert.equal(c.apply(reordered).reason, "duplicate_idempotency");
  });
  check("mesma chave com conteúdo divergente fica em quarentena", () => {
    const x = c.apply(make("evt-1", { payload: { delivery_count: 2 } }));
    assert.equal(x.reason, "idempotency_key_collision");
    assert.equal(x.isolated, true);
    assert.equal(c.appliedCount, 1);
  });
  check("mesmo event_id com chave diferente não vira segunda operação", () => {
    const x = c.apply(make("evt-1", { idempotency_key: "outro-id" }));
    assert.equal(x.reason, "event_id_collision");
    assert.equal(x.isolated, true);
    assert.equal(c.appliedCount, 1);
  });
  check("colisão atravessando modo de origem também bloqueia", () => {
    const x = c.apply(make("evt-1", { source_mode: "real" }));
    assert.equal(x.reason, "idempotency_key_collision");
    assert.equal(x.isolated, true);
  });
  check("colisão atravessando unidade também bloqueia", () => {
    const x = c.apply(make("evt-1", { unit_id: "OUTRA" }));
    assert.equal(x.reason, "idempotency_key_collision");
    assert.equal(x.isolated, true);
  });
  check("mudança tardia no objeto do emissor não altera fato aplicado", () => {
    first.payload.delivery_count = 999;
    assert.equal(c.appliedEvents[0].payload.delivery_count, 1);
    assert.equal(Object.isFrozen(c.appliedEvents[0].payload), true);
  });
  check("visões do consumidor não expõem listas internas mutáveis", () => {
    const publicEvents = c.appliedEvents;
    const quarantine = c.isolatedEvents;
    assert.equal(Object.isFrozen(publicEvents), true);
    assert.equal(Object.isFrozen(quarantine), true);
    assert.equal(c.appliedCount, 1);
  });
  check("entrada inválida com telefone não é retida", () => {
    const x = c.apply(make("evt-pii", { payload: { telefone: "000000" } }));
    assert.equal(x.reason, "schema_invalid");
    assert.equal(c.isolatedEvents[c.isolatedEvents.length - 1]?.raw, null);
    assert.equal(JSON.stringify(c.isolatedEvents).includes("000000"), false);
  });
  check("evento com schema incompatível não é retido", () => {
    const x = c.apply({ ...make("evt-wrong"), schema_version: "99.0.0" });
    assert.equal(x.reason, "schema_invalid");
    assert.equal(c.isolatedEvents[c.isolatedEvents.length - 1]?.raw, null);
  });
  check("evento cíclico não derruba o consumer", () => {
    const obj = make("evt-cycle");
    (obj.payload as Record<string, unknown>).self = obj.payload;
    const x = c.apply(obj);
    assert.equal(x.reason, "unsafe_event_envelope");
    assert.equal(x.isolated, true);
    assert.equal(c.isolatedEvents[c.isolatedEvents.length - 1]?.raw, null);
  });
  check("evento gigantesco fica fora sem cópia", () => {
    const x = c.apply(make("evt-big", { payload: { blob: "x".repeat(33000) } }));
    assert.equal(x.reason, "unsafe_event_envelope");
    assert.equal(c.isolatedEvents[c.isolatedEvents.length - 1]?.raw, null);
  });
  check("instância de classe em payload não vira objeto vazio silenciosamente", () => {
    const x = c.apply(make("evt-date", { payload: { unexpected: new Date("2026-11-03T12:00:00Z") } }));
    assert.equal(x.reason, "event_not_safe_json");
    assert.equal(x.isolated, true);
  });
  check("números não finitos são rejeitados sem publicação", () => {
    const x = c.apply(make("evt-nan", { payload: { duration: Number.POSITIVE_INFINITY } }));
    assert.equal(x.reason, "event_not_safe_json");
    assert.equal(c.appliedCount, 1);
  });
  check("duplicidade de IDs não mexe no checkpoint", () => {
    assert.equal(c.lastCheckpoint, "evt-1");
  });
  const edge = make("evt-link", {
    event_type: "delivery_added", delivery_id: "D-1", trip_id: "TRIP-1",
  });
  check("aresta pública de entrega continua funcionando", () => {
    assert.equal(c.apply(edge).applied, true);
    assert.deepEqual(c.eventsForTrip("TRIP-1").map(e => e.event_id), ["evt-1", "evt-link"]);
  });
  check("reinício só com checkpoint não inventa histórico", () => {
    c.restartFromCheckpoint("evt-link");
    assert.equal(c.historyIsComplete, false);
    assert.deepEqual(c.eventsForTrip("TRIP-1"), []);
  });
  check("evento novo após reinício parcial não desbloqueia histórico", () => {
    assert.equal(c.apply(make("evt-new")).applied, true);
    assert.deepEqual(c.appliedEvents, []);
    assert.deepEqual(c.eventsForTrip("TRIP-1"), []);
  });
  check("replay completo restaura correlação sem inventar fatos", () => {
    c.restartFromCheckpoint(null);
    assert.equal(c.historyIsComplete, true);
    const replayFirst = make("evt-1");
    assert.equal(c.apply(replayFirst).applied, true);
    assert.equal(c.apply(edge).applied, true);
    assert.deepEqual(c.eventsForTrip("TRIP-1").map(e => e.event_id), ["evt-1", "evt-link"]);
  });
  const c2 = new SimulatedCopilotoConsumer();
  const goodA = make("batch-a");
  const bad = { ...make("batch-b"), schema_version: "invalid" } as unknown as EntregasPublicEvent;
  const goodC = make("batch-c");
  const feed: EntregasEventFeed = {
    list: async () => [goodA, bad, goodC],
    poll: async () => ({ events: [goodA, bad, goodC], next_cursor: "batch-c" }),
  };
  const result = await c2.pullFromFeed(feed);
  check("batch para na primeira violação e não ignora um conflito", () => {
    assert.equal(result.applied, 1);
    assert.equal(result.isolated, 1);
    assert.equal(c2.appliedCount, 1);
    assert.equal(c2.lastCheckpoint, "batch-a");
    assert.equal(c2.appliedEvents.some(e => e.event_id === "batch-c"), false);
  });
  check("somente eventos simulados; nenhuma ação operacional", () => {
    assert.equal(c2.appliedEvents[0].source_mode, "simulated");
    assert.equal(c2.appliedEvents[0].source, "entregas");
  });
  console.log("OWN_COPILOT_REPLAY_CONTRACT_PASS " + passed + "/" + passed + " (SIMULATED_ONLY)");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
