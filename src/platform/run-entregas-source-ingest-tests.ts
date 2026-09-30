import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  EntregasSourceIngestConfigError,
  loadEntregasSourceIngestConfig,
} from "./config/entregas-source-ingest-config";

let passed = 0;
const tests: Array<Promise<void>> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push(Promise.resolve().then(fn).then(() => {
    passed += 1;
    console.log("  ok  " + name);
  }));
}

console.log("\n=== SOURCE INGEST — IDENTIDADE E CONFIGURAÇÃO ===\n");

test("SI1 OFF é o default e não exige nenhuma outra variável", () => {
  assert.deepEqual(loadEntregasSourceIngestConfig({}), { enabled: false });
});

test("SI2 false explícito também não exige banco nem arquivo", () => {
  assert.deepEqual(loadEntregasSourceIngestConfig({
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "false",
  }), { enabled: false });
});

test("SI3 valor inválido da flag falha fechado", () => {
  assert.throws(
    () => loadEntregasSourceIngestConfig({
      DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "talvez",
    }),
    EntregasSourceIngestConfigError,
  );
});

test("SI4 ON exige os três caminhos explícitos", () => {
  const base: NodeJS.ProcessEnv = {
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
    DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/state/checkpoint.json",
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/state/control",
  };
  for (const missing of [
    "DELIVERYOS_ENTREGAS_SOURCE_FILE",
    "DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE",
    "DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE",
  ]) {
    const env = { ...base };
    delete env[missing];
    assert.throws(
      () => loadEntregasSourceIngestConfig(env),
      (e: unknown) =>
        e instanceof EntregasSourceIngestConfigError &&
        e.variavel === missing,
    );
  }
});

test("SI5 ON preserva caminhos e limites declarados", () => {
  const c = loadEntregasSourceIngestConfig({
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
    DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/state/checkpoint.json",
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/state/control",
    DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "321",
    DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "7",
  });
  assert.equal(c.enabled, true);
  if (!c.enabled) return;
  assert.equal(c.source_file, "/source/store.json");
  assert.equal(c.state_file, "/state/checkpoint.json");
  assert.equal(c.control_file, "/state/control");
  assert.equal(c.tick_ms, 321);
  assert.equal(c.batch_size, 7);
});

test("SI6 limites zero/negativos são recusados", () => {
  const base = {
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/source/store.json",
    DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/state/checkpoint.json",
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/state/control",
  };
  assert.throws(
    () => loadEntregasSourceIngestConfig({
      ...base,
      DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "0",
    }),
    EntregasSourceIngestConfigError,
  );
  assert.throws(
    () => loadEntregasSourceIngestConfig({
      ...base,
      DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "-1",
    }),
    EntregasSourceIngestConfigError,
  );
});

test("SI7 binário é processo separado e async-runtime não o importa", () => {
  const bin = readFileSync("src/platform/bin/entregas-source-ingest.ts", "utf8");
  const async = readFileSync("src/platform/bin/async-runtime.ts", "utf8");
  assert.match(bin, /createFileEntregasEventFeed/);
  assert.match(bin, /PgTransactionalWriter/);
  assert.match(bin, /FileLiveConsumerControl/);
  assert.doesNotMatch(async, /entregas-source-ingest|EntregasLiveConsumer/);
});

test("SI8 processo OFF sobe sem URL de banco e encerra por sinal", async () => {
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
  child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { out += d.toString(); });

  const deadline = Date.now() + 5_000;
  while (!out.includes("[source-ingest] DESLIGADO") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
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
    console.log("\nSOURCE_INGEST_CONFIG: " + passed + "/8 PASS");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
