import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { CONTRACT_VERSION_FULL } from "../foundation/contract";
import type { DomainEvent, Handoff } from "../foundation/types";
import type { OutboxRecord } from "../integration/outbox";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import { openFileUnitOfWork } from "../persistence/file-store";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import {
  applyFileToPostgresCutover,
  planFileToPostgresCutover,
  readFilePilotStorageSnapshot,
  readPostgresPilotStorageSnapshot,
  snapshotCounts,
  snapshotFingerprint,
  validatePilotStorageSnapshot,
  type PilotStorageSnapshot,
} from "./storage-cutover";
import { FilePilotReadyOrderStore } from "./ready-orders";
import { createPgClient } from "../../platform/persistence/sql-client";
import { runMigrations } from "../../platform/migrations/runner";
import { diretorioDeMigrations } from "../../platform/migrations/localizar";

const URL = process.env.DELIVERYOS_PG_URL?.trim();
const UNIT = "CUTOVER_TEST";
const FAIL_UNIT = "CUTOVER_FAIL_TEST";

if (!URL) {
  console.log("PILOT_STORAGE_CUTOVER: PULADO (DELIVERYOS_PG_URL ausente)");
  process.exit(0);
}

let passed = 0;
const failures: string[] = [];

async function tc(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(name + ": " + (e instanceof Error ? e.message : String(e)));
  }
}

function domainEvent(
  id: string,
  type: string,
  tripId: string,
): DomainEvent {
  return {
    event_id: id,
    object_type: "trip",
    object_id: tripId,
    event_type: type,
    occurred_at: "2026-10-01T03:30:00.000Z",
    recorded_at: "2026-10-01T03:30:01.000Z",
    origin: "ops_console",
    actor_id: "ops-cutover",
    idempotency_key: "domain:" + id,
    payload: { proof: id },
    clock_trust: "trusted",
    contract_version: CONTRACT_VERSION_FULL,
  };
}

function outboxRecord(
  id: string,
  status: OutboxRecord["status"],
  attempts: number,
  unitId: string,
  tripId: string,
): OutboxRecord {
  return {
    outbox_id: "obx-" + id,
    event: {
      event_id: "pub-" + id,
      event_type: id.endsWith("2") ? "delivery_added" : "trip_created",
      schema_version: "1.0.0",
      occurred_at: "2026-10-01T03:30:00.000Z",
      recorded_at: "2026-10-01T03:30:01.000Z",
      idempotency_key: "public:" + id,
      source: "entregas",
      source_health: "ok",
      confidence: "observed",
      unit_id: unitId,
      source_mode: "simulated",
      trip_id: tripId,
      payload: { proof: id },
      correlation_id: tripId,
      contract_version: CONTRACT_VERSION_FULL,
    },
    status,
    attempts,
    created_at: "2026-10-01T03:30:01.000Z",
    last_attempt_at:
      attempts > 0 ? "2026-10-01T03:31:00.000Z" : undefined,
    last_error: status === "failed" ? "fixture_failure" : undefined,
    published_at:
      status === "published" ? "2026-10-01T03:32:00.000Z" : undefined,
  };
}

async function buildSource(
  root: string,
  unitId = UNIT,
  tripId = "CUTOVER-TRIP",
): Promise<{ data: string; ready: string; snapshot: PilotStorageSnapshot }> {
  const data = join(root, unitId + "-store.json");
  const ready = join(root, unitId + "-ready.json");
  const uow = openFileUnitOfWork(data);
  const rider = asInternalRiderActorId(
    unitId === UNIT ? "cutover-rider" : "cutover-fail-rider",
  );
  const deliveryId = unitId === UNIT ? "CUTOVER-D1" : "CUTOVER-FAIL-D1";
  const handoffId = unitId === UNIT ? "CUTOVER-H1" : "CUTOVER-FAIL-H1";
  const occurrenceId = unitId === UNIT ? "CUTOVER-O1" : "CUTOVER-FAIL-O1";
  const eventPrefix = unitId === UNIT ? "cutover" : "cutover-fail";

  await uow.trips.save(
    {
      trip: {
        trip_id: tripId,
        unit_id: unitId,
        courier_actor_id: rider,
        created_by: "ops-cutover",
        state: "preparando_saida",
        delivery_ids: [deliveryId],
        created_at: "2026-10-01T03:30:00.000Z",
        last_event_id: "evt-" + eventPrefix + "-1",
        contract_version: CONTRACT_VERSION_FULL,
        policy_bundle_id: "cutover-policy",
      },
      deliveries: [
        {
          delivery_id: deliveryId,
          trip_id: tripId,
          order_ref: "ORDER-IN-TRIP-" + unitId,
          channel: "proprio",
          planned_stop_order: 1,
          state: "aguardando_saida",
          active: true,
        },
      ],
      version: 0,
    },
    null,
  );
  await uow.commit();

  const first = await uow.trips.get(tripId);
  assert.ok(first);
  await uow.trips.save(
    {
      ...first,
      trip: {
        ...first.trip,
        state: "em_rota",
        started_at: "2026-10-01T03:31:00.000Z",
        last_event_id: "evt-" + eventPrefix + "-2",
      },
      deliveries: first.deliveries.map((d) => ({
        ...d,
        state: "em_rota" as const,
      })),
    },
    first.version,
  );

  const handoff: Handoff = {
    handoff_id: handoffId,
    unit_id: unitId,
    external_order_ref: "IFOOD-" + unitId,
    state: "repassado",
    courier_verified: true,
    courier_verification_method: "codigo",
    confirmed: true,
    handoff_at: "2026-10-01T03:31:30.000Z",
    contract_version: CONTRACT_VERSION_FULL,
  };
  await uow.handoffs.save(handoff, 4, null);

  const occurrence: Occurrence = {
    occurrence_id: occurrenceId,
    unit_id: unitId,
    type: "teste_cutover",
    source_channel: "console",
    related_trip_id: tripId,
    state: "resolvida",
    report: "fixture",
    executed_action: "ok",
    evidence: "proof",
    owner_role: "lider_delivery",
    confirmation: "known",
    blocks_availability: false,
    opened_at: "2026-10-01T03:30:30.000Z",
    opened_by: "ops-cutover",
    closed_at: "2026-10-01T03:31:30.000Z",
    closed_by: "ops-cutover",
    contract_version: CONTRACT_VERSION_FULL,
    version: 3,
  };
  await uow.occurrences.save(occurrence, null);

  const riderState: RiderOperationalState = {
    rider_id: rider,
    unit_id: unitId,
    availability: "em_rota",
    occurrence_blocking_availability: false,
    active_trip_id: tripId,
    version: 5,
    updated_at: "2026-10-01T03:31:00.000Z",
  };
  await uow.riders.save(riderState, null);

  await uow.events.append([
    domainEvent("evt-" + eventPrefix + "-1", "trip_created", tripId),
    domainEvent("evt-" + eventPrefix + "-2", "trip_started", tripId),
  ]);
  await uow.outbox.enqueue(
    outboxRecord(eventPrefix + "-1", "published", 1, unitId, tripId),
  );
  await uow.outbox.enqueue(
    outboxRecord(eventPrefix + "-2", "failed", 2, unitId, tripId),
  );
  await uow.commit();

  const readyStore = new FilePilotReadyOrderStore(ready);
  await readyStore.add({
    order_ref: "ORDER-STILL-READY-" + unitId,
    label: "Pedido ainda pronto",
    channel: "proprio",
    created_at: "2026-10-01T03:33:00.000Z",
  });

  const snapshot = await readFilePilotStorageSnapshot({
    unit_id: unitId,
    data_file: data,
    ready_file: ready,
  });
  return { data, ready, snapshot };
}

async function cleanUnit(
  admin: Awaited<ReturnType<typeof createPgClient>>,
  unitId: string,
): Promise<void> {
  await admin.transaction(async (tx) => {
    await tx.query("DELETE FROM entregas.ready_order WHERE unit_id=$1", [unitId]);
    await tx.query("DELETE FROM entregas.public_outbox WHERE unit_id=$1", [unitId]);
    await tx.query("DELETE FROM entregas.rider_state WHERE unit_id=$1", [unitId]);
    await tx.query("DELETE FROM entregas.handoff WHERE unit_id=$1", [unitId]);
    await tx.query("DELETE FROM entregas.occurrence WHERE unit_id=$1", [unitId]);
    const trips = await tx.query<{ trip_id: string }>(
      "SELECT trip_id FROM entregas.trip WHERE unit_id=$1",
      [unitId],
    );
    for (const trip of trips) {
      await tx.query("DELETE FROM entregas.delivery WHERE trip_id=$1", [
        trip.trip_id,
      ]);
    }
    await tx.query("DELETE FROM entregas.trip WHERE unit_id=$1", [unitId]);
  });
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pilot-cutover-"));
  const admin = await createPgClient({ url: URL!, max: 4 });
  try {
    const migrations = await runMigrations(admin, diretorioDeMigrations());
    assert.equal(migrations.mismatch, undefined);
    for (const unit of [UNIT, FAIL_UNIT]) {
      await admin.query(
        `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
         VALUES ($1,$1,'America/Sao_Paulo',true)
         ON CONFLICT (unit_id) DO UPDATE SET active=true`,
        [unit],
      );
      await cleanUnit(admin, unit);
    }

    const source = await buildSource(root);

    await tc("CUT1 leitura é estável e preserva versões > 1", () => {
      assert.equal(source.snapshot.trips[0].version, 2);
      assert.equal(source.snapshot.handoffs[0].version, 4);
      assert.equal(source.snapshot.occurrences[0].version, 3);
      assert.equal(source.snapshot.riders[0].version, 5);
      assert.deepEqual(snapshotCounts(source.snapshot), {
        trips: 1,
        deliveries: 1,
        handoffs: 1,
        occurrences: 1,
        riders: 1,
        events: 2,
        outbox: 2,
        ready_orders: 1,
      });
    });

    await tc("CUT2 plan é read-only e só aprova destino vazio", async () => {
      const before = await readPostgresPilotStorageSnapshot(admin, UNIT);
      const plan = await planFileToPostgresCutover({
        sql: admin,
        snapshot: source.snapshot,
      });
      const after = await readPostgresPilotStorageSnapshot(admin, UNIT);
      assert.equal(plan.can_apply, true);
      assert.deepEqual(plan.conflicts, []);
      assert.equal(snapshotFingerprint(before), snapshotFingerprint(after));
      assert.equal(
        Object.values(plan.target_counts).reduce((a, b) => a + b, 0),
        0,
      );
    });

    await tc("CUT3 apply preserva conteúdo, ordem e fingerprint", async () => {
      const result = await applyFileToPostgresCutover({
        sql: admin,
        snapshot: source.snapshot,
      });
      assert.equal(result.source_fingerprint, result.target_fingerprint);
      assert.deepEqual(result.imported_counts, snapshotCounts(source.snapshot));
      const pg = await readPostgresPilotStorageSnapshot(admin, UNIT);
      assert.equal(snapshotFingerprint(pg), snapshotFingerprint(source.snapshot));
      assert.deepEqual(
        pg.events.map((x) => x.event_id),
        ["evt-cutover-1", "evt-cutover-2"],
      );
      assert.deepEqual(
        pg.outbox.map((x) => [x.outbox_id, x.status, x.attempts]),
        [
          ["obx-cutover-1", "published", 1],
          ["obx-cutover-2", "failed", 2],
        ],
      );
    });

    await tc("CUT4 continuidade: update normal parte da version importada", async () => {
      const uow = new PgEntregasUnitOfWork(admin, UNIT);
      const current = await uow.trips.get("CUTOVER-TRIP");
      assert.ok(current);
      assert.equal(current.version, 2);
      await uow.trips.save(
        {
          ...current,
          trip: {
            ...current.trip,
            manual_close_reason: "continuidade-provada",
          },
        },
        2,
      );
      await uow.commit();
      const updated = await new PgEntregasUnitOfWork(admin, UNIT).trips.get(
        "CUTOVER-TRIP",
      );
      assert.equal(updated?.version, 3);
      assert.equal(updated?.trip.manual_close_reason, "continuidade-provada");
    });

    await tc("CUT5 reaplicar em destino não vazio é recusado", async () => {
      const plan = await planFileToPostgresCutover({
        sql: admin,
        snapshot: source.snapshot,
      });
      assert.equal(plan.can_apply, false);
      assert.match(plan.conflicts.join(" "), /não está vazio/);
      await assert.rejects(
        () =>
          applyFileToPostgresCutover({
            sql: admin,
            snapshot: source.snapshot,
          }),
        /não está vazio/,
      );
    });

    await tc("CUT6 ready-order sobreposto com delivery é recusado antes de escrever", async () => {
      const failSource = await buildSource(
        join(root, "overlap"),
        FAIL_UNIT,
        "OVERLAP-TRIP",
      );
      const inconsistent: PilotStorageSnapshot = structuredClone(
        failSource.snapshot,
      );
      inconsistent.ready_orders = [
        {
          order_ref: inconsistent.trips[0].deliveries[0].order_ref,
          label: "inconsistente",
          created_at: "2026-10-01T03:40:00.000Z",
        },
      ];
      const conflicts = validatePilotStorageSnapshot(inconsistent);
      assert.ok(conflicts.some((x) => x.includes("já existe em delivery")));
      const plan = await planFileToPostgresCutover({
        sql: admin,
        snapshot: inconsistent,
      });
      assert.equal(plan.can_apply, false);
      const target = await readPostgresPilotStorageSnapshot(admin, FAIL_UNIT);
      assert.equal(
        Object.values(snapshotCounts(target)).reduce((a, b) => a + b, 0),
        0,
      );
    });

    await tc("CUT7 falha tardia do banco faz rollback de toda a importação", async () => {
      const failSource = await buildSource(
        join(root, "late-failure"),
        FAIL_UNIT,
        "CUTOVER-FAIL-TRIP",
      );
      const plan = await planFileToPostgresCutover({
        sql: admin,
        snapshot: failSource.snapshot,
      });
      assert.equal(plan.can_apply, true);

      await admin.query(`
        CREATE OR REPLACE FUNCTION entregas.cutover_fail_fixture()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.unit_id = 'CUTOVER_FAIL_TEST' THEN
            RAISE EXCEPTION 'cutover_late_failure_fixture';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await admin.query(
        "DROP TRIGGER IF EXISTS cutover_fail_fixture ON entregas.public_outbox",
      );
      await admin.query(`
        CREATE TRIGGER cutover_fail_fixture
          BEFORE INSERT ON entregas.public_outbox
          FOR EACH ROW EXECUTE FUNCTION entregas.cutover_fail_fixture()
      `);

      try {
        await assert.rejects(
          () =>
            applyFileToPostgresCutover({
              sql: admin,
              snapshot: failSource.snapshot,
            }),
          /cutover_late_failure_fixture/,
        );
      } finally {
        await admin.query(
          "DROP TRIGGER IF EXISTS cutover_fail_fixture ON entregas.public_outbox",
        );
        await admin.query(
          "DROP FUNCTION IF EXISTS entregas.cutover_fail_fixture()",
        );
      }

      const target = await readPostgresPilotStorageSnapshot(admin, FAIL_UNIT);
      assert.equal(
        Object.values(snapshotCounts(target)).reduce((a, b) => a + b, 0),
        0,
      );
    });

    console.log("\nPILOT_STORAGE_CUTOVER: " + passed + "/7 PASS");
  } finally {
    await cleanUnit(admin, UNIT).catch(() => undefined);
    await cleanUnit(admin, FAIL_UNIT).catch(() => undefined);
    await admin.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
