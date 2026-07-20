/**
 * Testes do Gate de Prontidão — piloto controlado
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPilotLogger } from "./pilot-log";
import { createBackup, restoreBackup, listBackups } from "./pilot-backup";
import { PilotApplicationFacade } from "./pilot-facade";
import type { PilotConfig } from "./pilot-config";
import { asInternalRiderActorId } from "../foundation/brands";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    throw e;
  }
}

function makeCfg(dir: string): PilotConfig {
  return {
    mode: "pilot",
    unit_id: "u-test",
    unit_name: "UNIDADE TESTE",
    timezone: "America/Sao_Paulo",
    port: 5199,
    bind: "127.0.0.1",
    data_dir: dir,
    max_stops: 5,
    banner: "PILOTO CONTROLADO · UNIDADE {unit_name}",
    users: [
      {
        actor_id: "ops-1",
        role: "operador_expedicao",
        label: "Ops",
        token: "tok-ops",
      },
      {
        actor_id: "rid-1",
        role: "motoboy_interno",
        label: "Rider",
        token: "tok-rider",
      },
      {
        actor_id: "admin-1",
        role: "gerente",
        label: "Admin",
        token: "tok-admin",
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
    backup: { auto_interval_minutes: 60, retain_count: 5, dir: "backups" },
  };
}

console.log("\n=== Pilot gate tests ===\n");

(async () => {
  const root = join(tmpdir(), `entregas-pilot-gate-${Date.now()}`);
  mkdirSync(root, { recursive: true });

  await test("banner de piloto sem DEMO", () => {
    const cfg = makeCfg(root);
    assert.ok(cfg.banner.includes("PILOTO") || cfg.banner.includes("{unit_name}"));
    assert.equal(cfg.features.demo_seed, false);
  });

  await test("login por token; rejeita token inválido", async () => {
    const dir = join(root, "a");
    mkdirSync(dir, { recursive: true });
    const log = createPilotLogger(dir);
    const f = new PilotApplicationFacade(makeCfg(dir), log);
    const bad = f.login("nope");
    assert.equal(bad.ok, false);
    const ok = f.login("tok-ops");
    assert.equal(ok.ok, true);
    assert.equal(ok.actor?.role, "operador_expedicao");
  });

  await test("command sem sessão é recusado", async () => {
    const dir = join(root, "b");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    const r = await f.execute({
      type: "CreateTrip",
      command_id: "x1",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      trip_id: "T1",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d1", order_ref: "P1" }],
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "NO_SESSION");
  });

  await test("fluxo viagem + persistência + reinício UoW", async () => {
    const dir = join(root, "c");
    mkdirSync(dir, { recursive: true });
    const cfg = makeCfg(dir);
    const f = new PilotApplicationFacade(cfg, createPilotLogger(dir));
    f.login("tok-ops");
    f.registerReadyOrder("P-1", "Pedido P-1 · Centro");
    let r = await f.execute({
      type: "CreateTrip",
      command_id: "c1",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      trip_id: "TP",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d1", order_ref: "P-1" }],
      actor: { actor_id: "ops-1", role: "operador_expedicao" },
    });
    assert.equal(r.ok, true, r.error);
    f.login("tok-rider");
    r = await f.execute({
      type: "ConfirmTripDeparture",
      command_id: "c2",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      trip_id: "TP",
      actor: { actor_id: "rid-1", role: "motoboy_interno" },
    });
    assert.equal(r.ok, true, r.error);
    // reinício
    const f2 = new PilotApplicationFacade(cfg, createPilotLogger(dir));
    f2.login("tok-ops");
    // hydrate: re-execute path via disk
    const { openFileUnitOfWork } = await import("../persistence/file-store");
    const uow = openFileUnitOfWork(join(dir, "store.json"));
    const rec = await uow.trips.get("TP");
    assert.ok(rec);
    assert.equal(rec!.trip.state, "em_rota");
  });

  await test("command_id duplicado bloqueado", async () => {
    const dir = join(root, "d");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    const cmd = {
      type: "CreateTrip" as const,
      command_id: "dup-1",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      trip_id: "TD",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "dx", order_ref: "X" }],
    };
    const r1 = await f.execute(cmd);
    assert.equal(r1.ok, true, r1.error);
    const r2 = await f.execute({ ...cmd, trip_id: "TD2" });
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "DUPLICATE_COMMAND");
  });

  await test("papel motoboy não faz handoff", async () => {
    const dir = join(root, "e");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-rider");
    const r = await f.execute({
      type: "StartHandoff",
      command_id: "h1",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      handoff_id: "HO1",
      external_order_ref: "IF-1",
    });
    assert.equal(r.ok, false);
  });

  await test("backup + validação + restore", async () => {
    const dir = join(root, "f");
    mkdirSync(dir, { recursive: true });
    const store = join(dir, "store.json");
    writeFileSync(
      store,
      JSON.stringify({
        trips: {},
        handoffs: {},
        occurrences: {},
        riders: {},
        events: [],
        outbox: [],
      }),
      "utf8",
    );
    const bdir = join(dir, "backups");
    const log = createPilotLogger(dir);
    const b = createBackup(store, bdir, 5, log);
    assert.equal(b.ok, true, b.error);
    assert.ok(b.path && existsSync(b.path));
    // corromper store e restaurar
    writeFileSync(store, "{broken", "utf8");
    const list = listBackups(bdir);
    assert.ok(list.length >= 1);
    const r = restoreBackup(join(bdir, list[0]), store, bdir, log);
    assert.equal(r.ok, true, r.error);
    const data = JSON.parse(readFileSync(store, "utf8"));
    assert.ok(data.trips);
  });

  await test("handoff iFood completo sem trip", async () => {
    const dir = join(root, "g");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    let r = await f.execute({
      type: "StartHandoff",
      command_id: "ih1",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      handoff_id: "HO-IF",
      external_order_ref: "IF-9",
    });
    assert.equal(r.ok, true, r.error);
    r = await f.execute({
      type: "ConfirmHandoff",
      command_id: "ih2",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      handoff_id: "HO-IF",
      conference_actor: "ops-1",
      handoff_actor: "ops-1",
      courier_verified: true,
      courier_verification_method: "numero_pedido_e_codigo",
      volumes: { expected: 2, delivered: 2 },
      order_identified: true,
    });
    assert.equal(r.ok, true, r.error);
    const snap = await f.snapshot();
    assert.equal(snap.trips.length, 0);
    assert.ok(snap.handoffs.some((h) => h.confirmed));
    // duplicata terminal
    r = await f.execute({
      type: "ConfirmHandoff",
      command_id: "ih3",
      occurred_at: new Date().toISOString(),
      unit_id: "u-test",
      handoff_id: "HO-IF",
      conference_actor: "ops-1",
      handoff_actor: "ops-1",
      courier_verified: true,
      courier_verification_method: "numero_pedido_e_codigo",
      volumes: { expected: 2, delivered: 2 },
      order_identified: true,
    });
    assert.equal(r.ok, false);
  });

  await test("snapshot banner piloto", async () => {
    const dir = join(root, "h");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    const s = await f.snapshot();
    assert.equal(s.mode, "pilot");
    assert.ok(s.banner.includes("PILOTO CONTROLADO"));
    assert.ok(!s.banner.includes("DEMONSTRAÇÃO"));
  });

  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* */
  }

  console.log(`\n=== ${passed} pilot gate tests OK ===\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
