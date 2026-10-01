import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createPgClient } from "../../platform/persistence/sql-client";
import { runMigrations } from "../../platform/migrations/runner";
import { diretorioDeMigrations } from "../../platform/migrations/localizar";

const ADMIN_URL = process.env.DELIVERYOS_PG_URL?.trim();
const ROLE = "deliveryos_entregas_pilot";
const ROLE_PASSWORD = "cluster_test_password_20261001";
const UNIT = "ITAIM";
const TOKEN = "token-cluster-e2e";

if (!ADMIN_URL) {
  console.log("PILOT_POSTGRES_SERVER_CLUSTER: PULADO (DELIVERYOS_PG_URL ausente)");
  process.exit(0);
}

function roleUrl(adminUrl: string): string {
  const u = new URL(adminUrl);
  u.username = ROLE;
  u.password = ROLE_PASSWORD;
  return u.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let single = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollar: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      cur += ch;
      if (ch === "\n") lineComment = false;
      i += 1;
      continue;
    }
    if (blockComment) {
      cur += ch;
      if (ch === "*" && next === "/") {
        cur += next;
        i += 2;
        blockComment = false;
      } else {
        i += 1;
      }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        cur += dollar;
        i += dollar.length;
        dollar = null;
      } else {
        cur += ch;
        i += 1;
      }
      continue;
    }
    if (single) {
      cur += ch;
      if (ch === "'" && next === "'") {
        cur += next;
        i += 2;
        continue;
      }
      if (ch === "'") single = false;
      i += 1;
      continue;
    }
    if (doubleQuoted) {
      cur += ch;
      if (ch === '"' && next === '"') {
        cur += next;
        i += 2;
        continue;
      }
      if (ch === '"') doubleQuoted = false;
      i += 1;
      continue;
    }
    if (ch === "-" && next === "-") {
      cur += ch + next;
      i += 2;
      lineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      cur += ch + next;
      i += 2;
      blockComment = true;
      continue;
    }
    if (ch === "'") {
      cur += ch;
      single = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      cur += ch;
      doubleQuoted = true;
      i += 1;
      continue;
    }
    if (ch === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollar = match[0];
        cur += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function waitForHealth(
  port: number,
  children: Map<number, { out: string; err: string }>,
): Promise<Record<string, unknown>> {
  let last = "";
  for (let i = 0; i < 120; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      last = await r.text();
      if (r.ok) return JSON.parse(last) as Record<string, unknown>;
    } catch {
      // processo ainda subindo
    }
    await sleep(100);
  }
  const logs = children.get(port);
  throw new Error(
    `servidor ${port} não ficou saudável; última resposta=${last}; stdout=${logs?.out.slice(-3000)} stderr=${logs?.err.slice(-3000)}`,
  );
}

async function api(
  port: number,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers,
  });
  const text = await r.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // mantém texto para diagnóstico
  }
  return { status: r.status, body };
}

function spawnServer(
  port: number,
  dataDir: string,
  configPath: string,
  databaseUrl: string,
  logs: Map<number, { out: string; err: string }>,
): ChildProcess {
  const state = { out: "", err: "" };
  logs.set(port, state);
  const child = spawn(
    process.execPath,
    ["dist/tools/entregas_pilot_server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENTREGAS_ENV: "local",
        ENTREGAS_BIND: "127.0.0.1",
        ENTREGAS_UI_PORT: String(port),
        ENTREGAS_PILOT_CONFIG: configPath,
        ENTREGAS_DATA_DIR: dataDir,
        ENTREGAS_STORAGE_BACKEND: "postgres",
        DELIVERYOS_DATABASE_URL: databaseUrl,
        DELIVERYOS_DATABASE_SSL: "false",
        ENTREGAS_UNIT_CONFIG: join(dataDir, "unit-does-not-exist.json"),
        ENTREGAS_TERM_CONFIG: join(dataDir, "term-does-not-exist.json"),
        ENTREGAS_GPS_FLAGS_CONFIG: join(dataDir, "gps-flags-does-not-exist.json"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (b: Buffer) => {
    state.out += b.toString("utf8");
  });
  child.stderr?.on("data", (b: Buffer) => {
    state.err += b.toString("utf8");
  });
  return child;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    sleep(5000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pilot-pg-server-cluster-"));
  const dataA = join(root, "a");
  const dataB = join(root, "b");
  mkdirSync(dataA, { recursive: true });
  mkdirSync(dataB, { recursive: true });
  const configPath = join(root, "pilot.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mode: "test",
        unit_id: UNIT,
        unit_name: "Itaim",
        timezone: "America/Sao_Paulo",
        port: 5193,
        bind: "127.0.0.1",
        data_dir: root,
        source_mode: "simulated",
        max_stops: 5,
        banner: "TESTE CLUSTER",
        users: [
          {
            actor_id: "ops-cluster",
            role: "operador_expedicao",
            label: "Ops Cluster",
            token: TOKEN,
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
          auto_interval_minutes: 30,
          retain_count: 3,
          dir: "backups",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const admin = await createPgClient({ url: ADMIN_URL!, max: 4 });
  let roleClient: Awaited<ReturnType<typeof createPgClient>> | null = null;
  const children: ChildProcess[] = [];
  const logs = new Map<number, { out: string; err: string }>();

  try {
    const migrations = await runMigrations(admin, diretorioDeMigrations());
    assert.equal(migrations.mismatch, undefined);

    const roleSql = readFileSync("deploy/sql/papeis_minimos.sql", "utf8");
    const roleStatements = splitSql(roleSql);
    assert.ok(
      roleStatements.length > 10,
      "papeis_minimos.sql não foi separado em statements; verifique blocos $",
    );
    assert.match(
      roleStatements[0],
      /DO\s+\$\$/,
      "primeiro statement precisa preservar o bloco DO $",
    );
    for (const stmt of roleStatements) {
      await admin.query(stmt);
    }
    await admin.query(
      `ALTER ROLE ${ROLE} PASSWORD '${ROLE_PASSWORD}'`,
    );
    await admin.query(
      `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
       VALUES ($1,'Itaim','America/Sao_Paulo',true)
       ON CONFLICT (unit_id) DO UPDATE SET active=true`,
      [UNIT],
    );

    const databaseUrl = roleUrl(ADMIN_URL!);
    roleClient = await createPgClient({
      url: databaseUrl,
      ssl: false,
      max: 4,
    });

    const who = await roleClient.query<{
      current_user: string;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `SELECT current_user, rolsuper, rolcreaterole, rolcreatedb
         FROM pg_roles WHERE rolname=current_user`,
    );
    assert.equal(who[0].current_user, ROLE);
    assert.equal(who[0].rolsuper, false);
    assert.equal(who[0].rolcreaterole, false);
    assert.equal(who[0].rolcreatedb, false);

    await assert.rejects(
      () => roleClient!.query("SELECT * FROM platform.event_log LIMIT 1"),
      /permission denied/i,
    );
    await assert.rejects(
      () =>
        roleClient!.query(
          "UPDATE platform.schema_migration SET checksum='x' WHERE false",
        ),
      /permission denied/i,
    );
    await assert.rejects(
      () =>
        roleClient!.query(
          `INSERT INTO identity.device(device_id,unit_id,label)
           VALUES ('forbidden-device',$1,'forbidden')`,
          [UNIT],
        ),
      /permission denied/i,
    );

    const a = spawnServer(5311, dataA, configPath, databaseUrl, logs);
    const b = spawnServer(5312, dataB, configPath, databaseUrl, logs);
    children.push(a, b);

    const [healthA, healthB] = await Promise.all([
      waitForHealth(5311, logs),
      waitForHealth(5312, logs),
    ]);
    for (const h of [healthA, healthB]) {
      assert.equal(h.multi_instance, true);
      assert.equal(h.storage_backend, "postgres");
    }

    const [readyA, readyB] = await Promise.all([
      api(5311, "/api/ready-order", {
        method: "POST",
        body: JSON.stringify({
          order_ref: "ORDER-RACE",
          label: "Pedido compartilhado",
          channel: "proprio",
        }),
      }),
      api(5312, "/api/ready-order", {
        method: "POST",
        body: JSON.stringify({
          order_ref: "ORDER-RACE",
          label: "Pedido compartilhado",
          channel: "proprio",
        }),
      }),
    ]);
    assert.equal(readyA.status, 200);
    assert.equal(readyB.status, 200);
    assert.equal(
      Number(Boolean(readyA.body.ok)) + Number(Boolean(readyB.body.ok)),
      1,
      "duplicata concorrente precisa ter um único vencedor",
    );

    const beforeA = await api(5311, "/api/snapshot");
    const beforeB = await api(5312, "/api/snapshot");
    assert.deepEqual(
      beforeA.body.ready_orders.map((x: any) => x.order_ref),
      ["ORDER-RACE"],
    );
    assert.deepEqual(
      beforeB.body.ready_orders.map((x: any) => x.order_ref),
      ["ORDER-RACE"],
    );

    const created = await api(5311, "/api/command", {
      method: "POST",
      body: JSON.stringify({
        type: "CreateTrip",
        command_id: "cluster-create",
        occurred_at: "2026-10-01T03:20:00.000Z",
        trip_id: "CLUSTER-TRIP",
        courier_actor_id: "rider-cluster",
        deliveries: [
          {
            delivery_id: "CLUSTER-D1",
            order_ref: "ORDER-RACE",
            channel: "proprio",
          },
        ],
      }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.result.ok, true);

    const seenByB = await api(5312, "/api/snapshot");
    assert.equal(
      seenByB.body.trips.some((x: any) => x.trip_id === "CLUSTER-TRIP"),
      true,
    );
    assert.deepEqual(seenByB.body.ready_orders, []);

    for (const [port, ref, label] of [
      [5311, "ORDER-X", "Pedido X"],
      [5312, "ORDER-Y", "Pedido Y"],
    ] as const) {
      const r = await api(port, "/api/ready-order", {
        method: "POST",
        body: JSON.stringify({
          order_ref: ref,
          label,
          channel: "proprio",
        }),
      });
      assert.equal(r.body.ok, true);
    }

    const commands = [
      {
        port: 5311,
        body: {
          type: "AddDeliveryToTrip",
          command_id: "cluster-add-x",
          occurred_at: "2026-10-01T03:21:00.000Z",
          trip_id: "CLUSTER-TRIP",
          delivery_id: "CLUSTER-D2",
          order_ref: "ORDER-X",
          planned_stop_order: 2,
          channel: "proprio",
        },
      },
      {
        port: 5312,
        body: {
          type: "AddDeliveryToTrip",
          command_id: "cluster-add-y",
          occurred_at: "2026-10-01T03:21:00.000Z",
          trip_id: "CLUSTER-TRIP",
          delivery_id: "CLUSTER-D3",
          order_ref: "ORDER-Y",
          planned_stop_order: 3,
          channel: "proprio",
        },
      },
    ];

    const concurrent = await Promise.all(
      commands.map((x) =>
        api(x.port, "/api/command", {
          method: "POST",
          body: JSON.stringify(x.body),
        }),
      ),
    );
    assert.ok(
      concurrent.some((x) => x.body.result.ok === true),
      "ao menos uma escrita concorrente precisa confirmar",
    );

    for (let i = 0; i < concurrent.length; i += 1) {
      if (concurrent[i].body.result.ok === true) continue;
      const retry = await api(commands[i].port, "/api/command", {
        method: "POST",
        body: JSON.stringify({
          ...commands[i].body,
          command_id: commands[i].body.command_id + "-retry",
          occurred_at: "2026-10-01T03:21:01.000Z",
        }),
      });
      assert.equal(
        retry.body.result.ok,
        true,
        `retry após conflito falhou: ${JSON.stringify(retry.body)}`,
      );
    }

    const [finalA, finalB] = await Promise.all([
      api(5311, "/api/snapshot"),
      api(5312, "/api/snapshot"),
    ]);
    const idsA = finalA.body.trips
      .find((x: any) => x.trip_id === "CLUSTER-TRIP")
      .deliveries.map((x: any) => x.delivery_id)
      .sort();
    const idsB = finalB.body.trips
      .find((x: any) => x.trip_id === "CLUSTER-TRIP")
      .deliveries.map((x: any) => x.delivery_id)
      .sort();
    assert.deepEqual(idsA, ["CLUSTER-D1", "CLUSTER-D2", "CLUSTER-D3"]);
    assert.deepEqual(idsB, idsA);
    assert.deepEqual(finalA.body.ready_orders, []);
    assert.deepEqual(finalB.body.ready_orders, []);

    const db = await admin.query<{
      version: number;
      deliveries: number;
      ready: number;
    }>(
      `SELECT
         (SELECT version::int FROM entregas.trip WHERE trip_id='CLUSTER-TRIP') AS version,
         (SELECT count(*)::int FROM entregas.delivery WHERE trip_id='CLUSTER-TRIP') AS deliveries,
         (SELECT count(*)::int FROM entregas.ready_order WHERE unit_id=$1) AS ready`,
      [UNIT],
    );
    assert.equal(Number(db[0].version), 3);
    assert.equal(Number(db[0].deliveries), 3);
    assert.equal(Number(db[0].ready), 0);

    console.log("  ok  PSRV1 papel mínimo recusou plataforma/migration/device");
    console.log("  ok  PSRV2 duas instâncias subiram com postgres + multi_instance=true");
    console.log("  ok  PSRV3 ready-order concorrente teve exatamente um vencedor");
    console.log("  ok  PSRV4 estado criado em A apareceu em B e fila foi consumida");
    console.log("  ok  PSRV5 alterações concorrentes não perderam update; retry convergiu");
    console.log("  ok  PSRV6 snapshots A/B e PostgreSQL convergiram em version=3");
    console.log("\nPILOT_POSTGRES_SERVER_CLUSTER: 6/6 PASS");
  } finally {
    await Promise.all(children.map((c) => stop(c).catch(() => undefined)));
    await roleClient?.close().catch(() => undefined);
    await admin.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
