import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { createPilotPolicy } from "../foundation/policy";
import type { EntregasPublicEvent } from "../contracts/events/types";
import { EntregasApplicationService } from "../operational/application-service";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { OutboxRecord } from "./outbox";
import {
  CommittedOutboxEntregasEventFeed,
  EntregasFeedCursorNotFound,
  createFileEntregasEventFeed,
} from "./durable-event-feed";

let passed = 0;
const failures: string[] = [];

async function testCase(
  name: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(
      name + ": " + (e instanceof Error ? e.message : String(e)),
    );
  }
}

function event(id: string): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: "trip_started",
    schema_version: "1.0.0",
    occurred_at: "2026-09-30T22:00:00.000Z",
    recorded_at: "2026-09-30T22:00:01.000Z",
    idempotency_key: "idem-" + id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: "ITAIM",
    source_mode: "simulated",
    trip_id: "T1",
    payload: {},
    correlation_id: "T1",
    contract_version: "COR-ENTREGAS-V1@1.0.3",
  };
}

function record(id: string): OutboxRecord {
  return {
    outbox_id: "obx-" + id,
    event: event(id),
    status: "pending",
    attempts: 0,
    created_at: "2026-09-30T22:00:01.000Z",
  };
}

async function main(): Promise<void> {
  console.log("\n=== ENTREGAS DURABLE EVENT FEED ===\n");
  const dir = mkdtempSync(join(tmpdir(), "entregas-durable-feed-"));
  const file = join(dir, "store.json");

  try {
    await testCase("DF1 staged sem commit fica invisivel", async () => {
      const uow = openFileUnitOfWork(file);
      await uow.outbox.enqueue(record("e1"));
      const feed = createFileEntregasEventFeed(file);
      assert.deepEqual(await feed.list(), []);
      await uow.rollback();
    });

    await testCase("DF2 commit aparece em reader novo", async () => {
      const uow = openFileUnitOfWork(file);
      await uow.outbox.enqueue(record("e1"));
      await uow.commit();

      const events = await createFileEntregasEventFeed(file).list();
      assert.deepEqual(events.map((e) => e.event_id), ["e1"]);
      assert.equal(events[0].source_mode, "simulated");
    });

    await testCase("DF3 restart preserva ordem e cursor", async () => {
      const uow = openFileUnitOfWork(file);
      await uow.outbox.enqueue(record("e2"));
      await uow.outbox.enqueue(record("e3"));
      await uow.commit();

      const a = createFileEntregasEventFeed(file);
      const p1 = await a.poll(null, 2);
      assert.deepEqual(p1.events.map((e) => e.event_id), ["e1", "e2"]);
      assert.equal(p1.next_cursor, "e2");

      const b = createFileEntregasEventFeed(file);
      const p2 = await b.poll("e2", 2);
      assert.deepEqual(p2.events.map((e) => e.event_id), ["e3"]);
      assert.equal(p2.next_cursor, "e3");
    });

    await testCase("DF4 cursor desconhecido falha alto", async () => {
      const feed = createFileEntregasEventFeed(file);
      await assert.rejects(
        () => feed.poll("missing", 10),
        EntregasFeedCursorNotFound,
      );
    });

    await testCase("DF5 status push nao altera historico pull", async () => {
      const uow = openFileUnitOfWork(file);
      const all = await uow.outbox.all();
      await uow.outbox.markFailed(
        all[0].outbox_id,
        "fora",
        "2026-09-30T22:02:00.000Z",
      );
      await uow.outbox.markPublished(
        all[1].outbox_id,
        "2026-09-30T22:03:00.000Z",
      );
      await uow.commit();

      const ids = (await createFileEntregasEventFeed(file).list())
        .map((e) => e.event_id);
      assert.deepEqual(ids, ["e1", "e2", "e3"]);
    });

    await testCase("DF6 retorno e copia e nao muta store", async () => {
      const feed = createFileEntregasEventFeed(file);
      const first = await feed.list();
      first[0].payload.mutado = true;
      const again = await createFileEntregasEventFeed(file).list();
      assert.equal(again[0].payload.mutado, undefined);
    });

    await testCase("DF7 ApplicationService carimba modo explicito", async () => {
      const f = join(dir, "explicit.json");
      const uow = openFileUnitOfWork(f);
      const rider = asInternalRiderActorId("rider-feed");
      const svc = new EntregasApplicationService(
        uow,
        createPilotPolicy(),
        "simulated",
      );

      const c = await svc.execute({
        type: "CreateTrip",
        command_id: "c1",
        occurred_at: "2026-09-30T22:10:00.000Z",
        unit_id: "ITAIM",
        trip_id: "TF",
        courier_actor_id: rider,
        actor: {
          actor_id: "ops-feed",
          role: "operador_expedicao",
        },
        deliveries: [
          {
            delivery_id: "DF",
            order_ref: "PF",
            channel: "proprio",
          },
        ],
      });
      assert.equal(c.ok, true);

      const d = await svc.execute({
        type: "ConfirmTripDeparture",
        command_id: "c2",
        occurred_at: "2026-09-30T22:11:00.000Z",
        unit_id: "ITAIM",
        trip_id: "TF",
        actor: {
          actor_id: "rider-feed",
          role: "motoboy_interno",
        },
      });
      assert.equal(d.ok, true);

      const events = await createFileEntregasEventFeed(f).list();
      assert.ok(events.length >= 3);
      assert.ok(events.every((e) => e.source_mode === "simulated"));
    });

    await testCase("DF8 ausencia de modo nunca cai em real", async () => {
      const f = join(dir, "unknown.json");
      const uow = openFileUnitOfWork(f);
      const rider = asInternalRiderActorId("rider-unknown");
      const svc = new EntregasApplicationService(
        uow,
        createPilotPolicy(),
      );

      const c = await svc.execute({
        type: "CreateTrip",
        command_id: "u1",
        occurred_at: "2026-09-30T22:20:00.000Z",
        unit_id: "ITAIM",
        trip_id: "TU",
        courier_actor_id: rider,
        actor: {
          actor_id: "ops-unknown",
          role: "operador_expedicao",
        },
        deliveries: [
          {
            delivery_id: "DU",
            order_ref: "PU",
            channel: "proprio",
          },
        ],
      });
      assert.equal(c.ok, true);

      const events = await createFileEntregasEventFeed(f).list();
      assert.ok(events.length >= 2);
      assert.ok(events.every((e) => e.source_mode === undefined));
    });

    await testCase("DF9 adapter generico depende so da porta", async () => {
      const uow = openFileUnitOfWork(file);
      const feed = new CommittedOutboxEntregasEventFeed(
        () => uow.outbox,
      );
      assert.deepEqual(
        (await feed.list()).map((e) => e.event_id),
        ["e1", "e2", "e3"],
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log("\nENTREGAS_DURABLE_FEED: " + passed + "/9 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
