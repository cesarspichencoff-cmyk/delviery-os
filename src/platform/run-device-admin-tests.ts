import assert from "node:assert/strict";

import {
  type ActorRow,
  type DeviceAdminStore,
  type DeviceRow,
  PgDeviceAdminStore,
  type UnitRow,
  planAuthorize,
  planFingerprint,
  planRevoke,
} from "./admin/device-admin";
import type { SqlClient, SqlRow } from "./persistence/sql-client";

class FakeStore implements DeviceAdminStore {
  databaseUser = "admin_test";
  units = new Map<string, UnitRow>();
  actors = new Map<string, ActorRow>();
  devices = new Map<string, DeviceRow>();

  currentUser = async () => this.databaseUser;
  unit = async (id: string) => this.units.get(id) ?? null;
  actor = async (id: string) => this.actors.get(id) ?? null;
  device = async (id: string) => this.devices.get(id) ?? null;
  authorize = async (x: { device_id: string; unit_id: string; actor_id: string; label: string }) => {
    if (this.devices.has(x.device_id)) return false;
    this.devices.set(x.device_id, {
      device_id: x.device_id, unit_id: x.unit_id, actor_id: x.actor_id, label: x.label, linked: false,
    });
    return true;
  };
  revoke = async (x: { device_id: string; revoked_by: string }) => {
    const d = this.devices.get(x.device_id);
    if (!d || d.revoked_at) return false;
    d.revoked_at = "2026-10-01T00:00:00Z";
    d.revoked_by = x.revoked_by;
    return true;
  };
}

function base(): FakeStore {
  const s = new FakeStore();
  s.units.set("ITAIM", { unit_id: "ITAIM", active: true });
  s.units.set("OFF", { unit_id: "OFF", active: false });
  s.actors.set("rid-1", { actor_id: "rid-1", unit_id: "ITAIM", role: "motoboy_interno", active: true });
  s.actors.set("ops-1", { actor_id: "ops-1", unit_id: "ITAIM", role: "operador_expedicao", active: true });
  s.actors.set("rid-off", { actor_id: "rid-off", unit_id: "OFF", role: "motoboy_interno", active: true });
  s.actors.set("rid-inactive", { actor_id: "rid-inactive", unit_id: "ITAIM", role: "motoboy_interno", active: false });
  return s;
}

let passed = 0;
async function ok(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

async function main() {
  await ok("autoriza aparelho novo para motoboy ativo da unidade", async () => {
    const p = await planAuthorize(base(), { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto 1" });
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, false);
    assert.deepEqual(p.conflicts, []);
  });

  await ok("unidade inativa bloqueia", async () => {
    const s = base();
    const p = await planAuthorize(s, { device_id: "dev-1", unit_id: "OFF", actor_id: "rid-off", label: "Moto" });
    assert.deepEqual(p.conflicts, ["unit_inactive"]);
  });

  await ok("papel que nao e motoboy bloqueia", async () => {
    const p = await planAuthorize(base(), { device_id: "dev-1", unit_id: "ITAIM", actor_id: "ops-1", label: "Moto" });
    assert.ok(p.conflicts.includes("actor_role_not_rider"));
  });

  await ok("ator de outra unidade bloqueia", async () => {
    const p = await planAuthorize(base(), { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-off", label: "Moto" });
    assert.ok(p.conflicts.includes("actor_unit_mismatch"));
  });

  await ok("ator inativo bloqueia", async () => {
    const p = await planAuthorize(base(), { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-inactive", label: "Moto" });
    assert.ok(p.conflicts.includes("actor_inactive"));
  });

  await ok("mesmo vinculo ativo vira no-op idempotente", async () => {
    const s = base();
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Antigo", linked: true });
    const p = await planAuthorize(s, { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Novo" });
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, true);
  });

  await ok("aparelho ligado a outra identidade bloqueia", async () => {
    const s = base();
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "outro", label: "X", linked: true });
    const p = await planAuthorize(s, { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" });
    assert.ok(p.conflicts.includes("device_already_authorized_to_other_identity"));
  });

  await ok("aparelho revogado nao e reativado silenciosamente", async () => {
    const s = base();
    s.devices.set("dev-1", {
      device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "X", linked: true,
      revoked_at: "2026-09-30T00:00:00Z", revoked_by: "Cesar",
    });
    const p = await planAuthorize(s, { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" });
    assert.ok(p.conflicts.includes("device_revoked_requires_explicit_recovery"));
  });

  await ok("entrada placeholder e recusada", async () => {
    await assert.rejects(
      () => planAuthorize(base(), { device_id: "CHANGE_ME", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" }),
      /device_id inválido/,
    );
  });

  await ok("revogacao existente pode aplicar", async () => {
    const s = base();
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "X", linked: true });
    const p = await planRevoke(s, { device_id: "dev-1", revoked_by: "Cesar" });
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, false);
  });

  await ok("revogar inexistente falha fechado", async () => {
    const p = await planRevoke(base(), { device_id: "dev-x", revoked_by: "Cesar" });
    assert.deepEqual(p.conflicts, ["device_not_found"]);
  });

  await ok("revogacao repetida vira no-op", async () => {
    const s = base();
    s.devices.set("dev-1", {
      device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "X", linked: true,
      revoked_at: "2026-09-30T00:00:00Z", revoked_by: "Cesar",
    });
    const p = await planRevoke(s, { device_id: "dev-1", revoked_by: "Cesar" });
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, true);
  });

  await ok("fingerprint muda se o estado revisado muda", async () => {
    const s = base();
    const a = await planAuthorize(s, { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" });
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto", linked: false });
    const b = await planAuthorize(s, { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" });
    assert.notEqual(planFingerprint(a), planFingerprint(b));
  });

  await ok("adaptador SQL parametriza authorize sem expor segredo", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const sql: SqlClient = {
      query: async <T extends SqlRow>(q: string, params: readonly unknown[] = []) => {
        calls.push({ sql: q, params });
        return [{ device_id: "dev-1" }] as unknown as T[];
      },
    };
    const store = new PgDeviceAdminStore(sql);
    assert.equal(await store.authorize({ device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto" }), true);
    assert.deepEqual(calls[0].params, ["dev-1", "ITAIM", "rid-1", "Moto"]);
    assert.match(calls[0].sql, /ON CONFLICT \(device_id\) DO NOTHING/);
  });

  await ok("status do adaptador devolve apenas linked, nunca secret_hash", async () => {
    const sql: SqlClient = {
      query: async <T extends SqlRow>() => ([{
        device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto",
        registered_at: "2026-10-01T00:00:00Z", revoked_at: null, revoked_by: null, linked: true,
      }] as unknown as T[]),
    };
    const d = await new PgDeviceAdminStore(sql).device("dev-1");
    assert.equal(d?.linked, true);
    assert.equal(Object.prototype.hasOwnProperty.call(d ?? {}, "secret_hash"), false);
  });

  console.log(`DEVICE_ADMIN: ${passed}/${passed} PASS`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
