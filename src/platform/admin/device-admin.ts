import { createHash } from "node:crypto";

import type { SqlClient } from "../persistence/sql-client";

export interface UnitRow { unit_id: string; active: boolean }
export interface ActorRow { actor_id: string; unit_id: string; role: string; active: boolean }
export interface DeviceRow {
  device_id: string;
  unit_id: string;
  actor_id?: string;
  label: string;
  registered_at?: string;
  revoked_at?: string;
  revoked_by?: string;
  linked: boolean;
}

export interface DeviceAdminStore {
  currentUser(): Promise<string>;
  unit(unitId: string): Promise<UnitRow | null>;
  actor(actorId: string): Promise<ActorRow | null>;
  device(deviceId: string): Promise<DeviceRow | null>;
  authorize(input: { device_id: string; unit_id: string; actor_id: string; label: string }): Promise<boolean>;
  revoke(input: { device_id: string; revoked_by: string }): Promise<boolean>;
}

export class PgDeviceAdminStore implements DeviceAdminStore {
  constructor(private readonly sql: SqlClient) {}

  async currentUser(): Promise<string> {
    const rows = await this.sql.query<{ current_user: unknown }>("SELECT current_user AS current_user");
    return String(rows[0]?.current_user ?? "");
  }

  async unit(unitId: string): Promise<UnitRow | null> {
    const rows = await this.sql.query<{ unit_id: unknown; active: unknown }>(
      "SELECT unit_id, active FROM identity.unit WHERE unit_id = $1",
      [unitId],
    );
    if (!rows.length) return null;
    return { unit_id: String(rows[0].unit_id), active: rows[0].active === true };
  }

  async actor(actorId: string): Promise<ActorRow | null> {
    const rows = await this.sql.query<{
      actor_id: unknown; unit_id: unknown; role: unknown; active: unknown;
    }>(
      "SELECT actor_id, unit_id, role, active FROM identity.actor WHERE actor_id = $1",
      [actorId],
    );
    if (!rows.length) return null;
    return {
      actor_id: String(rows[0].actor_id),
      unit_id: String(rows[0].unit_id),
      role: String(rows[0].role),
      active: rows[0].active === true,
    };
  }

  async device(deviceId: string): Promise<DeviceRow | null> {
    const rows = await this.sql.query<{
      device_id: unknown; unit_id: unknown; actor_id: unknown; label: unknown;
      registered_at: unknown; revoked_at: unknown; revoked_by: unknown; linked: unknown;
    }>(
      `SELECT device_id, unit_id, actor_id, label, registered_at, revoked_at, revoked_by,
              secret_hash IS NOT NULL AS linked
         FROM identity.device
        WHERE device_id = $1`,
      [deviceId],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      device_id: String(row.device_id),
      unit_id: String(row.unit_id),
      actor_id: row.actor_id == null ? undefined : String(row.actor_id),
      label: String(row.label),
      registered_at: row.registered_at == null ? undefined : String(row.registered_at),
      revoked_at: row.revoked_at == null ? undefined : String(row.revoked_at),
      revoked_by: row.revoked_by == null ? undefined : String(row.revoked_by),
      linked: row.linked === true,
    };
  }

  async authorize(input: { device_id: string; unit_id: string; actor_id: string; label: string }): Promise<boolean> {
    const rows = await this.sql.query(
      `INSERT INTO identity.device(device_id, unit_id, actor_id, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_id) DO NOTHING
       RETURNING device_id`,
      [input.device_id, input.unit_id, input.actor_id, input.label],
    );
    return rows.length === 1;
  }

  async revoke(input: { device_id: string; revoked_by: string }): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE identity.device
          SET revoked_at = now(), revoked_by = $2
        WHERE device_id = $1 AND revoked_at IS NULL
        RETURNING device_id`,
      [input.device_id, input.revoked_by],
    );
    return rows.length === 1;
  }
}

export type DeviceAdminAction = "authorize" | "revoke";

export interface DeviceAdminPlan {
  schema: "deliveryos-device-admin-plan@1";
  action: DeviceAdminAction;
  database_user: string;
  device_id: string;
  current: DeviceRow | null;
  target: Record<string, string>;
  can_apply: boolean;
  no_op: boolean;
  conflicts: string[];
}

function requiredId(name: string, value: string): string {
  const v = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(v) || v === "CHANGE_ME") {
    throw new Error(`${name} inválido`);
  }
  return v;
}

function requiredText(name: string, value: string, max = 160): string {
  const v = value.trim();
  if (!v || v.length > max || /[\r\n\0]/.test(v) || v === "CHANGE_ME") {
    throw new Error(`${name} inválido`);
  }
  return v;
}

export async function planAuthorize(
  store: DeviceAdminStore,
  raw: { device_id: string; unit_id: string; actor_id: string; label: string },
): Promise<DeviceAdminPlan> {
  const device_id = requiredId("device_id", raw.device_id);
  const unit_id = requiredId("unit_id", raw.unit_id);
  const actor_id = requiredId("actor_id", raw.actor_id);
  const label = requiredText("label", raw.label);
  const [database_user, unit, actor, current] = await Promise.all([
    store.currentUser(), store.unit(unit_id), store.actor(actor_id), store.device(device_id),
  ]);

  const conflicts: string[] = [];
  if (!unit) conflicts.push("unit_not_found");
  else if (!unit.active) conflicts.push("unit_inactive");
  if (!actor) conflicts.push("actor_not_found");
  else {
    if (!actor.active) conflicts.push("actor_inactive");
    if (actor.unit_id !== unit_id) conflicts.push("actor_unit_mismatch");
    if (actor.role !== "motoboy_interno") conflicts.push("actor_role_not_rider");
  }

  let no_op = false;
  if (current) {
    if (current.revoked_at) {
      conflicts.push("device_revoked_requires_explicit_recovery");
    } else if (current.unit_id === unit_id && current.actor_id === actor_id) {
      no_op = true;
    } else {
      conflicts.push("device_already_authorized_to_other_identity");
    }
  }

  return {
    schema: "deliveryos-device-admin-plan@1",
    action: "authorize",
    database_user,
    device_id,
    current,
    target: { unit_id, actor_id, label },
    can_apply: conflicts.length === 0,
    no_op,
    conflicts,
  };
}

export async function planRevoke(
  store: DeviceAdminStore,
  raw: { device_id: string; revoked_by: string },
): Promise<DeviceAdminPlan> {
  const device_id = requiredId("device_id", raw.device_id);
  const revoked_by = requiredText("revoked_by", raw.revoked_by, 100);
  const [database_user, current] = await Promise.all([
    store.currentUser(), store.device(device_id),
  ]);
  const conflicts: string[] = [];
  let no_op = false;
  if (!current) conflicts.push("device_not_found");
  else if (current.revoked_at) no_op = true;

  return {
    schema: "deliveryos-device-admin-plan@1",
    action: "revoke",
    database_user,
    device_id,
    current,
    target: { revoked_by },
    can_apply: conflicts.length === 0,
    no_op,
    conflicts,
  };
}

export function planFingerprint(plan: DeviceAdminPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
