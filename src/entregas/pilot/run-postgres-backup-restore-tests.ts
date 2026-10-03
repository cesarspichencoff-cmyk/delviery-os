import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { bancoIsolado, bancoVazio, type BancoIsolado } from "../../platform/banco-isolado";
import { asInternalRiderActorId } from "../foundation/brands";
import { CONTRACT_VERSION_FULL } from "../foundation/contract";
import type { DomainEvent, Handoff } from "../foundation/types";
import type { OutboxRecord } from "../integration/outbox";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import { PgPilotReadyOrderStore } from "./ready-orders";
import {
  downloadBackupBundleS3,
  exportBackupBundleS3,
  type S3OffhostConfig,
} from "./backup-offhost-s3";
import {
  readPostgresPilotStorageSnapshot,
  snapshotCounts,
  snapshotFingerprint,
} from "./storage-cutover";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const PG_BIN = process.env.DELIVERYOS_PG_BIN ?? "";
const ferramenta = (nome: string): string => (PG_BIN ? join(PG_BIN, nome) : nome);
const UNIT = "PILOT_BACKUP";

const S3_REQUIRED = [
  "ENTREGAS_BACKUP_S3_ENDPOINT",
  "ENTREGAS_BACKUP_S3_REGION",
  "ENTREGAS_BACKUP_S3_BUCKET",
  "ENTREGAS_BACKUP_S3_PREFIX",
  "ENTREGAS_BACKUP_S3_WRITE_ACCESS_KEY_ID",
  "ENTREGAS_BACKUP_S3_WRITE_SECRET_ACCESS_KEY",
  "ENTREGAS_BACKUP_S3_READ_ACCESS_KEY_ID",
  "ENTREGAS_BACKUP_S3_READ_SECRET_ACCESS_KEY",
];
const S3_ENABLED = S3_REQUIRED.every((name) => (process.env[name] ?? "").trim());

function s3Config(role: "WRITE" | "READ"): S3OffhostConfig {
  const need = (name: string): string => {
    const value = (process.env[name] ?? "").trim();
    if (!value) throw new Error("ENV AUSENTE " + name);
    return value;
  };
  return {
    endpoint: need("ENTREGAS_BACKUP_S3_ENDPOINT"),
    region: need("ENTREGAS_BACKUP_S3_REGION"),
    bucket: need("ENTREGAS_BACKUP_S3_BUCKET"),
    prefix: need("ENTREGAS_BACKUP_S3_PREFIX"),
    access_key_id: need("ENTREGAS_BACKUP_S3_" + role + "_ACCESS_KEY_ID"),
    secret_access_key: need("ENTREGAS_BACKUP_S3_" + role + "_SECRET_ACCESS_KEY"),
  };
}

if (!URL_SERVIDOR) {
  console.log("PILOT_POSTGRES_BACKUP_RESTORE: PULADO (DELIVERYOS_PG_URL ausente)");
  process.exit(0);
}

let passed = 0;
const failures: string[] = [];
async function tc(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(name + ": " + (e instanceof Error ? e.message : String(e)));
    console.log("  XX  " + name);
  }
}

const created: BancoIsolado[] = [];
const root = mkdtempSync(join(tmpdir(), "pilot-pg-backup-"));
let child: ChildProcess | null = null;
let cleaning: Promise<void> | null = null;

function clean(): Promise<void> {
  cleaning ??= (async () => {
    for (const b of [...created].reverse()) await b.descartar().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  })();
  return cleaning;
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  process.once(signal, () => {
    child?.kill("SIGKILL");
    void clean().finally(() => process.exit(code));
  });
}

function runPg(
  name: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(ferramenta(name), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = p;
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    p.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    p.once("error", (e) => {
      child = null;
      reject(new Error(`${name} não executou: ${e.message}`));
    });
    p.once("exit", (code) => {
      child = null;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${name} saiu ${String(code)}: ${stderr.slice(-800)}`));
    });
  });
}

function event(id: string, type: string, tripId: string): DomainEvent {
  return {
    event_id: id,
    object_type: "trip",
    object_id: tripId,
    event_type: type,
    occurred_at: "2026-10-01T04:00:00.123456Z",
    recorded_at: "2026-10-01T04:00:01.654321Z",
    origin: "ops_console",
    actor_id: "ops-backup",
    idempotency_key: "domain:" + id,
    payload: { proof: id },
    clock_trust: "trusted",
    contract_version: CONTRACT_VERSION_FULL,
  };
}

function outbox(
  id: string,
  status: OutboxRecord["status"],
  attempts: number,
): OutboxRecord {
  return {
    outbox_id: "obx-" + id,
    event: {
      event_id: "pub-" + id,
      event_type: id.endsWith("2") ? "delivery_added" : "trip_created",
      schema_version: "1.0.0",
      occurred_at: "2026-10-01T04:00:00.123456Z",
      recorded_at: "2026-10-01T04:00:01.654321Z",
      idempotency_key: "public:" + id,
      source: "entregas",
      source_health: "ok",
      confidence: "observed",
      unit_id: UNIT,
      source_mode: "simulated",
      trip_id: "BACKUP-TRIP",
      payload: { proof: id },
      correlation_id: "BACKUP-TRIP",
      contract_version: CONTRACT_VERSION_FULL,
    },
    status,
    attempts,
    created_at: "2026-10-01T04:00:01.654321Z",
    last_attempt_at:
      attempts > 0 ? "2026-10-01T04:01:00.000001Z" : undefined,
    last_error: status === "failed" ? "fixture_failure" : undefined,
    published_at:
      status === "published" ? "2026-10-01T04:02:00.000002Z" : undefined,
  };
}

async function populate(source: BancoIsolado): Promise<void> {
  await source.cliente.query(
    `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
     VALUES ($1,'Pilot Backup','America/Sao_Paulo',true)`,
    [UNIT],
  );

  const uow = new PgEntregasUnitOfWork(source.cliente, UNIT);
  const rider = asInternalRiderActorId("backup-rider");

  await uow.trips.save(
    {
      trip: {
        trip_id: "BACKUP-TRIP",
        unit_id: UNIT,
        courier_actor_id: rider,
        created_by: "ops-backup",
        state: "preparando_saida",
        delivery_ids: ["BACKUP-D1"],
        created_at: "2026-10-01T04:00:00.123456Z",
        last_event_id: "evt-backup-1",
        contract_version: CONTRACT_VERSION_FULL,
        policy_bundle_id: "backup-policy",
      },
      deliveries: [
        {
          delivery_id: "BACKUP-D1",
          trip_id: "BACKUP-TRIP",
          order_ref: "ORDER-IN-TRIP",
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

  const first = await uow.trips.get("BACKUP-TRIP");
  assert.ok(first);
  await uow.trips.save(
    {
      ...first,
      trip: {
        ...first.trip,
        state: "em_rota",
        started_at: "2026-10-01T04:03:00.000003Z",
        last_event_id: "evt-backup-2",
      },
      deliveries: first.deliveries.map((d) => ({
        ...d,
        state: "em_rota" as const,
      })),
    },
    first.version,
  );

  const h: Handoff = {
    handoff_id: "BACKUP-H1",
    unit_id: UNIT,
    external_order_ref: "IFOOD-BACKUP",
    state: "repassado",
    courier_verified: true,
    courier_verification_method: "codigo",
    confirmed: true,
    handoff_at: "2026-10-01T04:04:00.000004Z",
    contract_version: CONTRACT_VERSION_FULL,
  };
  await uow.handoffs.save(h, 4, null);

  const occurrence: Occurrence = {
    occurrence_id: "BACKUP-O1",
    unit_id: UNIT,
    type: "teste_backup",
    source_channel: "console",
    related_trip_id: "BACKUP-TRIP",
    state: "resolvida",
    report: "fixture backup",
    executed_action: "ok",
    evidence: "proof",
    owner_role: "lider_delivery",
    confirmation: "known",
    blocks_availability: false,
    opened_at: "2026-10-01T04:00:30.000030Z",
    opened_by: "ops-backup",
    closed_at: "2026-10-01T04:05:00.000005Z",
    closed_by: "ops-backup",
    contract_version: CONTRACT_VERSION_FULL,
    version: 3,
  };
  await uow.occurrences.save(occurrence, null);

  const riderState: RiderOperationalState = {
    rider_id: rider,
    unit_id: UNIT,
    availability: "em_rota",
    occurrence_blocking_availability: false,
    active_trip_id: "BACKUP-TRIP",
    version: 5,
    updated_at: "2026-10-01T04:03:00.000003Z",
  };
  await uow.riders.save(riderState, null);

  await uow.events.append([
    event("evt-backup-1", "trip_created", "BACKUP-TRIP"),
    event("evt-backup-2", "trip_started", "BACKUP-TRIP"),
  ]);
  await uow.outbox.enqueue(outbox("backup-1", "published", 1));
  await uow.outbox.enqueue(outbox("backup-2", "failed", 2));
  await uow.commit();

  const ready = new PgPilotReadyOrderStore(source.cliente, UNIT);
  await ready.add({
    order_ref: "ORDER-STILL-READY",
    label: "Pedido ainda pronto",
    channel: "proprio",
    created_at: "2026-10-01T04:06:00.000006Z",
  });
}

void (async () => {
  const dump = join(root, "pilot.dump");
  let restoreDump = dump;
  try {
    const source = await bancoIsolado(URL_SERVIDOR, undefined, "pilotbkp_src");
    created.push(source);
    await populate(source);
    const before = await readPostgresPilotStorageSnapshot(source.cliente, UNIT);
    const beforeFingerprint = snapshotFingerprint(before);
    const beforeCounts = snapshotCounts(before);

    await tc("PBK1 fonte contém toda a verdade operacional e versões > 1", async () => {
      assert.deepEqual(beforeCounts, {
        trips: 1,
        deliveries: 1,
        handoffs: 1,
        occurrences: 1,
        riders: 1,
        events: 2,
        outbox: 2,
        ready_orders: 1,
      });
      assert.equal(before.trips[0].version, 2);
      assert.equal(before.handoffs[0].version, 4);
      assert.equal(before.occurrences[0].version, 3);
      assert.equal(before.riders[0].version, 5);
    });

    await tc("PBK2 pg_dump custom é produzido e não está vazio", async () => {
      await runPg("pg_dump", [
        "-d",
        source.url,
        "--format=custom",
        "--file",
        dump,
      ]);
      assert.ok(statSync(dump).size > 4096, "dump suspeito de vazio");
      assert.equal(
        readFileSync(dump).subarray(0, 5).toString("latin1"),
        "PGDMP",
      );
    });

    if (S3_ENABLED) {
      const offhostDir = join(root, "offhost");
      mkdirSync(offhostDir);
      await tc("PBK2B dump real faz roundtrip off-host antes do restore", async () => {
        const hash = createHash("sha256").update(readFileSync(dump)).digest("hex");
        writeFileSync(dump + ".sha256", hash + "  pilot.dump\n", "utf8");
        const uploaded = await exportBackupBundleS3({
          snapshot_path: dump,
          config: s3Config("WRITE"),
        });
        if (!uploaded.ok) {
          throw new Error("offhost upload: " + uploaded.reason + " " + (uploaded.detail ?? ""));
        }
        const downloaded = await downloadBackupBundleS3({
          config: s3Config("READ"),
          manifest_key: uploaded.manifest_key,
          destination_root: offhostDir,
        });
        if (!downloaded.ok) {
          throw new Error("offhost download: " + downloaded.reason + " " + (downloaded.detail ?? ""));
        }
        assert.equal(downloaded.sha256, hash);
        assert.equal(downloaded.downloaded_integrity_verified, true);
        restoreDump = downloaded.snapshot_path;
        console.log("PILOT_OFFHOST_MANIFEST_KEY=" + uploaded.manifest_key);
      });
      if (restoreDump === dump) {
        throw new Error("offhost roundtrip falhou antes do restore");
      }
    }

    const restored = await bancoVazio(URL_SERVIDOR, "pilotbkp_dst");
    created.push(restored);

    await tc("PBK3 restore acontece sobre banco realmente vazio", async () => {
      const rows = await restored.cliente.query<{ n: string }>(
        `SELECT count(*) AS n
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog','information_schema')
            AND n.nspname NOT LIKE 'pg_toast%'`,
      );
      assert.equal(Number(rows[0].n), 0);
      await runPg("pg_restore", [
        "-d",
        restored.url,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        restoreDump,
      ]);
    });

    const after = await readPostgresPilotStorageSnapshot(restored.cliente, UNIT);

    await tc("PBK4 snapshot restaurado tem fingerprint e conteúdo idênticos", async () => {
      assert.equal(snapshotFingerprint(after), beforeFingerprint);
      assert.deepEqual(snapshotCounts(after), beforeCounts);
      assert.deepEqual(
        after.events.map((x) => x.event_id),
        before.events.map((x) => x.event_id),
      );
      assert.deepEqual(
        after.outbox.map((x) => [
          x.outbox_id,
          x.status,
          x.attempts,
          x.last_attempt_at,
          x.published_at,
        ]),
        before.outbox.map((x) => [
          x.outbox_id,
          x.status,
          x.attempts,
          x.last_attempt_at,
          x.published_at,
        ]),
      );
    });

    await tc("PBK5 triggers do domínio restaurado continuam protegendo e consumindo fila", async () => {
      await assert.rejects(
        () =>
          restored.cliente.query(
            "UPDATE entregas.domain_event SET event_type='mutado' WHERE event_id='evt-backup-1'",
          ),
        /append-only/i,
      );

      const ready = new PgPilotReadyOrderStore(restored.cliente, UNIT);
      await ready.add({
        order_ref: "ORDER-TRIGGER",
        label: "Trigger restore",
        created_at: "2026-10-01T04:07:00.000007Z",
      });
      const uow = new PgEntregasUnitOfWork(restored.cliente, UNIT);
      await uow.trips.save(
        {
          trip: {
            trip_id: "BACKUP-TRIGGER-TRIP",
            unit_id: UNIT,
            courier_actor_id: asInternalRiderActorId("backup-rider-2"),
            created_by: "ops-backup",
            state: "preparando_saida",
            delivery_ids: ["BACKUP-TRIGGER-D1"],
            created_at: "2026-10-01T04:07:01.000008Z",
            last_event_id: "evt-trigger",
            contract_version: CONTRACT_VERSION_FULL,
            policy_bundle_id: "backup-policy",
          },
          deliveries: [
            {
              delivery_id: "BACKUP-TRIGGER-D1",
              trip_id: "BACKUP-TRIGGER-TRIP",
              order_ref: "ORDER-TRIGGER",
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
      assert.equal(
        (await ready.list()).some((x) => x.order_ref === "ORDER-TRIGGER"),
        false,
      );
    });

    await tc("PBK6 PgUOW continua da versão restaurada sem reset", async () => {
      const uow = new PgEntregasUnitOfWork(restored.cliente, UNIT);
      const current = await uow.trips.get("BACKUP-TRIP");
      assert.ok(current);
      assert.equal(current.version, 2);
      await uow.trips.save(
        {
          ...current,
          trip: {
            ...current.trip,
            manual_close_reason: "apos-restore",
          },
        },
        current.version,
      );
      await uow.commit();
      const updated = await new PgEntregasUnitOfWork(
        restored.cliente,
        UNIT,
      ).trips.get("BACKUP-TRIP");
      assert.equal(updated?.version, 3);
      assert.equal(updated?.trip.manual_close_reason, "apos-restore");
    });
  } catch (e) {
    failures.push("preparação: " + (e instanceof Error ? e.message : String(e)));
    console.log("  XX  preparação");
  } finally {
    await clean();
  }

  console.log(`\nPILOT_POSTGRES_BACKUP_RESTORE: ${passed}/${passed + failures.length} PASS`);
  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
