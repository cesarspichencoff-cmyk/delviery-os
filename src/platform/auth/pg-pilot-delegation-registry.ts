/**
 * Authority for pilot token issuance: existing identity.device + actor + unit.
 * A device token alone never grants a role. Every issuance reads this register.
 */
import type { SqlClient } from "../persistence/sql-client";
import type { PilotIssuerRegistry, RegisteredPilotDevice } from "./pilot-delegation-issuer";

export class PgPilotDelegationRegistry implements PilotIssuerRegistry {
  constructor(private readonly sql: Pick<SqlClient, "query">) {}
  async find(device_id: string): Promise<RegisteredPilotDevice | null> {
    const rows = await this.sql.query<{
      device_id: unknown; actor_id: unknown; unit_id: unknown; device_revoked_at: unknown;
      device_linked: unknown; actor_unit: unknown; role: unknown;
      actor_active: unknown; unit_active: unknown;
    }>(
      `SELECT d.device_id, d.actor_id, d.unit_id, d.revoked_at AS device_revoked_at,
              (d.secret_hash IS NOT NULL) AS device_linked,
              a.unit_id AS actor_unit, a.role, a.active AS actor_active,
              u.active AS unit_active
         FROM identity.device d
         LEFT JOIN identity.actor a ON a.actor_id = d.actor_id
         LEFT JOIN identity.unit u ON u.unit_id = d.unit_id
        WHERE d.device_id = $1`,
      [device_id],
    );
    if (rows.length !== 1) return null;
    const d = rows[0];
    const linked = d.device_linked === true;
    const active = d.actor_active === true && d.unit_active === true;
    const sameUnit = d.actor_unit != null && d.actor_unit === d.unit_id;
    return {
      state: d.device_revoked_at != null || !linked || !active || !sameUnit
        ? "revoked" : "active",
      device_id: String(d.device_id),
      actor_id: d.actor_id == null ? null : String(d.actor_id),
      unit_id: String(d.unit_id),
      role: d.role == null ? "" : String(d.role),
    };
  }
}
