/**
 * Ensaio de duas filas locais e receptor simulado, sem aparelhos ou rede reais.
 * Nenhum sistema do caixa, GPS, fornecedor externo ou banco de produção é acessado.
 */
import assert from "node:assert/strict";
import { OfflineQueue, MemoryOfflineStorage, DEFAULT_OFFLINE_CONFIG,
  type OfflineItem, type SyncAck } from "./queue";
import { SimulatedCopilotoConsumer } from "../contracts/consumers/SimulatedCopilotoConsumer";
import { EXAMPLE_TRIP_CREATED } from "../contracts/events/examples";
import type { EntregasPublicEvent } from "../contracts/events/types";

const NOW = "2026-11-03T18:00:00.000Z";
const TRIP = "TRIP-ITM-FICTICIA";
const DELIVERY = "DEL-FICTICIA";
const makeQueue = (storage: MemoryOfflineStorage, device: string) => new OfflineQueue(
  storage, { ...DEFAULT_OFFLINE_CONFIG, device_id: device }, () => new Date(NOW));
const clientA = new MemoryOfflineStorage(), clientB = new MemoryOfflineStorage();
const server = new SimulatedCopilotoConsumer();
let passed = 0;
function check(title: string, fn: () => void): void {
  fn(); passed++;
  console.log("OK " + title);
}
function add(queue: OfflineQueue, id: string,
  kind: EntregasPublicEvent["event_type"], key = "key:" + id,
  payload: Record<string, unknown> = {}): void {
  queue.enqueue({ event_id:id,idempotency_key:key,kind,payload,
    trip_id:TRIP,occurred_at:NOW });
}
function toPublic(item: OfflineItem): EntregasPublicEvent {
  if (item.kind !== "trip_created" && item.kind !== "delivery_added" &&
      item.kind !== "arrival_reported" && item.kind !== "delivery_confirmed")
    throw Error("UNEXPECTED_SYNTHETIC_EVENT_KIND");
  return {
    ...EXAMPLE_TRIP_CREATED,
    event_id:item.event_id,
    event_type:item.kind,
    idempotency_key:item.idempotency_key,
    source:"entregas", source_mode:"simulated", unit_id:"ITAIM",
    trip_id: item.kind === "arrival_reported" ||
      item.kind === "delivery_confirmed" ? undefined : item.trip_id,
    delivery_id: item.kind === "trip_created" ? undefined : DELIVERY,
    occurred_at:item.occurred_at, recorded_at:item.recorded_at,
    payload:structuredClone(item.payload),
    correlation_id:TRIP,
  };
}
function accept(items: readonly OfflineItem[]): SyncAck[] {
  return items.map(item => {
    const result = server.apply(toPublic(item));
    return { event_id:item.event_id,
      status: result.applied ? "accepted" :
        result.reason === "duplicate_idempotency" ? "duplicate" : "conflict",
      synced_at:NOW,
      error: result.isolated ? result.reason : undefined,
    };
  });
}

function main(): void {
  let a = makeQueue(clientA, "dev-A-pseudo");
  let b = makeQueue(clientB, "dev-B-pseudo");
  check("two isolated devices begin with independent empty stores",()=>{
    assert.equal(clientA.read(),null);
    assert.equal(clientB.read(),null);
    assert.equal(server.appliedCount,0);
  });
  check("A produces canonical trip and explicit delivery edge offline",()=>{
    add(a,"a-trip","trip_created");
    add(a,"a-link","delivery_added");
    assert.deepEqual(a.all().map(x=>x.sequence_local),[1,2]);
    assert.equal(a.stats().pending,2);
    assert.equal(b.stats().pending,0);
  });
  check("B produces arrival and delivery without A local data",()=>{
    add(b,"b-arrived","arrival_reported");
    add(b,"b-confirmed","delivery_confirmed");
    assert.equal(b.stats().pending,2);
    assert.equal(a.stats().pending,2);
    assert.notEqual(clientA.read(),clientB.read());
    assert.ok(b.all().every(x=>x.device_id==="dev-B-pseudo"));
  });
  check("network ACK loss leaves A unconfirmed despite receiver acceptance",()=>{
    const batch=a.nextBatch(2);
    const ack=accept(batch.items);
    assert.deepEqual(ack.map(x=>x.status),["accepted","accepted"]);
    assert.equal(server.appliedCount,2);
    assert.equal(a.stats().sending,2);
    // Deliberately drop the ACK response, as in network timeout.
  });
  check("A restart preserves original local timestamps and recovers sending",()=>{
    a=makeQueue(clientA,"dev-A-pseudo");
    assert.equal(a.recoverStuck(),2);
    assert.equal(a.stats().pending,2);
    assert.ok(a.all().every(x=>x.occurred_at===NOW));
  });
  check("retransmission of A is idempotent and marks both synced",()=>{
    const batch=a.nextBatch();
    const ack=accept(batch.items);
    assert.deepEqual(ack.map(x=>x.status),["duplicate","duplicate"]);
    a.applyAcks(ack);
    assert.equal(a.stats().synced,2);
    assert.equal(server.appliedCount,2);
  });
  check("B reconnects partially and keeps the remainder for replay",()=>{
    const batch=b.nextBatch(1);
    b.applyAcks(accept(batch.items));
    assert.equal(b.stats().synced,1);
    assert.equal(b.stats().pending,1);
  });
  check("B restart continues remaining item without changing A state",()=>{
    b=makeQueue(clientB,"dev-B-pseudo");
    b.applyAcks(accept(b.nextBatch(1).items));
    assert.equal(b.stats().synced,2);
    assert.equal(a.stats().synced,2);
  });
  check("server converges on one trip with four original events",()=>{
    const events=server.eventsForTrip(TRIP);
    assert.deepEqual(events.map(x=>x.event_id),
      ["a-trip","a-link","b-arrived","b-confirmed"]);
    assert.equal(new Set(events.map(x=>x.event_id)).size,4);
    assert.equal(server.appliedCount,4);
  });
  check("same business key on A and B with different facts becomes conflict",()=>{
    add(a,"a-close","delivery_confirmed","same-business-key",{result:"a"});
    const ackA=accept(a.nextBatch(1).items);
    a.applyAcks(ackA);
    assert.equal(ackA[0].status,"accepted");
    add(b,"b-close-divergent","delivery_confirmed","same-business-key",{result:"b"});
    const ackB=accept(b.nextBatch(1).items);
    assert.equal(ackB[0].status,"conflict");
    b.applyAcks(ackB);
    assert.equal(b.stats().conflict,1);
    assert.equal(server.appliedCount,5);
  });
  check("late positive ACK cannot erase B conflict",()=>{
    b.applyAcks([{event_id:"b-close-divergent",status:"accepted",synced_at:NOW}]);
    assert.equal(b.stats().conflict,1);
    assert.equal(b.all().find(x=>x.event_id==="b-close-divergent")?.last_error,
      "idempotency_key_collision");
  });
  check("device restart preserves visible conflict for manual resolution",()=>{
    b=makeQueue(clientB,"dev-B-pseudo");
    assert.equal(b.stats().conflict,1);
    assert.equal(b.all().length,3);
    assert.equal(b.pendingCount(),0);
  });
  check("new reads cannot mutate another device through returned data",()=>{
    const readA=a.all();
    readA[0].payload.safe="changed-copy";
    const readB=b.all();
    readB[0].payload.safe="changed-copy";
    assert.equal(a.all()[0].payload.safe,undefined);
    assert.equal(b.all()[0].payload.safe,undefined);
  });
  check("replayed same A event remains unique after both clients finish",()=>{
    const before=server.appliedCount;
    const prior=a.all().find(x=>x.event_id==="a-trip");
    assert.ok(prior);
    assert.equal(accept([prior!])[0].status,"duplicate");
    assert.equal(server.appliedCount,before);
  });
  console.log("OWN_TWO_DEVICE_SIMULATION_PASS "+passed+"/"+passed+
    " (TWO_FICTIONAL_STORES_NO_REAL_NETWORK)");
}
main();
