import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  EntregasSourceIngestConfigError,
  loadEntregasSourceIngestConfig,
} from "./config/entregas-source-ingest-config";
import {
  dispensadoDeTls,
  isLocalUrl,
} from "./persistence/sql-client";

let passed = 0;
const tests: Array<Promise<void>> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push(
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed += 1;
        console.log("  ok  " + name);
      }),
  );
}

function enabledBase(
  backend: "file" | "postgres",
): NodeJS.ProcessEnv {
  return {
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_BACKEND: backend,
    DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/state/checkpoint.json",
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/state/control",
  };
}

console.log("\n=== SOURCE INGEST â€” IDENTIDADE E CONFIGURAÃ‡ÃƒO ===\n");

test("SI1 OFF Ã© o default e nÃ£o exige nenhuma outra variÃ¡vel", () => {
  assert.deepEqual(loadEntregasSourceIngestConfig({}), {
    enabled: false,
  });
});

test("SI2 false explÃ­cito tambÃ©m nÃ£o exige banco nem arquivo", () => {
  assert.deepEqual(
    loadEntregasSourceIngestConfig({
      DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "false",
    }),
    { enabled: false },
  );
});

test("SI3 valor invÃ¡lido da flag falha fechado", () => {
  assert.throws(
    () =>
      loadEntregasSourceIngestConfig({
        DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "talvez",
      }),
    EntregasSourceIngestConfigError,
  );
});

test("SI4 ON exige backend explÃ­cito; nÃ£o adivinha file nem postgres", () => {
  assert.throws(
    () =>
      loadEntregasSourceIngestConfig({
        DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
        DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
        DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/state/checkpoint.json",
        DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/state/control",
      }),
    (e: unknown) =>
      e instanceof EntregasSourceIngestConfigError &&
      e.variavel === "DELIVERYOS_ENTREGAS_SOURCE_BACKEND",
  );
});

test("SI5 backend file exige fonte + checkpoint + kill switch", () => {
  const base = {
    ...enabledBase("file"),
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
  };
  for (const missing of [
    "DELIVERYOS_ENTREGAS_SOURCE_FILE",
    "DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE",
    "DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE",
  ]) {
    const env: NodeJS.ProcessEnv = { ...base };
    delete env[missing];
    assert.throws(
      () => loadEntregasSourceIngestConfig(env),
      (e: unknown) =>
        e instanceof EntregasSourceIngestConfigError &&
        e.variavel === missing,
    );
  }
});

test("SI6 backend postgres exige URL + checkpoint + kill switch", () => {
  const base = {
    ...enabledBase("postgres"),
    DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL:
      "postgresql://reader@localhost/entregas",
  };
  for (const missing of [
    "DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL",
    "DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE",
    "DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE",
  ]) {
    const env: NodeJS.ProcessEnv = { ...base };
    delete env[missing];
    assert.throws(
      () => loadEntregasSourceIngestConfig(env),
      (e: unknown) =>
        e instanceof EntregasSourceIngestConfigError &&
        e.variavel === missing,
    );
  }
});

test("SI7 backend desconhecido Ã© recusado", () => {
  assert.throws(
    () =>
      loadEntregasSourceIngestConfig({
        ...enabledBase("file"),
        DELIVERYOS_ENTREGAS_SOURCE_BACKEND: "memoria",
        DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
      }),
    (e: unknown) =>
      e instanceof EntregasSourceIngestConfigError &&
      e.variavel === "DELIVERYOS_ENTREGAS_SOURCE_BACKEND",
  );
});

test("SI8 file preserva caminhos e limites declarados", () => {
  const c = loadEntregasSourceIngestConfig({
    ...enabledBase("file"),
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
    DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "321",
    DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "7",
  });
  assert.equal(c.enabled, true);
  if (!c.enabled || c.source_backend !== "file") {
    throw new Error("backend file nÃ£o preservado");
  }
  assert.equal(c.source_file, "/source/store.json");
  assert.equal(c.state_file, "/state/checkpoint.json");
  assert.equal(c.control_file, "/state/control");
  assert.equal(c.tick_ms, 321);
  assert.equal(c.batch_size, 7);
});

test("SI9 postgres preserva URL, TLS e host privado sem vazar para log", () => {
  const c = loadEntregasSourceIngestConfig({
    ...enabledBase("postgres"),
    DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL:
      "postgresql://reader:segredo@entregas-db/entregas",
    DELIVERYOS_ENTREGAS_SOURCE_DATABASE_SSL: "false",
    DELIVERYOS_ENTREGAS_SOURCE_DATABASE_PRIVATE_HOST: "entregas-db",
    DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "456",
    DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "9",
  });
  assert.equal(c.enabled, true);
  if (!c.enabled || c.source_backend !== "postgres") {
    throw new Error("backend postgres nÃ£o preservado");
  }
  assert.equal(
    c.source_database_url,
    "postgresql://reader:segredo@entregas-db/entregas",
  );
  assert.equal(c.source_database_ssl, false);
  assert.equal(c.source_database_private_host, "entregas-db");
  assert.equal(c.tick_ms, 456);
  assert.equal(c.batch_size, 9);
});

test("SI10 flag TLS invÃ¡lida da fonte PG falha fechado", () => {
  assert.throws(
    () =>
      loadEntregasSourceIngestConfig({
        ...enabledBase("postgres"),
        DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL:
          "postgresql://reader@localhost/entregas",
        DELIVERYOS_ENTREGAS_SOURCE_DATABASE_SSL: "quem-sabe",
      }),
    (e: unknown) =>
      e instanceof EntregasSourceIngestConfigError &&
      e.variavel === "DELIVERYOS_ENTREGAS_SOURCE_DATABASE_SSL",
  );
});

test("SI11 limites zero/negativos sÃ£o recusados nos dois backends", () => {
  for (const env of [
    {
      ...enabledBase("file"),
      DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
    },
    {
      ...enabledBase("postgres"),
      DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL:
        "postgresql://reader@localhost/entregas",
    },
  ]) {
    assert.throws(
      () =>
        loadEntregasSourceIngestConfig({
          ...env,
          DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "0",
        }),
      EntregasSourceIngestConfigError,
    );
    assert.throws(
      () =>
        loadEntregasSourceIngestConfig({
          ...env,
          DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "-1",
        }),
      EntregasSourceIngestConfigError,
    );
  }
});

test("SI12 binÃ¡rio escolhe feed explÃ­cito e async-runtime nÃ£o o importa", () => {
  const bin = readFileSync(
    "src/platform/bin/entregas-source-ingest.ts",
    "utf8",
  );
  const asyncRuntime = readFileSync(
    "src/platform/bin/async-runtime.ts",
    "utf8",
  );
  assert.match(bin, /createFileEntregasEventFeed/);
  assert.match(bin, /PgCommittedOutboxEntregasEventFeed/);
  assert.match(bin, /source_backend === "file"/);
  assert.match(bin, /source_database_url/);
  assert.doesNotMatch(
    asyncRuntime,
    /entregas-source-ingest|EntregasLiveConsumer/,
  );
});

test("SI13 socket Unix PostgreSQL absoluto Ã© local; URL ambÃ­gua nÃ£o Ã©", () => {
  const socket = "postgresql:///postgres?host=/var/run/postgresql";
  assert.equal(isLocalUrl(socket), true);
  assert.equal(dispensadoDeTls(socket), true);

  assert.equal(isLocalUrl("postgresql:///postgres"), false);
  assert.equal(
    isLocalUrl("postgresql:///postgres?host=var/run/postgresql"),
    false,
  );
  assert.equal(
    isLocalUrl(
      "postgresql://db.exemplo.com/postgres?host=/var/run/postgresql",
    ),
    false,
  );
});

test("SI14 processo OFF sobe sem URL de banco e encerra por sinal", async () => {
  const child = spawn(
    process.execPath,
    ["dist/src/platform/bin/entregas-source-ingest.js"],
    {
      env: {
        PATH: process.env.PATH,
        DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let out = "";
  child.stdout.on("data", (d: Buffer) => {
    out += d.toString();
  });
  child.stderr.on("data", (d: Buffer) => {
    out += d.toString();
  });

  const deadline = Date.now() + 5_000;
  while (
    !out.includes("[source-ingest] DESLIGADO") &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.match(out, /DESLIGADO/);
  assert.doesNotMatch(out, /DATABASE_URL|postgres/i);
  child.kill("SIGTERM");

  const exit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );

  assert.ok(
    exit.code === 0 || exit.signal === "SIGTERM",
    "processo terminou por motivo inesperado: " + JSON.stringify(exit),
  );
  assert.doesNotMatch(out, /falha fatal/i);
});

void Promise.all(tests)
  .then(() => {
    console.log("\nSOURCE_INGEST_CONFIG: " + passed + "/14 PASS");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
