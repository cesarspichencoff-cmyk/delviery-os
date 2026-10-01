import { join } from "node:path";

import { createPgClient, dispensadoDeTls, isLocalUrl } from "../../platform/persistence/sql-client";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import {
  createFilePilotUnitOfWorkSource,
  type PilotUnitOfWorkSource,
} from "./pilot-storage";
import {
  createFilePilotReadyOrderStore,
  PgPilotReadyOrderStore,
  type PilotReadyOrderStore,
} from "./ready-orders";

export type PilotStorageBackendKind = "file" | "postgres";

export interface PilotPersistenceBackend {
  readonly kind: PilotStorageBackendKind;
  readonly multi_instance: boolean;
  readonly storage: PilotUnitOfWorkSource;
  readonly ready_orders: PilotReadyOrderStore;
  readonly database_role?: string;
  close(): Promise<void>;
}

export class PilotPersistenceConfigError extends Error {
  constructor(
    message: string,
    readonly variable: string,
  ) {
    super(message);
    this.name = "PilotPersistenceConfigError";
  }
}

function parseBackend(env: NodeJS.ProcessEnv): PilotStorageBackendKind {
  const raw = (env.ENTREGAS_STORAGE_BACKEND || "file").trim().toLowerCase();
  if (raw === "file" || raw === "postgres") return raw;
  throw new PilotPersistenceConfigError(
    `ENTREGAS_STORAGE_BACKEND inválido: ${raw} (esperado: file ou postgres)`,
    "ENTREGAS_STORAGE_BACKEND",
  );
}

function parseSsl(env: NodeJS.ProcessEnv, url: string): boolean | undefined {
  const raw = env.DELIVERYOS_DATABASE_SSL?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "sim", "yes"].includes(raw)) return true;
  if (["0", "false", "nao", "não", "no"].includes(raw)) {
    const hostPrivado = (env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim();
    if (!dispensadoDeTls(url, hostPrivado)) {
      throw new PilotPersistenceConfigError(
        "PostgreSQL remoto sem TLS recusado para o piloto",
        "DELIVERYOS_DATABASE_SSL",
      );
    }
    return false;
  }
  throw new PilotPersistenceConfigError(
    `DELIVERYOS_DATABASE_SSL inválido: ${raw}`,
    "DELIVERYOS_DATABASE_SSL",
  );
}

async function preflightPostgres(
  client: Awaited<ReturnType<typeof createPgClient>>,
  unitId: string,
): Promise<string> {
  const roleRows = await client.query<{
    current_user: string;
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
  }>(
    `SELECT current_user,
            r.rolsuper,
            r.rolcreaterole,
            r.rolcreatedb
       FROM pg_roles r
      WHERE r.rolname = current_user`,
  );
  if (roleRows.length !== 1) {
    throw new Error("não foi possível identificar o papel PostgreSQL atual");
  }
  const role = roleRows[0];
  if (role.current_user !== "deliveryos_entregas_pilot") {
    throw new Error(
      `papel PostgreSQL recusado: ${role.current_user}; esperado deliveryos_entregas_pilot`,
    );
  }
  if (role.rolsuper || role.rolcreaterole || role.rolcreatedb) {
    throw new Error("papel do piloto tem autoridade administrativa indevida");
  }

  const migrations = await client.query<{ version: string }>(
    `SELECT version
       FROM platform.schema_migration
      WHERE version = ANY($1::text[])
      ORDER BY version`,
    [[
      "0006_entregas_cluster_persistence",
      "0007_entregas_ready_order",
      "0008_ready_order_consumido_por_delivery",
    ]],
  );
  const have = new Set(migrations.map((x) => String(x.version)));
  for (const required of [
    "0006_entregas_cluster_persistence",
    "0007_entregas_ready_order",
    "0008_ready_order_consumido_por_delivery",
  ]) {
    if (!have.has(required)) {
      throw new Error(`migration obrigatória ausente: ${required}`);
    }
  }

  const units = await client.query<{ unit_id: string; active: boolean }>(
    `SELECT unit_id, active FROM identity.unit WHERE unit_id=$1`,
    [unitId],
  );
  if (units.length !== 1 || !units[0].active) {
    throw new Error(`unidade PostgreSQL ausente ou inativa: ${unitId}`);
  }

  const privileges = await client.query<{
    trip_read: boolean;
    trip_write: boolean;
    delivery_write: boolean;
    ready_write: boolean;
    event_insert: boolean;
    outbox_write: boolean;
    migration_write: boolean;
  }>(
    `SELECT
      has_table_privilege(current_user,'entregas.trip','SELECT') AS trip_read,
      (
        has_table_privilege(current_user,'entregas.trip','INSERT')
        AND has_table_privilege(current_user,'entregas.trip','UPDATE')
      ) AS trip_write,
      (
        has_table_privilege(current_user,'entregas.delivery','INSERT')
        AND has_table_privilege(current_user,'entregas.delivery','DELETE')
      ) AS delivery_write,
      (
        has_table_privilege(current_user,'entregas.ready_order','SELECT')
        AND has_table_privilege(current_user,'entregas.ready_order','INSERT')
        AND has_table_privilege(current_user,'entregas.ready_order','DELETE')
      ) AS ready_write,
      has_table_privilege(current_user,'entregas.domain_event','INSERT') AS event_insert,
      (
        has_table_privilege(current_user,'entregas.public_outbox','SELECT')
        AND has_table_privilege(current_user,'entregas.public_outbox','INSERT')
        AND has_table_privilege(current_user,'entregas.public_outbox','UPDATE')
      ) AS outbox_write,
      (
        has_table_privilege(current_user,'platform.schema_migration','INSERT')
        OR has_table_privilege(current_user,'platform.schema_migration','UPDATE')
        OR has_table_privilege(current_user,'platform.schema_migration','DELETE')
      ) AS migration_write`,
  );
  const p = privileges[0];
  if (
    !p ||
    !p.trip_read ||
    !p.trip_write ||
    !p.delivery_write ||
    !p.ready_write ||
    !p.event_insert ||
    !p.outbox_write
  ) {
    throw new Error("papel PostgreSQL do piloto não possui os privilégios operacionais mínimos");
  }
  if (p.migration_write) {
    throw new Error("papel PostgreSQL do piloto pode alterar schema_migration; autoridade excessiva");
  }

  return role.current_user;
}

export async function createPilotPersistenceBackend(args: {
  env?: NodeJS.ProcessEnv;
  data_dir: string;
  unit_id: string;
}): Promise<PilotPersistenceBackend> {
  const env = args.env ?? process.env;
  const kind = parseBackend(env);

  if (kind === "file") {
    return {
      kind,
      multi_instance: false,
      storage: createFilePilotUnitOfWorkSource(join(args.data_dir, "store.json")),
      ready_orders: createFilePilotReadyOrderStore(
        join(args.data_dir, "ready_orders.json"),
      ),
      close: async () => undefined,
    };
  }

  const url = (env.DELIVERYOS_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new PilotPersistenceConfigError(
      "ENTREGAS_STORAGE_BACKEND=postgres exige DELIVERYOS_DATABASE_URL postgres://",
      "DELIVERYOS_DATABASE_URL",
    );
  }

  const ssl = parseSsl(env, url);
  const hostPrivado = (env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim();
  const client = await createPgClient({
    url,
    ssl: ssl ?? !isLocalUrl(url),
    host_privado: hostPrivado,
    max: 10,
    connectionTimeoutMillis: 5_000,
    statementTimeoutMs: 15_000,
  });

  try {
    const role = await preflightPostgres(client, args.unit_id);
    const storage: PilotUnitOfWorkSource = {
      kind: "external",
      open: () => new PgEntregasUnitOfWork(client, args.unit_id),
    };
    return {
      kind,
      multi_instance: true,
      storage,
      ready_orders: new PgPilotReadyOrderStore(client, args.unit_id),
      database_role: role,
      close: () => client.close(),
    };
  } catch (e) {
    await client.close().catch(() => undefined);
    throw e;
  }
}
