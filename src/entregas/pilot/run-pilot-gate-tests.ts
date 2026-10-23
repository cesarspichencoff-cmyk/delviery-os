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
import { basename, join } from "node:path";
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

  await test("ator explicitamente atestado prevalece sobre sessao mutavel da facade", async () => {
    const dir = join(root, "identity-per-request");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    const ops = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const rider = { actor_id: "rid-1", role: "motoboy_interno" as const };
    const admin = { actor_id: "admin-1", role: "gerente" as const };
    f.bindActor(null);
    const created = await f.executeAs(ops, {
      type: "CreateTrip", command_id: "iso-1", occurred_at: new Date().toISOString(),
      trip_id: "ISO-TRIP-1", courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "iso-d1", order_ref: "iso-order" }],
    });
    assert.equal(created.ok, true, created.error);
    // Another request updates the global actor; explicit request identity wins.
    f.bindActor(admin);
    const denied = await f.executeAs(rider, {
      type: "CloseTripManually", command_id: "iso-2",
      occurred_at: new Date().toISOString(), trip_id: "ISO-TRIP-1",
      reason: "not allowed",
    });
    assert.equal(denied.ok, false, "Rider must not inherit manager privileges");
    const missing = await f.executeAs(null, {
      type: "StartTripReturn", command_id: "iso-3",
      occurred_at: new Date().toISOString(), trip_id: "ISO-TRIP-1",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "NO_SESSION");
    const started = await f.executeAs(rider, {
      type: "ConfirmTripDeparture", command_id: "iso-4",
      occurred_at: new Date().toISOString(), trip_id: "ISO-TRIP-1",
    });
    assert.equal(started.ok, true, started.error);
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

  await test("fila marcada iFood nao pode virar Trip mesmo com canal omitido", async () => {
    const dir = join(root, "channel-trust-ifood");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    const ready = await f.registerReadyOrder("PEDIDO-SEM-PREFIXO", "Pedido externo", "ifood");
    assert.equal(ready.ok, true);
    const out = await f.execute({
      type: "CreateTrip",
      command_id: "channel-1",
      occurred_at: new Date().toISOString(),
      trip_id: "T-IFOD",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d-1", order_ref: "PEDIDO-SEM-PREFIXO" }],
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, "NON_OWN_ORDER_IN_TRIP");
    const snap = await f.snapshot();
    assert.equal(snap.trips.length, 0);
    assert.equal(snap.ready_orders.length, 1);
  });

  await test("fila com origem desconhecida tambem recusa Trip", async () => {
    const dir = join(root, "channel-trust-unknown");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    await f.registerReadyOrder("EXT-2", "Sem prova de origem", "desconhecido");
    const out = await f.execute({
      type: "CreateTrip",
      command_id: "channel-2",
      occurred_at: new Date().toISOString(),
      trip_id: "T-UNKNOWN",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d-2", order_ref: "EXT-2", channel: "proprio" }],
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, "NON_OWN_ORDER_IN_TRIP");
    assert.equal((await f.snapshot()).trips.length, 0);
  });

  await test("fila app proprio carimba canal apesar de navegador omitir", async () => {
    const dir = join(root, "channel-trust-own-app");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    await f.registerReadyOrder("APP-2", "Pedido do app proprio", "app");
    const out = await f.execute({
      type: "CreateTrip",
      command_id: "channel-3",
      occurred_at: new Date().toISOString(),
      trip_id: "T-APP",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d-3", order_ref: "APP-2" }],
    });
    assert.equal(out.ok, true, out.error);
    const { openFileUnitOfWork } = await import("../persistence/file-store");
    const uow = openFileUnitOfWork(join(dir, "store.json"));
    const saved = await uow.trips.get("T-APP");
    assert.equal(saved?.deliveries.find((d) => d.delivery_id === "d-3")?.channel, "app");
  });

  await test("AddDelivery rejeita canal externo guardado na fila", async () => {
    const dir = join(root, "channel-trust-add");
    mkdirSync(dir, { recursive: true });
    const f = new PilotApplicationFacade(makeCfg(dir), createPilotLogger(dir));
    f.login("tok-ops");
    const created = await f.execute({
      type: "CreateTrip",
      command_id: "channel-4a",
      occurred_at: new Date().toISOString(),
      trip_id: "T-OWN",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "d-4a", order_ref: "OWN" }],
    });
    assert.equal(created.ok, true, created.error);
    await f.registerReadyOrder("N-IFOOD", "Externos", "ifood");
    const added = await f.execute({
      type: "AddDeliveryToTrip",
      command_id: "channel-4b",
      occurred_at: new Date().toISOString(),
      trip_id: "T-OWN",
      delivery_id: "d-4b",
      order_ref: "N-IFOOD",
      planned_stop_order: 2,
    });
    assert.equal(added.ok, false);
    assert.equal(added.code, "NON_OWN_ORDER_IN_TRIP");
    const snap = await f.snapshot();
    assert.equal(snap.trips[0].deliveries.length, 1);
    assert.ok(snap.ready_orders.some((r) => r.order_ref === "N-IFOOD"));
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
    assert.ok(b.path && existsSync(b.path + ".sha256"));
    if (b.path) {
      const sidecar = readFileSync(b.path + ".sha256", "utf8");
      assert.match(sidecar, /^[0-9a-f]{64}  .+\n$/);
      assert.equal(sidecar.endsWith(`  ${basename(b.path)}\n`), true);
    }
    // Recuperacao de JSON ilegivel agora exige procedimento assistido.
    const validStoreBeforeCorruption = readFileSync(store, "utf8");
    writeFileSync(store, "{broken", "utf8");
    const list = listBackups(bdir);
    assert.ok(list.length >= 1);
    const blocked = restoreBackup(join(bdir, list[0]), store, bdir, log);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "estado_atual_corrompido_recuperacao_assistida");
    assert.equal(readFileSync(store, "utf8"), "{broken", "bloqueio nao pode alterar arquivo corrompido");
    // Em laboratorio, a origem foi reposta por procedimento isolado e
    // controlado; o restore normal continua aceito com estado atual valido.
    writeFileSync(store, validStoreBeforeCorruption, "utf8");
    const r = restoreBackup(join(bdir, list[0]), store, bdir, log);
    assert.equal(r.ok, true, r.error);
    const data = JSON.parse(readFileSync(store, "utf8"));
    assert.ok(data.trips);
  });

  await test("restore file recusa sidecar ausente/divergente e aceita sidecar legado válido", async () => {
    const dir = join(root, "f-integrity");
    mkdirSync(dir, { recursive: true });
    const store = join(dir, "store.json");
    const initial = JSON.stringify({
      trips: {},
      handoffs: {},
      occurrences: {},
      riders: {},
      events: [],
      outbox: [],
    });
    writeFileSync(store, initial, "utf8");
    const bdir = join(dir, "backups");
    const log = createPilotLogger(dir);
    const b = createBackup(store, bdir, 5, log);
    assert.equal(b.ok, true, b.error);
    assert.ok(b.path && b.sha256);
    if (!b.path || !b.sha256) return;

    const snapshot = readFileSync(b.path, "utf8");
    const sidecar = b.path + ".sha256";

    rmSync(sidecar, { force: true });
    let r = restoreBackup(b.path, store, bdir, log);
    assert.equal(r.ok, false);
    assert.equal(r.error, "checksum ausente");

    writeFileSync(sidecar, `${b.sha256}  ${basename(b.path)}\n`, "utf8");
    writeFileSync(
      b.path,
      JSON.stringify({
        trips: { adulterado: true },
        handoffs: {},
        occurrences: {},
        riders: {},
        events: [],
        outbox: [],
      }),
      "utf8",
    );
    r = restoreBackup(b.path, store, bdir, log);
    assert.equal(r.ok, false);
    assert.equal(r.error, "checksum divergente");

    // Compatibilidade explícita com o sidecar legado de 64 hex puro.
    writeFileSync(b.path, snapshot, "utf8");
    writeFileSync(sidecar, b.sha256, "utf8");
    writeFileSync(store, "{broken", "utf8");
    r = restoreBackup(b.path, store, bdir, log);
    assert.equal(r.ok, false);
    assert.equal(r.error, "estado_atual_corrompido_recuperacao_assistida");
    writeFileSync(store, initial, "utf8");
    r = restoreBackup(b.path, store, bdir, log);
    assert.equal(r.ok, true, r.error);
    assert.ok(JSON.parse(readFileSync(store, "utf8")).trips);
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
