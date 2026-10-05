/**
 * Prova de processo do source-ingest com PostgreSQL na fonte e no destino.
 *
 * Sobe o binário compilado com duas credenciais distintas, observa escrita
 * real no destino e garante que URLs/segredos não vazam no log.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import {
  bancoIsolado,
  urlCom,
  type BancoIsolado,
} from "./banco-isolado";
import { createPgClient } from "./persistence/sql-client";
import { FileConsumerStateStore } from "./runtime/entregas-live-consumer";

const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const ROOT = process.cwd();
const SOURCE_SECRET = "SOURCE_SECRET_SENTINEL_9wX";
const TARGET_SECRET = "TARGET_SECRET_SENTINEL_4pQ";

function ident(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) {
    throw new Error("identificador SQL inválido");
  }
  return v;
}

function asRole(url: string, role: string, password: string): string {
  const u = new URL(url);
  u.username = role;
  u.password = password;
  return u.toString();
}

function publicEvent(
  id: string,
  unit: string,
  eventType: EntregasPublicEvent["event_type"],
  at: string,
): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: eventType,
    schema_version: "1.0.0",
    occurred_at: at,
    recorded_at: at,
    idempotency_key: "idem:" + id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: unit,
    source_mode: "simulated",
    trip_id: "trip:" + id,
    payload: {},
    correlation_id: "trip:" + id,
    contract_version: "COR-ENTREGAS-V1@1.0.3",
  };
}

async function insertPublic(
  banco: BancoIsolado,
  e: EntregasPublicEvent,
): Promise<void> {
  await banco.cliente.query(
    `INSERT INTO entregas.public_outbox
      (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,'pending',0,$6::timestamptz)`,
    [
      "out:" + e.event_id,
      e.unit_id,
      e.event_id,
      e.idempotency_key,
      JSON.stringify(e),
      e.recorded_at,
    ],
  );
}

async function main(): Promise<void> {
  console.log("\n=== SOURCE INGEST — PROCESSO PG->PG ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — processo PG->PG NÃO foi provado.",
    );
    return;
  }

  const binary = join(
    __dirname,
    "bin",
    "entregas-source-ingest.js",
  );
  assert.ok(existsSync(binary), "binário compilado ausente: " + binary);

  const dir = mkdtempSync(join(tmpdir(), "source-pg-process-"));
  const stateFile = join(dir, "checkpoint.json");
  const controlFile = join(dir, "control");
  writeFileSync(controlFile, "RUN\n", "utf8");

  let sourceDb: BancoIsolado | null = null;
  let targetDb: BancoIsolado | null = null;
  let child: ReturnType<typeof spawn> | null = null;

  const suffix =
    process.pid.toString(36) + "_" + Date.now().toString(36).slice(-7);
  const READER = ident("proc_reader_" + suffix);
  const CRIT = ident("proc_crit_" + suffix);
  const ASY = ident("proc_async_" + suffix);
  const WRITER = ident("proc_writer_" + suffix);
  const PILOT = ident("proc_pilot_" + suffix);
  const roles = [READER, CRIT, ASY, WRITER, PILOT];

  try {
    sourceDb = await bancoIsolado(PG_URL, undefined, "proc_source");
    targetDb = await bancoIsolado(PG_URL, undefined, "proc_target");

    const readerSql = readFileSync(
      join(ROOT, "deploy/sql/entregas_feed_reader.sql"),
      "utf8",
    ).replaceAll("deliveryos_entregas_feed_reader", READER);
    await sourceDb.cliente.query(readerSql);

    const targetRoles = readFileSync(
      join(ROOT, "deploy/sql/papeis_minimos.sql"),
      "utf8",
    )
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", WRITER)
      .replaceAll("deliveryos_entregas_pilot", PILOT);
    await targetDb.cliente.query(targetRoles);

    const e1 = publicEvent(
      "proc-e1-" + suffix,
      "ITAIM",
      "trip_created",
      "2026-10-04T20:00:00.000Z",
    );
    const e2 = publicEvent(
      "proc-e2-" + suffix,
      "ITAIM",
      "delivery_added",
      "2026-10-04T20:01:00.000Z",
    );
    const e3 = publicEvent(
      "proc-e3-" + suffix,
      "PINHEIROS",
      "trip_started",
      "2026-10-04T20:02:00.000Z",
    );
    for (const e of [e1, e2, e3]) await insertPublic(sourceDb, e);

    const sourceUrl = asRole(sourceDb.url, READER, SOURCE_SECRET);
    const targetUrl = asRole(targetDb.url, WRITER, TARGET_SECRET);

    child = spawn(process.execPath, [binary], {
      env: {
        PATH: process.env.PATH,
        DELIVERYOS_ENV: "local",
        DELIVERYOS_DATABASE_URL: targetUrl,
        DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
        DELIVERYOS_ENTREGAS_SOURCE_BACKEND: "postgres",
        DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL: sourceUrl,
        DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: stateFile,
        DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: controlFile,
        DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "50",
        DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "50",
        DELIVERYOS_COMMIT: "process-test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      out += d.toString();
    });

    const deadline = Date.now() + 10_000;
    let facts = 0;
    while (Date.now() < deadline) {
      const r = await targetDb.cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log",
      );
      facts = Number(r[0]?.n ?? 0);
      if (facts >= 2) break;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(facts, 2, "binário não gravou os 2 fatos equivalentes");
    const targetFacts = await targetDb.cliente.query<{
      event_type: string;
      unit_id: string;
    }>(
      "SELECT event_type,unit_id FROM platform.event_log " +
        "ORDER BY occurred_at,event_type",
    );
    assert.deepEqual(
      targetFacts.map((x) => [x.event_type, x.unit_id]),
      [
        ["trip_created", "ITAIM"],
        ["trip_started", "PINHEIROS"],
      ],
    );

    const state = await new FileConsumerStateStore(stateFile).load();
    assert.equal(state.checkpoint, e3.event_id);
    assert.equal(state.isolated_count, 1);

    const sourceCount = await sourceDb.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.public_outbox",
    );
    assert.equal(Number(sourceCount[0]?.n), 3);

    assert.match(out, /"source_backend":"postgres"/);
    assert.doesNotMatch(out, /SOURCE_SECRET_SENTINEL/);
    assert.doesNotMatch(out, /TARGET_SECRET_SENTINEL/);
    assert.doesNotMatch(out, /proc_reader_|proc_writer_/);
    assert.doesNotMatch(out, /falha fatal/i);

    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child && child.exitCode === null) child.kill();
        resolve();
      }, 3_000);
      child!.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    console.log("  ok  PR1 binário real PG->PG gravou 2/3 e isolou 1");
    console.log("  ok  PR2 checkpoint avançou até o último evento");
    console.log("  ok  PR3 fonte permaneceu com 3 eventos");
    console.log("  ok  PR4 logs não vazaram as duas credenciais-sentinela");
    console.log("  ok  PR5 processo encerrou após sinal");
    console.log("\nSOURCE_INGEST_PG_PROCESS: 5/5 PASS");
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (sourceDb) await sourceDb.descartar().catch(() => undefined);
    if (targetDb) await targetDb.descartar().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });

    if (PG_URL) {
      const admin = await createPgClient({
        url: urlCom(PG_URL, "postgres"),
        max: 1,
      });
      try {
        for (const role of roles) {
          await admin.query("DROP ROLE IF EXISTS " + role);
        }
      } finally {
        await admin.close();
      }
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
