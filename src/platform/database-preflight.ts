import type { SqlClient, SqlRow } from "./persistence/sql-client";
import type { MigrationFile } from "./migrations/runner";

export const PILOT_REQUIRED_MIGRATIONS = [
  "0006_entregas_cluster_persistence",
  "0007_entregas_ready_order",
  "0008_ready_order_consumido_por_delivery",
  "0009_device_runtime_status",
] as const;

export const DELIVERYOS_RUNTIME_ROLES = [
  "deliveryos_critical",
  "deliveryos_async",
  "deliveryos_source_ingest",
  "deliveryos_entregas_pilot",
] as const;

export interface AppliedMigration extends SqlRow {
  version: string;
  checksum: string;
}

export interface DatabasePreflightFacts {
  database: string;
  current_user: string;
  server_version: string;
  server_version_num: number;
  ssl_active: boolean;
  database_create: boolean;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  migration_table_present: boolean;
  applied_migrations: AppliedMigration[];
}

export interface DatabasePreflightReport {
  ready_for_migration: boolean;
  ready_for_runtime_preflight: boolean;
  schema_current: boolean;
  pilot_required_present: boolean;
  tls_required: boolean;
  issues: string[];
  warnings: string[];
  pending_migrations: string[];
  unknown_migrations: string[];
  checksum_mismatches: Array<{
    version: string;
    database: string;
    repository: string;
  }>;
}

export async function readDatabasePreflightFacts(
  sql: SqlClient,
): Promise<DatabasePreflightFacts> {
  const identity = await sql.query<{
    database: string;
    current_user: string;
    server_version: string;
    server_version_num: number;
  }>(
    `SELECT current_database()::text AS database,
            current_user::text AS current_user,
            current_setting('server_version')::text AS server_version,
            current_setting('server_version_num')::int AS server_version_num`,
  );
  if (identity.length !== 1) {
    throw new Error("preflight: não foi possível identificar banco/usuário");
  }

  const role = await sql.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
  }>(
    `SELECT rolsuper, rolcreaterole, rolcreatedb
       FROM pg_roles
      WHERE rolname = current_user`,
  );
  if (role.length !== 1) {
    throw new Error("preflight: não foi possível identificar atributos do papel");
  }

  const transport = await sql.query<{
    ssl_active: boolean;
    database_create: boolean;
  }>(
    `SELECT
       COALESCE(
         (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
         false
       ) AS ssl_active,
       has_database_privilege(current_user, current_database(), 'CREATE')
         AS database_create`,
  );
  if (transport.length !== 1) {
    throw new Error("preflight: não foi possível verificar TLS/privilégio do banco");
  }

  const migrationTable = await sql.query<{ relation: string | null }>(
    `SELECT to_regclass('platform.schema_migration')::text AS relation`,
  );
  const migration_table_present =
    migrationTable[0]?.relation === "platform.schema_migration";

  const applied_migrations = migration_table_present
    ? await sql.query<AppliedMigration>(
        `SELECT version::text AS version, checksum::text AS checksum
           FROM platform.schema_migration
          ORDER BY version`,
      )
    : [];

  return {
    ...identity[0],
    ...role[0],
    ...transport[0],
    migration_table_present,
    applied_migrations,
  };
}

export function evaluateDatabasePreflight(args: {
  facts: DatabasePreflightFacts;
  local_migrations: readonly MigrationFile[];
  tls_required: boolean;
}): DatabasePreflightReport {
  const { facts, local_migrations, tls_required } = args;
  const issues: string[] = [];
  const warnings: string[] = [];

  if (
    (DELIVERYOS_RUNTIME_ROLES as readonly string[]).includes(facts.current_user)
  ) {
    issues.push(
      `credencial de migration recusada: ${facts.current_user} é papel de runtime`,
    );
  }

  if (!facts.database_create) {
    issues.push(
      "usuário não possui CREATE no banco; migrations podem não conseguir criar schema",
    );
  }

  if (tls_required && !facts.ssl_active) {
    issues.push("conexão exige TLS, mas pg_stat_ssl reportou ssl=false");
  }

  if (facts.rolsuper || facts.rolcreaterole || facts.rolcreatedb) {
    warnings.push(
      "credencial de migration possui autoridade administrativa; nunca reutilize no runtime",
    );
  }

  const local = new Map(local_migrations.map((m) => [m.version, m]));
  const applied = new Map(
    facts.applied_migrations.map((m) => [m.version, m.checksum]),
  );

  const unknown_migrations = [...applied.keys()]
    .filter((version) => !local.has(version))
    .sort();
  if (unknown_migrations.length) {
    issues.push(
      `banco contém migration ausente neste checkout: ${unknown_migrations.join(", ")}`,
    );
  }

  const checksum_mismatches: DatabasePreflightReport["checksum_mismatches"] = [];
  for (const [version, checksum] of applied) {
    const migration = local.get(version);
    if (!migration) continue;
    if (/^[0-9a-f]{16}$/.test(checksum) && checksum !== migration.checksum) {
      checksum_mismatches.push({
        version,
        database: checksum,
        repository: migration.checksum,
      });
    }
  }
  if (checksum_mismatches.length) {
    issues.push(
      "checksum de migration diverge entre banco e repositório: " +
        checksum_mismatches.map((x) => x.version).join(", "),
    );
  }

  const pending_migrations = local_migrations
    .map((m) => m.version)
    .filter((version) => !applied.has(version));

  const pilot_required_present = PILOT_REQUIRED_MIGRATIONS.every((version) =>
    applied.has(version),
  );
  const schema_current =
    pending_migrations.length === 0 &&
    unknown_migrations.length === 0 &&
    checksum_mismatches.length === 0;

  const ready_for_migration = issues.length === 0;
  const ready_for_runtime_preflight = ready_for_migration && schema_current;

  return {
    ready_for_migration,
    ready_for_runtime_preflight,
    schema_current,
    pilot_required_present,
    tls_required,
    issues,
    warnings,
    pending_migrations,
    unknown_migrations,
    checksum_mismatches,
  };
}
