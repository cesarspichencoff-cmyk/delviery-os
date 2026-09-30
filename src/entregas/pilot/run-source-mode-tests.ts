import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createFileEntregasEventFeed } from "../integration/durable-event-feed";
import { asInternalRiderActorId } from "../foundation/brands";
import { PilotApplicationFacade } from "./pilot-facade";
import { loadPilotConfig } from "./pilot-config";
import { createPilotLogger } from "./pilot-log";

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

function baseConfig(
  dataDir: string,
  sourceMode?: "real" | "simulated" | "control",
): Record<string, unknown> {
  return {
    mode: "pilot",
    unit_id: "ITAIM",
    unit_name: "SOURCE MODE TEST",
    timezone: "America/Sao_Paulo",
    port: 5399,
    bind: "127.0.0.1",
    data_dir: dataDir,
    ...(sourceMode ? { source_mode: sourceMode } : {}),
    max_stops: 5,
    banner: "TESTE",
    users: [
      {
        actor_id: "ops-source",
        role: "operador_expedicao",
        label: "Ops",
        token: "tok-source-mode-test-000000000001",
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
      auto_interval_minutes: 600,
      retain_count: 3,
      dir: "backups",
    },
  };
}

function writeConfig(
  root: string,
  name: string,
  value: Record<string, unknown>,
): string {
  const path = join(root, name + ".json");
  writeFileSync(path, JSON.stringify(value), "utf8");
  return path;
}

async function createOneTrip(
  facade: PilotApplicationFacade,
  token: string,
  trip: string,
): Promise<void> {
  const login = facade.login(token);
  assert.equal(login.ok, true);

  const r = await facade.execute({
    type: "CreateTrip",
    command_id: "cmd-" + trip,
    occurred_at: "2026-09-30T22:30:00.000Z",
    unit_id: "ITAIM",
    trip_id: trip,
    courier_actor_id: asInternalRiderActorId("rid-source"),
    deliveries: [
      {
        delivery_id: "d-" + trip,
        order_ref: "p-" + trip,
        channel: "proprio",
      },
    ],
  });
  assert.equal(r.ok, true, r.error);
}

async function main(): Promise<void> {
  console.log("\n=== PILOT SOURCE MODE — EXPLICITO E FAIL-CLOSED ===\n");
  const root = mkdtempSync(join(tmpdir(), "pilot-source-mode-"));

  try {
    await testCase("SM1 simulated explicito chega à outbox durável", async () => {
      const dataDir = join(root, "simulated");
      const path = writeConfig(
        root,
        "simulated",
        baseConfig(dataDir, "simulated"),
      );
      const cfg = loadPilotConfig(path);
      assert.equal(cfg.source_mode, "simulated");

      const facade = new PilotApplicationFacade(
        cfg,
        createPilotLogger(dataDir),
      );
      await createOneTrip(
        facade,
        "tok-source-mode-test-000000000001",
        "T-SIM",
      );

      const events = await createFileEntregasEventFeed(
        facade.dataPath,
      ).list();
      assert.ok(events.length >= 2);
      assert.ok(
        events.every((e) => e.source_mode === "simulated"),
      );
    });

    await testCase("SM2 ausência continua UNKNOWN e nunca vira real", async () => {
      const dataDir = join(root, "unknown");
      const path = writeConfig(
        root,
        "unknown",
        baseConfig(dataDir),
      );
      const cfg = loadPilotConfig(path);
      assert.equal(cfg.source_mode, undefined);

      const facade = new PilotApplicationFacade(
        cfg,
        createPilotLogger(dataDir),
      );
      await createOneTrip(
        facade,
        "tok-source-mode-test-000000000001",
        "T-UNK",
      );

      const events = await createFileEntregasEventFeed(
        facade.dataPath,
      ).list();
      assert.ok(events.length >= 2);
      assert.ok(
        events.every((e) => e.source_mode === undefined),
      );
    });

    await testCase("SM3 real e control são aceitos somente se explícitos", () => {
      for (const mode of ["real", "control"] as const) {
        const path = writeConfig(
          root,
          "mode-" + mode,
          baseConfig(join(root, mode), mode),
        );
        assert.equal(loadPilotConfig(path).source_mode, mode);
      }
    });

    await testCase("SM4 grafia/valor inválido falha no boot", () => {
      const value = baseConfig(join(root, "bad"));
      value.source_mode = "REAL";
      const path = writeConfig(root, "bad", value);

      assert.throws(
        () => loadPilotConfig(path),
        /source_mode deve ser real, simulated ou control/,
      );
    });

    await testCase("SM5 reloadStore preserva a configuração explícita", async () => {
      const dataDir = join(root, "reload");
      const path = writeConfig(
        root,
        "reload",
        baseConfig(dataDir, "control"),
      );
      const cfg = loadPilotConfig(path);
      const facade = new PilotApplicationFacade(
        cfg,
        createPilotLogger(dataDir),
      );

      await createOneTrip(
        facade,
        "tok-source-mode-test-000000000001",
        "T-R1",
      );
      facade.reloadStore();

      // Reautentica por clareza: reload de storage não é sessão.
      const login = facade.login(
        "tok-source-mode-test-000000000001",
      );
      assert.equal(login.ok, true);

      const r = await facade.execute({
        type: "AddDeliveryToTrip",
        command_id: "cmd-reload-add",
        occurred_at: "2026-09-30T22:31:00.000Z",
        unit_id: "ITAIM",
        trip_id: "T-R1",
        delivery_id: "D-R2",
        order_ref: "P-R2",
        planned_stop_order: 2,
        channel: "proprio",
        reason: "teste",
      });
      assert.equal(r.ok, true, r.error);

      const events = await createFileEntregasEventFeed(
        facade.dataPath,
      ).list();
      assert.ok(events.length >= 3);
      assert.ok(events.every((e) => e.source_mode === "control"));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log("\nPILOT_SOURCE_MODE: " + passed + "/5 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
