import assert from "node:assert/strict";

import { asInternalRiderActorId } from "./foundation/brands";
import { createPilotPolicy } from "./foundation/policy";
import type { Delivery } from "./foundation/types";
import { EntregasApplicationService } from "./operational/application-service";
import { ConcurrencyError } from "./persistence/ports";
import { PgEntregasUnitOfWork } from "./persistence/pg-uow";
import { CommittedOutboxEntregasEventFeed } from "./integration/durable-event-feed";
import type { OutboxRecord } from "./integration/outbox";
import { createPgClient } from "../platform/persistence/sql-client";
import { runMigrations } from "../platform/migrations/runner";
import { diretorioDeMigrations } from "../platform/migrations/localizar";

const URL = process.env.DELIVERYOS_PG_URL?.trim();
const UNIT = "CLUSTER_TEST";
const UNIT2 = "CLUSTER_OTHER";

if (!URL) {
  console.log("ENTREGAS_PG_UOW: PULADO (DELIVERYOS_PG_URL ausente)");
  process.exit(0);
}

let passed = 0;
const failures: string[] = [];
async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(name + ": " + (e instanceof Error ? e.message : String(e)));
  }
}

function addDelivery(
  record: Awaited<ReturnType<PgEntregasUnitOfWork["trips"]["get"]>>,
  id: string,
  order: string,
) {
  assert.ok(record);
  const d: Delivery = {
    delivery_id: id,
    trip_id: record.trip.trip_id,
    order_ref: order,
    channel: "proprio",
    planned_stop_order: record.deliveries.length + 1,
    state: record.trip.state === "preparando_saida" ? "aguardando_saida" : "em_rota",
    active: true,
  };
  return {
    trip: {
      ...record.trip,
      delivery_ids: [...record.trip.delivery_ids, id],
    },
    deliveries: [...record.deliveries, d],
    version: record.version,
  };
}

async function cleanup(client: Awaited<ReturnType<typeof createPgClient>>) {
  await client.transaction(async (tx) => {
    for (const u of [UNIT, UNIT2]) {
      await tx.query(`DELETE FROM entregas.public_outbox WHERE unit_id=$1`, [u]);
      await tx.query(`DELETE FROM entregas.rider_state WHERE unit_id=$1`, [u]);
      await tx.query(`DELETE FROM entregas.handoff WHERE unit_id=$1`, [u]);
      await tx.query(`DELETE FROM entregas.occurrence WHERE unit_id=$1`, [u]);
      const trips = await tx.query<{ trip_id: string }>(
        `SELECT trip_id FROM entregas.trip WHERE unit_id=$1`,
        [u],
      );
      for (const t of trips) {
        await tx.query(`DELETE FROM entregas.delivery WHERE trip_id=$1`, [t.trip_id]);
      }
      await tx.query(`DELETE FROM entregas.trip WHERE unit_id=$1`, [u]);
    }
  });
}

async function main() {
  const admin = await createPgClient({ url: URL!, ssl: true, max: 4 });
  const a = await createPgClient({ url: URL!, ssl: true, max: 2 });
  const b = await createPgClient({ url: URL!, ssl: true, max: 2 });
  try {
    const mig = await runMigrations(admin, diretorioDeMigrations());
    console.log("  migrations", JSON.stringify(mig));

    await admin.query(
      `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
       VALUES ($1,$1,'America/Sao_Paulo',true)
       ON CONFLICT (unit_id) DO UPDATE SET active=true`,
      [UNIT],
    );
    await admin.query(
      `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
       VALUES ($1,$1,'America/Sao_Paulo',true)
       ON CONFLICT (unit_id) DO UPDATE SET active=true`,
      [UNIT2],
    );
    await cleanup(admin);

    await testCase("PGU1 migration completa schema sem state_store paralelo", async () => {
      const rows = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM information_schema.tables
          WHERE table_schema='entregas'
            AND table_name IN ('trip','delivery','occurrence','handoff','rider_state','domain_event','public_outbox')`,
      );
      assert.equal(Number(rows[0].n), 7);
      const stateStore = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema='entregas' AND table_name='state_store'`,
      );
      assert.equal(Number(stateStore[0].n), 0);
    });

    await testCase("PGU2 ApplicationService confirma dominio + eventos + outbox juntos", async () => {
      const uow = new PgEntregasUnitOfWork(a, UNIT);
      const svc = new EntregasApplicationService(
        uow,
        createPilotPolicy(),
        "simulated",
      );
      const r = await svc.execute({
        type: "CreateTrip",
        command_id: "pg-create",
        occurred_at: "2026-09-30T23:00:00.000Z",
        unit_id: UNIT,
        trip_id: "PGT1",
        courier_actor_id: asInternalRiderActorId("pg-rider"),
        actor: { actor_id: "pg-ops", role: "operador_expedicao" },
        deliveries: [
          { delivery_id: "PGD1", order_ref: "PGO1", channel: "proprio" },
        ],
      });
      assert.equal(r.ok, true);
      const trip = await new PgEntregasUnitOfWork(a, UNIT).trips.get("PGT1");
      assert.equal(trip?.version, 1);
      assert.equal(trip?.deliveries.length, 1);
      const events = await new PgEntregasUnitOfWork(a, UNIT).events.listAll();
      const outbox = await new PgEntregasUnitOfWork(a, UNIT).outbox.all();
      assert.ok(events.length >= 2);
      assert.ok(outbox.length >= 2);
      assert.ok(outbox.every((x) => x.event.source_mode === "simulated"));
    });

    await testCase("PGU3 duas instancias na mesma versao: exatamente uma vence", async () => {
      const u1 = new PgEntregasUnitOfWork(a, UNIT);
      const u2 = new PgEntregasUnitOfWork(b, UNIT);
      const r1 = await u1.trips.get("PGT1");
      const r2 = await u2.trips.get("PGT1");
      assert.ok(r1 && r2);
      assert.equal(r1.version, 1);
      assert.equal(r2.version, 1);
      await u1.trips.save(addDelivery(r1, "PGD2", "PGO2"), r1.version);
      await u2.trips.save(addDelivery(r2, "PGD3", "PGO3"), r2.version);

      const settled = await Promise.allSettled([u1.commit(), u2.commit()]);
      const wins = settled.filter((x) => x.status === "fulfilled");
      const losses = settled.filter((x) => x.status === "rejected");
      assert.equal(wins.length, 1);
      assert.equal(losses.length, 1);
      const reason = (losses[0] as PromiseRejectedResult).reason;
      assert.ok(reason instanceof ConcurrencyError);

      const final = await new PgEntregasUnitOfWork(a, UNIT).trips.get("PGT1");
      assert.ok(final);
      assert.equal(final.version, 2);
      assert.equal(final.deliveries.length, 2);
      assert.equal(
        Number(final.deliveries.some((d) => d.delivery_id === "PGD2")) +
          Number(final.deliveries.some((d) => d.delivery_id === "PGD3")),
        1,
      );
      await u1.rollback();
      await u2.rollback();
    });

    await testCase("PGU4 loser recarrega e retry preserva as duas mudancas", async () => {
      const fresh = new PgEntregasUnitOfWork(b, UNIT);
      const cur = await fresh.trips.get("PGT1");
      assert.ok(cur);
      const missing = cur.deliveries.some((d) => d.delivery_id === "PGD2")
        ? ["PGD3", "PGO3"]
        : ["PGD2", "PGO2"];
      await fresh.trips.save(
        addDelivery(cur, missing[0], missing[1]),
        cur.version,
      );
      await fresh.commit();

      const final = await new PgEntregasUnitOfWork(a, UNIT).trips.get("PGT1");
      assert.ok(final);
      assert.equal(final.version, 3);
      assert.deepEqual(
        final.deliveries.map((d) => d.delivery_id).sort(),
        ["PGD1", "PGD2", "PGD3"],
      );
    });

    await testCase("PGU5 falha tardia da outbox desfaz update do dominio", async () => {
      const u = new PgEntregasUnitOfWork(a, UNIT);
      const cur = await u.trips.get("PGT1");
      assert.ok(cur);
      const changed = {
        ...cur,
        trip: { ...cur.trip, manual_close_reason: "NAO_PODE_FICAR" },
      };
      await u.trips.save(changed, cur.version);

      const bad: OutboxRecord = {
        outbox_id: "bad-outbox",
        event: {
          event_id: "bad-event",
          event_type: "trip_started",
          schema_version: "1.0.0",
          occurred_at: "2026-09-30T23:10:00.000Z",
          recorded_at: "2026-09-30T23:10:01.000Z",
          idempotency_key: "bad-event-key",
          source: "entregas",
          source_health: "ok",
          confidence: "observed",
          unit_id: UNIT,
          source_mode: "simulated",
          trip_id: "PGT1",
          payload: {},
          correlation_id: "PGT1",
        },
        status: "INVALIDO" as OutboxRecord["status"],
        attempts: 0,
        created_at: "2026-09-30T23:10:01.000Z",
      };
      await u.outbox.enqueue(bad);
      await assert.rejects(() => u.commit());
      await u.rollback();

      const final = await new PgEntregasUnitOfWork(a, UNIT).trips.get("PGT1");
      assert.ok(final);
      assert.equal(final.version, 3);
      assert.equal(final.trip.manual_close_reason, undefined);
      const badRows = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM entregas.public_outbox WHERE event_id='bad-event'`,
      );
      assert.equal(Number(badRows[0].n), 0);
    });

    await testCase("PGU6 feed commitado preserva ordem, cursor e restart", async () => {
      const feedA = new CommittedOutboxEntregasEventFeed(
        () => new PgEntregasUnitOfWork(a, UNIT).outbox,
      );
      const all = await feedA.list();
      assert.ok(all.length >= 2);
      const p1 = await feedA.poll(null, 1);
      assert.equal(p1.events.length, 1);
      assert.equal(p1.next_cursor, p1.events[0].event_id);

      const feedB = new CommittedOutboxEntregasEventFeed(
        () => new PgEntregasUnitOfWork(b, UNIT).outbox,
      );
      const p2 = await feedB.poll(p1.next_cursor, 50);
      assert.equal(p2.events.length, all.length - 1);
      assert.deepEqual(
        [p1.events[0], ...p2.events].map((e) => e.event_id),
        all.map((e) => e.event_id),
      );
    });

    await testCase("PGU7 unidade diferente nao enxerga estado nem outbox", async () => {
      const other = new PgEntregasUnitOfWork(b, UNIT2);
      assert.equal(await other.trips.get("PGT1"), null);
      assert.deepEqual(await other.outbox.all(), []);
      assert.deepEqual(await other.events.listAll(), []);
    });

    await testCase("PGU8 domain_event permanece append-only no banco", async () => {
      const rows = await admin.query<{ event_id: string }>(
        `SELECT event_id FROM entregas.domain_event WHERE unit_id=$1 ORDER BY seq LIMIT 1`,
        [UNIT],
      );
      assert.ok(rows.length);
      await assert.rejects(
        () =>
          admin.query(
            `UPDATE entregas.domain_event SET event_type='mutado' WHERE event_id=$1`,
            [rows[0].event_id],
          ),
        /append-only/,
      );
    });
  } finally {
    await cleanup(admin).catch(() => undefined);
    await Promise.all([a.close(), b.close(), admin.close()]);
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
  console.log("\nENTREGAS_PG_UOW: " + passed + "/8 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
