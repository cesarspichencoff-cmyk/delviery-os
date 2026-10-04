import assert from "node:assert/strict";

import {
  evaluateDatabasePreflight,
  type DatabasePreflightFacts,
} from "./database-preflight";
import type { MigrationFile } from "./migrations/runner";

const LOCAL: MigrationFile[] = [
  { version: "0001_base", path: "0001.sql", sql: "", checksum: "1111111111111111" },
  {
    version: "0006_entregas_cluster_persistence",
    path: "0006.sql",
    sql: "",
    checksum: "6666666666666666",
  },
  {
    version: "0007_entregas_ready_order",
    path: "0007.sql",
    sql: "",
    checksum: "7777777777777777",
  },
  {
    version: "0008_ready_order_consumido_por_delivery",
    path: "0008.sql",
    sql: "",
    checksum: "8888888888888888",
  },
  {
    version: "0009_device_runtime_status",
    path: "0009.sql",
    sql: "",
    checksum: "9999999999999999",
  },
];

function facts(
  overrides: Partial<DatabasePreflightFacts> = {},
): DatabasePreflightFacts {
  return {
    database: "deliveryos",
    current_user: "deliveryos_migrator",
    server_version: "17.11",
    server_version_num: 170011,
    ssl_active: true,
    database_create: true,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    migration_table_present: false,
    applied_migrations: [],
    ...overrides,
  };
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("PASS", name);
}

ok("DBP1 banco novo pode seguir para migration sem fingir runtime pronto", () => {
  const r = evaluateDatabasePreflight({
    facts: facts(),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, true);
  assert.equal(r.ready_for_runtime_preflight, false);
  assert.deepEqual(r.pending_migrations, LOCAL.map((m) => m.version));
});

ok("DBP2 schema atual fica pronto para runtime", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({
      migration_table_present: true,
      applied_migrations: LOCAL.map((m) => ({
        version: m.version,
        checksum: m.checksum,
      })),
    }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, true);
  assert.equal(r.ready_for_runtime_preflight, true);
  assert.equal(r.pilot_required_present, true);
});

ok("DBP3 papel de runtime nunca vira credencial de migration", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({ current_user: "deliveryos_entregas_pilot" }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, false);
  assert.match(r.issues.join(" "), /papel de runtime/);
});

ok("DBP4 ausência de CREATE para migration falha fechado", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({ database_create: false }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, false);
  assert.match(r.issues.join(" "), /CREATE/);
});

ok("DBP5 TLS obrigatório precisa estar ativo de verdade", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({ ssl_active: false }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, false);
  assert.match(r.issues.join(" "), /TLS/);
});

ok("DBP6 migration futura no banco bloqueia checkout antigo", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({
      migration_table_present: true,
      applied_migrations: [
        { version: "9999_future", checksum: "9999999999999999" },
      ],
    }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, false);
  assert.deepEqual(r.unknown_migrations, ["9999_future"]);
});

ok("DBP7 checksum divergente bloqueia antes de migrate", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({
      migration_table_present: true,
      applied_migrations: [
        { version: "0001_base", checksum: "aaaaaaaaaaaaaaaa" },
      ],
    }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.equal(r.ready_for_migration, false);
  assert.deepEqual(
    r.checksum_mismatches.map((x) => x.version),
    ["0001_base"],
  );
});

ok("DBP8 checksum legado não comparável não vira falso mismatch", () => {
  const r = evaluateDatabasePreflight({
    facts: facts({
      migration_table_present: true,
      applied_migrations: [
        { version: "0001_base", checksum: "legacy-self-marker" },
      ],
    }),
    local_migrations: LOCAL,
    tls_required: true,
  });
  assert.deepEqual(r.checksum_mismatches, []);
  assert.equal(r.ready_for_migration, true);
});

console.log(`DATABASE_PREFLIGHT: ${passed}/8 PASS`);
