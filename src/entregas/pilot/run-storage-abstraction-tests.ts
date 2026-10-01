import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import type { PilotConfig } from "./pilot-config";
import { PilotApplicationFacade } from "./pilot-facade";
import { createPilotLogger } from "./pilot-log";
import type { PilotUnitOfWorkSource } from "./pilot-storage";

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
        actor_id: "ops-storage",
        role: "operador_expedicao",
        label: "Ops",
        token: "token-storage",
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

async function createTrip(facade: PilotApplicationFacade, id: string) {
  const login = facade.login("token-storage");
  assert.equal(login.ok, true);
  const r = await facade.execute({
    type: "CreateTrip",
    command_id: "cmd-" + id,
    occurred_at: "2026-09-30T23:40:00.000Z",
    unit_id: "ITAIM",
    trip_id: id,
    courier_actor_id: asInternalRiderActorId("rider-" + id),
    deliveries: [
      {
        delivery_id: "D-" + id,
        order_ref: "O-" + id,
        channel: "proprio",
      },
    ],
  });
  assert.equal(r.ok, true);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "pilot-storage-"));
  try {
    await testCase("PS1 backend externo ignora store.json fantasma no snapshot", async () => {
      writeFileSync(
        join(dir, "store.json"),
        JSON.stringify({
          trips: {
            GHOST: {
              trip: {
                trip_id: "GHOST",
                unit_id: "ITAIM",
                courier_actor_id: "rider-ghost",
                created_by: "x",
                state: "preparando_saida",
                delivery_ids: [],
                created_at: "2026-09-30T00:00:00.000Z",
                last_event_id: "x",
                contract_version: "x",
                policy_bundle_id: "x",
              },
              deliveries: [],
              version: 1,
            },
          },
          handoffs: {},
          occurrences: {},
          riders: {},
          events: [],
          outbox: [],
        }),
        "utf8",
      );

      const mem = new MemoryUnitOfWork();
      let opens = 0;
      const source: PilotUnitOfWorkSource = {
        kind: "external",
        open: () => {
          opens += 1;
          return mem;
        },
      };
      const facade = new PilotApplicationFacade(
        cfg(dir),
        createPilotLogger(dir),
        source,
      );
      await createTrip(facade, "REAL");
      const snap = await facade.snapshot();

      assert.deepEqual(snap.trips.map((x) => x.trip_id), ["REAL"]);
      assert.equal(snap.trips.some((x) => x.trip_id === "GHOST"), false);
      assert.equal(facade.supportsFileBackup, false);
      assert.throws(() => facade.dataPath, /indisponível/);

      facade.reloadStore();
      assert.equal(opens, 2);
      assert.deepEqual((await facade.snapshot()).trips.map((x) => x.trip_id), ["REAL"]);
    });

    await testCase("PS2 modo arquivo default persiste e reabre sem injeção", async () => {
      const fileDir = join(dir, "file-default");
      const a = new PilotApplicationFacade(
        cfg(fileDir),
        createPilotLogger(fileDir),
      );
      await createTrip(a, "FILE");
      assert.equal(a.supportsFileBackup, true);
      assert.match(a.dataPath, /store\.json$/);

      const b = new PilotApplicationFacade(
        cfg(fileDir),
        createPilotLogger(fileDir),
      );
      const snap = await b.snapshot();
      assert.deepEqual(snap.trips.map((x) => x.trip_id), ["FILE"]);
    });

    await testCase("PS3 snapshot usa list das quatro portas, não caches", async () => {
      const mem = new MemoryUnitOfWork();
      const source: PilotUnitOfWorkSource = {
        kind: "external",
        open: () => mem,
      };
      const facade = new PilotApplicationFacade(
        cfg(join(dir, "lists")),
        createPilotLogger(join(dir, "lists")),
        source,
      );
      await createTrip(facade, "LIST");
      const snap1 = await facade.snapshot();
      assert.equal(snap1.trips.length, 1);

      facade.reloadStore();
      const snap2 = await facade.snapshot();
      assert.equal(snap2.trips.length, 1);
      assert.equal(snap2.trips[0].trip_id, "LIST");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
  console.log("\nPILOT_STORAGE_ABSTRACTION: " + passed + "/3 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
