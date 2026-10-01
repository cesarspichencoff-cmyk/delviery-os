import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "./foundation/brands";
import { CONTRACT_VERSION_FULL } from "./foundation/contract";
import { createPilotPolicy } from "./foundation/policy";
import type { Delivery } from "./foundation/types";
import { EntregasApplicationService } from "./operational/application-service";
import { MemoryUnitOfWork } from "./persistence/memory-uow";
import { PgEntregasUnitOfWork } from "./persistence/pg-uow";
import type { OutboxRecord } from "./integration/outbox";
import type { PilotConfig } from "./pilot/pilot-config";
import { PilotApplicationFacade } from "./pilot/pilot-facade";
import { createPilotLogger } from "./pilot/pilot-log";
import type { PilotUnitOfWorkSource } from "./pilot/pilot-storage";
import {
  FilePilotReadyOrderStore,
  MemoryPilotReadyOrderStore,
  PgPilotReadyOrderStore,
} from "./pilot/ready-orders";
import { createPgClient } from "../platform/persistence/sql-client";
import { runMigrations } from "../platform/migrations/runner";
import { diretorioDeMigrations } from "../platform/migrations/localizar";

const URL = process.env.DELIVERYOS_PG_URL?.trim();
const UNIT = "READY_CLUSTER";
const UNIT2 = "READY_CLUSTER_2";
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
    failures.push(name + ": " + (e instanceof Error ? e.message : String(e)));
  }
}

function cfg(dir: string): PilotConfig {
  return {
    mode: "test",
    unit_id: "ITAIM",
    unit_name: "Itaim",
    timezone: "America/Sao_Paulo",
    port: 0,
    bind: "127.0.0.1",
    data_dir: dir,
    source_mode: "simulated",
    max_stops: 5,
    banner: "TESTE",
    users: [
      {
        actor_id: "ops-ready",
        role: "operador_expedicao",
        label: "Ops",
        token: "token-ready",
      },
    ],
    features: {
      demo_seed: false,
      demo_controls: false,
      map_poc: false,
      gps_production: false,
      auto_assignment: false,
      copiloto: false,
      shell: false,
    },
    backup: {
      auto_interval_minutes: 30,
      retain_count: 3,
      dir: "backups",
    },
  };
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ready-order-cluster-"));

  try {
    await testCase("RO1 arquivo preserva compatibilidade, unicidade e remoção", async () => {
      const path = join(dir, "file-ready.json");
      const a = new FilePilotReadyOrderStore(path);
      assert.deepEqual(await a.list(), []);

      assert.deepEqual(
        await a.add({
          order_ref: "F1",
          label: "Pedido F1",
          channel: "proprio",
          created_at: "2026-09-30T23:00:00.000Z",
        }),
        { duplicate: false },
      );
      assert.deepEqual(
        await a.add({
          order_ref: "F1",
          label: "Duplicado",
          created_at: "2026-09-30T23:00:01.000Z",
        }),
        { duplicate: true },
      );

      const b = new FilePilotReadyOrderStore(path);
      assert.deepEqual((await b.list()).map((x) => x.order_ref), ["F1"]);
      assert.equal(await b.removeByOrderRefs(["F1"]), 1);
      assert.deepEqual(await a.list(), []);
    });

    await testCase("RO2 facade externa ignora ready_orders.json fantasma", async () => {
      const facadeDir = join(dir, "facade");
      const readyPath = join(facadeDir, "ready_orders.json");
      await import("node:fs/promises").then((fs) =>
        fs.mkdir(facadeDir, { recursive: true }),
      );
      writeFileSync(
        readyPath,
        JSON.stringify({
          orders: [
            {
              order_ref: "GHOST",
              label: "Fantasma",
              created_at: "2026-09-30T22:00:00.000Z",
            },
          ],
        }),
        "utf8",
      );

      const mem = new MemoryUnitOfWork();
      const source: PilotUnitOfWorkSource = {
        kind: "external",
        open: () => mem,
      };
      const ready = new MemoryPilotReadyOrderStore();
      const facade = new PilotApplicationFacade(
        cfg(facadeDir),
        createPilotLogger(facadeDir),
        source,
        ready,
      );

      assert.equal(facade.login("token-ready").ok, true);
      assert.equal(
        (
          await facade.registerReadyOrder(
            "MEM1",
            "Pedido MEM1",
            "proprio",
          )
        ).ok,
        true,
      );
      assert.deepEqual(
        (await facade.snapshot()).ready_orders.map((x) => x.order_ref),
        ["MEM1"],
      );

      const r = await facade.execute({
        type: "CreateTrip",
        command_id: "cmd-mem-ready",
        occurred_at: "2026-09-30T23:10:00.000Z",
        unit_id: "ITAIM",
        trip_id: "MEM-TRIP",
        courier_actor_id: asInternalRiderActorId("rider-mem"),
        deliveries: [
          {
            delivery_id: "MEM-D",
            order_ref: "MEM1",
            channel: "proprio",
          },
        ],
      });
      assert.equal(r.ok, true);
      assert.deepEqual((await facade.snapshot()).ready_orders, []);
    });

    await testCase("RO3 servidor aguarda ready store e protege backup externo", () => {
      const server = readFileSync("tools/entregas_pilot_server.ts", "utf8");
      assert.match(server, /await facade\.registerReadyOrder/);
      assert.equal(
        (server.match(/backup_backend_managed/g) ?? []).length,
        2,
        "POST backup e GET backups precisam recusar backend externo",
      );
      assert.equal(
        (server.match(/restore_backend_managed/g) ?? []).length,
        1,
        "restore precisa recusar backend externo",
      );
      assert.match(
        server,
        /if \(facade\.supportsFileBackup\)/,
        "timer inicial só pode existir no backend arquivo",
      );
      assert.match(
        server,
        /facade\?\.supportsFileBackup/,
        "shutdown precisa respeitar backend externo",
      );
    });

    if (!URL) {
      console.log("  info PostgreSQL: PULADO (DELIVERYOS_PG_URL ausente)");
      return;
    }

    const admin = await createPgClient({ url: URL, max: 4 });
    const a = await createPgClient({ url: URL, max: 2 });
    const b = await createPgClient({ url: URL, max: 2 });
    try {
      const migrations = await runMigrations(admin, diretorioDeMigrations());
      console.log("  migrations", JSON.stringify(migrations));

      for (const unit of [UNIT, UNIT2]) {
        await admin.query(
          `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
           VALUES ($1,$1,'America/Sao_Paulo',true)
           ON CONFLICT (unit_id) DO UPDATE SET active=true`,
          [unit],
        );
        await admin.query(
          `DELETE FROM entregas.ready_order WHERE unit_id=$1`,
          [unit],
        );
        await admin.query(
          `DELETE FROM entregas.public_outbox WHERE unit_id=$1`,
          [unit],
        );
        await admin.query(
          `DELETE FROM entregas.rider_state WHERE unit_id=$1`,
          [unit],
        );
        await admin.query(
          `DELETE FROM entregas.handoff WHERE unit_id=$1`,
          [unit],
        );
        await admin.query(
          `DELETE FROM entregas.occurrence WHERE unit_id=$1`,
          [unit],
        );
        const trips = await admin.query<{ trip_id: string }>(
          `SELECT trip_id FROM entregas.trip WHERE unit_id=$1`,
          [unit],
        );
        for (const t of trips) {
          await admin.query(
            `DELETE FROM entregas.delivery WHERE trip_id=$1`,
            [t.trip_id],
          );
        }
        await admin.query(
          `DELETE FROM entregas.trip WHERE unit_id=$1`,
          [unit],
        );
      }

      await testCase("RO4 duas instâncias PostgreSQL não duplicam o mesmo pedido", async () => {
        const ra = new PgPilotReadyOrderStore(a, UNIT);
        const rb = new PgPilotReadyOrderStore(b, UNIT);
        const [x, y] = await Promise.all([
          ra.add({
            order_ref: "PG-UNIQUE",
            label: "Pedido PG",
            channel: "proprio",
            created_at: "2026-09-30T23:20:00.000Z",
          }),
          rb.add({
            order_ref: "PG-UNIQUE",
            label: "Pedido PG duplicado",
            channel: "proprio",
            created_at: "2026-09-30T23:20:01.000Z",
          }),
        ]);
        assert.equal(Number(!x.duplicate) + Number(!y.duplicate), 1);
        assert.deepEqual(
          (await ra.list()).map((o) => o.order_ref),
          ["PG-UNIQUE"],
        );
      });

      await testCase("RO5 commit da viagem consome ready_order atomicamente", async () => {
        const ready = new PgPilotReadyOrderStore(a, UNIT);
        await ready.add({
          order_ref: "PG-CONSUME",
          label: "Pedido para viagem",
          channel: "proprio",
          created_at: "2026-09-30T23:21:00.000Z",
        });

        const uow = new PgEntregasUnitOfWork(a, UNIT);
        const svc = new EntregasApplicationService(
          uow,
          createPilotPolicy(),
          "simulated",
        );
        const r = await svc.execute({
          type: "CreateTrip",
          command_id: "ready-pg-trip",
          occurred_at: "2026-09-30T23:22:00.000Z",
          unit_id: UNIT,
          trip_id: "READY-PG-TRIP",
          courier_actor_id: asInternalRiderActorId("ready-pg-rider"),
          actor: { actor_id: "ready-pg-ops", role: "operador_expedicao" },
          deliveries: [
            {
              delivery_id: "READY-PG-D",
              order_ref: "PG-CONSUME",
              channel: "proprio",
            },
          ],
        });
        assert.equal(r.ok, true);
        assert.equal(
          (await ready.list()).some((o) => o.order_ref === "PG-CONSUME"),
          false,
        );
      });

      await testCase("RO6 falha tardia faz rollback e preserva ready_order", async () => {
        const ready = new PgPilotReadyOrderStore(a, UNIT);
        await ready.add({
          order_ref: "PG-ROLLBACK",
          label: "Pedido rollback",
          channel: "proprio",
          created_at: "2026-09-30T23:23:00.000Z",
        });

        const uow = new PgEntregasUnitOfWork(a, UNIT);
        const rider = asInternalRiderActorId("ready-roll-rider");
        const delivery: Delivery = {
          delivery_id: "READY-ROLL-D",
          trip_id: "READY-ROLL-TRIP",
          order_ref: "PG-ROLLBACK",
          channel: "proprio",
          planned_stop_order: 1,
          state: "aguardando_saida",
          active: true,
        };
        await uow.trips.save(
          {
            trip: {
              trip_id: "READY-ROLL-TRIP",
              unit_id: UNIT,
              courier_actor_id: rider,
              created_by: "ready-roll-ops",
              state: "preparando_saida",
              delivery_ids: [delivery.delivery_id],
              created_at: "2026-09-30T23:24:00.000Z",
              last_event_id: "ready-roll-event",
              contract_version: CONTRACT_VERSION_FULL,
              policy_bundle_id: "ready-roll-policy",
            },
            deliveries: [delivery],
            version: 0,
          },
          null,
        );

        const bad: OutboxRecord = {
          outbox_id: "ready-roll-bad-outbox",
          event: {
            event_id: "ready-roll-bad-event",
            event_type: "trip_started",
            schema_version: "1.0.0",
            occurred_at: "2026-09-30T23:24:00.000Z",
            recorded_at: "2026-09-30T23:24:01.000Z",
            idempotency_key: "ready-roll-bad-key",
            source: "entregas",
            source_health: "ok",
            confidence: "observed",
            unit_id: UNIT,
            source_mode: "simulated",
            trip_id: "READY-ROLL-TRIP",
            payload: {},
            correlation_id: "READY-ROLL-TRIP",
            contract_version: CONTRACT_VERSION_FULL,
          },
          status: "INVALIDO" as OutboxRecord["status"],
          attempts: 0,
          created_at: "2026-09-30T23:24:01.000Z",
        };
        await uow.outbox.enqueue(bad);
        await assert.rejects(() => uow.commit());
        await uow.rollback();

        assert.equal(
          (await ready.list()).some((o) => o.order_ref === "PG-ROLLBACK"),
          true,
        );
        assert.equal(
          await new PgEntregasUnitOfWork(a, UNIT).trips.get("READY-ROLL-TRIP"),
          null,
        );
      });

      await testCase("RO7 fila PostgreSQL é isolada por unidade", async () => {
        const other = new PgPilotReadyOrderStore(b, UNIT2);
        await other.add({
          order_ref: "PG-UNIQUE",
          label: "Mesmo ref, outra unidade",
          created_at: "2026-09-30T23:25:00.000Z",
        });
        assert.deepEqual(
          (await other.list()).map((o) => o.order_ref),
          ["PG-UNIQUE"],
        );
        const first = new PgPilotReadyOrderStore(a, UNIT);
        assert.equal(
          (await first.list()).filter((o) => o.order_ref === "PG-UNIQUE").length,
          1,
        );
      });
    } finally {
      await Promise.all([a.close(), b.close(), admin.close()]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log("\nREADY_ORDER_CLUSTER: " + passed + "/7 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
