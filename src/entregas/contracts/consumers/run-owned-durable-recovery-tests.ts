import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SimulatedCopilotoConsumer } from "./SimulatedCopilotoConsumer";
import { EXAMPLE_TRIP_CREATED } from "../events/examples";
import type { EntregasPublicEvent } from "../events/types";
import type { OutboxRecord } from "../../integration/outbox";
import { openFileUnitOfWork } from "../../persistence/file-store";
import { createFileEntregasEventFeed, EntregasFeedCursorNotFound } from "../../integration/durable-event-feed";

// Only fictional events in an isolated temporary file store. No external integration.
const UNIT = "ITAIM", TRIP = "TRIP-LAB", DELIVERY = "DEL-LAB";
let passed = 0;
function check(name: string, fn: () => void): void {
  fn(); passed++; console.log("OK " + name);
}
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn(); passed++; console.log("OK " + name);
}
function event(id: string, type: EntregasPublicEvent["event_type"],
  attrs: Partial<EntregasPublicEvent> = {}): EntregasPublicEvent {
  return {
    ...EXAMPLE_TRIP_CREATED, event_id: id, event_type: type,
    idempotency_key: "key:" + id,
    unit_id: UNIT, source_mode: "simulated", trip_id: TRIP,
    delivery_id: undefined,
    occurred_at: "2026-11-03T18:00:00.000Z",
    recorded_at: "2026-11-03T18:00:01.000Z",
    payload: {}, correlation_id: TRIP,
    ...attrs,
  };
}
function record(e: EntregasPublicEvent): OutboxRecord {
  return {
    outbox_id: "obx:" + e.event_id, event: e, status: "pending",
    attempts: 0, created_at: "2026-11-03T18:00:01.000Z",
  };
}
const source = [
  event("evt-trip", "trip_created"),
  event("evt-link", "delivery_added", {delivery_id: DELIVERY}),
  event("evt-arrival", "arrival_reported", {trip_id: undefined, delivery_id: DELIVERY}),
  event("evt-confirm", "delivery_confirmed", {trip_id: undefined, delivery_id: DELIVERY}),
];
async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "deliveryos-owned-replay-"));
  const file = join(dir,"store.json");
  try {
    const uow = openFileUnitOfWork(file);
    for (const e of source) await uow.outbox.enqueue(record(e));
    await checkAsync("Uncommitted events remain invisible", async () => {
      assert.deepEqual(await createFileEntregasEventFeed(file).list(), []);
    });
    await uow.commit();
    const feed = createFileEntregasEventFeed(file);
    await checkAsync("Committed fictional outbox becomes readable", async () => {
      assert.deepEqual((await feed.list()).map(e=>e.event_id), source.map(e=>e.event_id));
    });
    const consumer = new SimulatedCopilotoConsumer();
    await checkAsync("Initial page maintains a bounded trip relation", async () => {
      const result = await consumer.pullFromFeed(feed,2);
      assert.equal(result.applied,2);
      assert.deepEqual(consumer.eventsForTrip(TRIP).map(e=>e.event_id),
        ["evt-trip","evt-link"]);
      assert.equal(consumer.lastCheckpoint,"evt-link");
    });
    check("Restart from cursor hides an incomplete trip", () => {
      consumer.restartFromCheckpoint("evt-link");
      assert.equal(consumer.historyIsComplete,false);
      assert.deepEqual(consumer.eventsForTrip(TRIP),[]);
      assert.deepEqual(consumer.appliedEvents,[]);
    });
    await checkAsync("Incremental continuation cannot promote partial history", async () => {
      const result=await consumer.pullFromFeed(createFileEntregasEventFeed(file),10);
      assert.equal(result.applied,2);
      assert.equal(consumer.lastCheckpoint,"evt-confirm");
      assert.deepEqual(consumer.eventsForTrip(TRIP),[]);
    });
    await checkAsync("Full replay from origin safely reconstructs one trip", async () => {
      consumer.restartFromCheckpoint(null);
      const result=await consumer.pullFromFeed(createFileEntregasEventFeed(file),10);
      assert.equal(result.applied,4);
      assert.equal(consumer.historyIsComplete,true);
      assert.deepEqual(consumer.eventsForTrip(TRIP).map(e=>e.event_id),source.map(e=>e.event_id));
    });
    await checkAsync("Idle repoll produces no duplicate delivery", async () => {
      const before=consumer.appliedCount;
      const result=await consumer.pullFromFeed(feed,10);
      assert.equal(result.applied,0);
      assert.equal(consumer.appliedCount,before);
    });
    await checkAsync("Missing cursor fails closed without a new fact", async () => {
      consumer.restartFromCheckpoint("deleted-cursor");
      await assert.rejects(
        () => consumer.pullFromFeed(createFileEntregasEventFeed(file),10),
        EntregasFeedCursorNotFound,
      );
      assert.deepEqual(consumer.appliedEvents,[]);
      assert.deepEqual(consumer.eventsForTrip(TRIP),[]);
    });
    const later = event("evt-return", "trip_return_started");
    const lateUow = openFileUnitOfWork(file);
    await lateUow.outbox.enqueue(record(later));
    await checkAsync("Uncommitted later event is not published to readers", async () => {
      const items = await createFileEntregasEventFeed(file).poll("evt-confirm",10);
      assert.deepEqual(items.events,[]);
    });
    await lateUow.commit();
    await checkAsync("Committed late event is visible after reopen", async () => {
      const items=await createFileEntregasEventFeed(file).poll("evt-confirm",10);
      assert.deepEqual(items.events.map(e=>e.event_id),["evt-return"]);
    });
    await checkAsync("Full replay including late event yields unique trip history", async () => {
      consumer.restartFromCheckpoint(null);
      const result=await consumer.pullFromFeed(createFileEntregasEventFeed(file),10);
      assert.equal(result.applied,5);
      const list=consumer.eventsForTrip(TRIP);
      assert.deepEqual(list.map(e=>e.event_id),[...source.map(e=>e.event_id),"evt-return"]);
      assert.equal(new Set(list.map(e=>e.event_id)).size,5);
    });
    console.log("OWN_COPILOT_DURABLE_RECOVERY_PASS "+passed+"/"+passed+" (TEMP_FILE_FIXTURE_ONLY)");
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});