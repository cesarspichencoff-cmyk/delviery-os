import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type ActorRow,
  type DeviceAdminStore,
  type DeviceAuthorizeInput,
  type DeviceRow,
  PgDeviceAdminStore,
  type UnitRow,
  planAuthorize,
  planFingerprint,
  planRevoke,
} from "./admin/device-admin";
import type { SqlClient, SqlRow } from "./persistence/sql-client";

const PROOF = "3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547";

const authInput = (over: Partial<DeviceAuthorizeInput> = {}): DeviceAuthorizeInput => ({
  device_id: "dev-1",
  unit_id: "ITAIM",
  actor_id: "rid-1",
  label: "Moto 1",
  device_proof_sha256: PROOF,
  ...over,
});

class FakeStore implements DeviceAdminStore {
  databaseUser = "admin_test";
  units = new Map<string, UnitRow>();
  actors = new Map<string, ActorRow>();
  devices = new Map<string, DeviceRow>();

  currentUser = async () => this.databaseUser;
  unit = async (id: string) => this.units.get(id) ?? null;
  actor = async (id: string) => this.actors.get(id) ?? null;
  device = async (id: string) => this.devices.get(id) ?? null;
  authorize = async (x: DeviceAuthorizeInput) => {
    const current = this.devices.get(x.device_id);
    if (current) {
      if (current.revoked_at || current.linked || current.unit_id !== x.unit_id || current.actor_id !== x.actor_id) {
        return false;
      }
      current.label = x.label;
      current.linked = true;
      return true;
    }
    this.devices.set(x.device_id, {
      device_id: x.device_id, unit_id: x.unit_id, actor_id: x.actor_id, label: x.label, linked: true,
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
    const p = await planAuthorize(base(), authInput());
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, false);
    assert.deepEqual(p.conflicts, []);
  });

  await ok("prova de vinculo invalida e recusada antes de consultar banco", async () => {
    await assert.rejects(
      () => planAuthorize(base(), authInput({ device_proof_sha256: "abc" })),
      /device_proof_sha256 inválido/,
    );
  });

  await ok("registro antigo sem segredo pode ser pre-vinculado sem trocar identidade", async () => {
    const s = base();
    s.devices.set("dev-1", {
      device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Antigo", linked: false,
    });
    const p = await planAuthorize(s, authInput({ label: "Novo" }));
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, false);
    assert.deepEqual(p.target.device_proof_sha256, PROOF);
    assert.equal(await s.authorize(authInput({ label: "Novo" })), true);
    assert.equal((await s.device("dev-1"))?.linked, true);
  });

  await ok("fingerprint inclui a prova revisada do aparelho", async () => {
    const a = await planAuthorize(base(), authInput());
    const b = await planAuthorize(
      base(),
      authInput({ device_proof_sha256: "4ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547" }),
    );
    assert.notEqual(planFingerprint(a), planFingerprint(b));
  });

  await ok("unidade inativa bloqueia", async () => {
    const s = base();
    const p = await planAuthorize(s, authInput({ unit_id: "OFF", actor_id: "rid-off", label: "Moto" }));
    assert.deepEqual(p.conflicts, ["unit_inactive"]);
  });

  await ok("papel que nao e motoboy bloqueia", async () => {
    const p = await planAuthorize(base(), authInput({ actor_id: "ops-1", label: "Moto" }));
    assert.ok(p.conflicts.includes("actor_role_not_rider"));
  });

  await ok("ator de outra unidade bloqueia", async () => {
    const p = await planAuthorize(base(), authInput({ actor_id: "rid-off", label: "Moto" }));
    assert.ok(p.conflicts.includes("actor_unit_mismatch"));
  });

  await ok("ator inativo bloqueia", async () => {
    const p = await planAuthorize(base(), authInput({ actor_id: "rid-inactive", label: "Moto" }));
    assert.ok(p.conflicts.includes("actor_inactive"));
  });

  await ok("mesmo vinculo ativo vira no-op idempotente", async () => {
    const s = base();
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Antigo", linked: true });
    const p = await planAuthorize(s, authInput({ label: "Novo" }));
    assert.equal(p.can_apply, true);
    assert.equal(p.no_op, true);
  });

  await ok("aparelho ligado a outra identidade bloqueia", async () => {
    const s = base();
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "outro", label: "X", linked: true });
    const p = await planAuthorize(s, authInput({ label: "Moto" }));
    assert.ok(p.conflicts.includes("device_already_authorized_to_other_identity"));
  });

  await ok("aparelho revogado nao e reativado silenciosamente", async () => {
    const s = base();
    s.devices.set("dev-1", {
      device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "X", linked: true,
      revoked_at: "2026-09-30T00:00:00Z", revoked_by: "Cesar",
    });
    const p = await planAuthorize(s, authInput({ label: "Moto" }));
    assert.ok(p.conflicts.includes("device_revoked_requires_explicit_recovery"));
  });

  await ok("entrada placeholder e recusada", async () => {
    await assert.rejects(
      () => planAuthorize(base(), authInput({ device_id: "CHANGE_ME", label: "Moto" })),
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
    const a = await planAuthorize(s, authInput({ label: "Moto" }));
    s.devices.set("dev-1", { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1", label: "Moto", linked: false });
    const b = await planAuthorize(s, authInput({ label: "Moto" }));
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
    assert.equal(await store.authorize(authInput({ label: "Moto" })), true);
    assert.deepEqual(calls[0].params, ["dev-1", "ITAIM", "rid-1", "Moto", PROOF]);
    assert.match(calls[0].sql, /ON CONFLICT \(device_id\) DO UPDATE/);
    assert.match(calls[0].sql, /d\.secret_hash IS NULL/);
  });

  await ok("papel critico revoga privilegio legado de regravar o vinculo", () => {
    const sql = readFileSync(join(process.cwd(), "deploy/sql/papeis_minimos.sql"), "utf8");
    assert.match(
      sql,
      /REVOKE UPDATE \(secret_hash, secret_bound_at\)[\s\S]*FROM deliveryos_critical;/,
    );
    assert.match(
      sql,
      /GRANT UPDATE \(last_session_at, last_seen_at, app_version\)[\s\S]*TO deliveryos_critical;/,
    );
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
