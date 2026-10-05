/**
 * Prova integrada PostgreSQL fonte -> source-ingest -> PostgreSQL destino.
 *
 * Dois bancos isolados no mesmo servidor, papéis distintos e kill switch real.
 * Não sobe serviço persistente nem toca produção.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import {
  bancoIsolado,
  urlCom,
  type BancoIsolado,
} from "./banco-isolado";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import {
  createPgClient,
  type SqlClient,
  type TransactionalSqlClient,
} from "./persistence/sql-client";
import {
  EntregasLiveConsumer,
  FileConsumerStateStore,
  FileLiveConsumerControl,
} from "./runtime/entregas-live-consumer";
import { PgCommittedOutboxEntregasEventFeed } from "./runtime/pg-entregas-event-feed";

const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const ROOT = process.cwd();

let passed = 0;
const failures: string[] = [];

async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(name + ": " + (e instanceof Error ? e.message : String(e)));
    console.log(
      "  XX  " +
        name +
        ": " +
        (e instanceof Error ? e.message.split("\n")[0] : String(e)),
    );
  }
}

function ident(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) {
    throw new Error("identificador SQL inválido");
  }
  return v;
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
  console.log("\n=== SOURCE INGEST — PG FONTE -> PG DESTINO ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — PG->PG NÃO foi provado.",
    );
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "source-pg-to-pg-"));
  const stateFile = join(dir, "checkpoint.json");
  const controlFile = join(dir, "control");

  let sourceDb: BancoIsolado | null = null;
  let targetDb: BancoIsolado | null = null;

  const suffix =
    process.pid.toString(36) + "_" + Date.now().toString(36).slice(-7);
  const READER = ident("pgpg_reader_" + suffix);
  const CRIT = ident("pgpg_crit_" + suffix);
  const ASY = ident("pgpg_async_" + suffix);
  const WRITER = ident("pgpg_writer_" + suffix);
  const PILOT = ident("pgpg_pilot_" + suffix);
  const roles = [READER, CRIT, ASY, WRITER, PILOT];

  try {
    sourceDb = await bancoIsolado(PG_URL, undefined, "source_pg");
    targetDb = await bancoIsolado(PG_URL, undefined, "target_pg");

    const readerSql = readFileSync(
      join(ROOT, "deploy/sql/entregas_feed_reader.sql"),
      "utf8",
    ).replaceAll("deliveryos_entregas_feed_reader", READER);
    await sourceDb.cliente.query(readerSql);
    await sourceDb.cliente.query("GRANT " + READER + " TO CURRENT_USER");

    const targetRoles = readFileSync(
      join(ROOT, "deploy/sql/papeis_minimos.sql"),
      "utf8",
    )
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", WRITER)
      .replaceAll("deliveryos_entregas_pilot", PILOT);
    await targetDb.cliente.query(targetRoles);
    await targetDb.cliente.query("GRANT " + WRITER + " TO CURRENT_USER");

    const sourceAsReader: TransactionalSqlClient = {
      query: async () => {
        throw new Error("source_reader_query_outside_transaction");
      },
      transaction: async <T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> =>
        sourceDb!.cliente.transaction(async (tx) => {
          let roleApplied = false;
          const wrapped: SqlClient = {
            query: async <R extends Record<string, unknown> = Record<string, unknown>>(
              sql: string,
              params: readonly unknown[] = [],
            ): Promise<R[]> => {
              const rows = await tx.query<R>(sql, params);
              if (!roleApplied && /^SET TRANSACTION\b/i.test(sql.trim())) {
                await tx.query("SET LOCAL ROLE " + READER);
                roleApplied = true;
              }
              return rows;
            },
          };
          return fn(wrapped);
        }),
      close: async () => undefined,
    };

    const targetWriter = new PgTransactionalWriter({
      transaction: async <T>(
        fn: (tx: SqlClient) => Promise<T>,
      ): Promise<T> =>
        targetDb!.cliente.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE " + WRITER);
          return fn(tx);
        }),
    });

    const e1 = publicEvent(
      "pgpg-e1-" + suffix,
      "ITAIM",
      "trip_created",
      "2026-10-04T19:00:00.000Z",
    );
    const e2 = publicEvent(
      "pgpg-e2-" + suffix,
      "PINHEIROS",
      "delivery_added",
      "2026-10-04T19:01:00.000Z",
    );
    const e3 = publicEvent(
      "pgpg-e3-" + suffix,
      "PINHEIROS",
      "trip_started",
      "2026-10-04T19:02:00.000Z",
    );
    for (const e of [e1, e2, e3]) await insertPublic(sourceDb, e);

    const makeConsumer = () =>
      new EntregasLiveConsumer({
        enabled: true,
        feed: new PgCommittedOutboxEntregasEventFeed(sourceAsReader),
        writer: targetWriter,
        state: new FileConsumerStateStore(stateFile),
        control: new FileLiveConsumerControl(controlFile),
        batch_size: 50,
        now: () => new Date("2026-10-04T19:05:00.000Z"),
      });

    async function targetCounts(): Promise<{
      facts: number;
      outbox: number;
    }> {
      const [facts, outbox] = await Promise.all([
        targetDb!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.event_log",
        ),
        targetDb!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.outbox",
        ),
      ]);
      return {
        facts: Number(facts[0]?.n ?? 0),
        outbox: Number(outbox[0]?.n ?? 0),
      };
    }

    await testCase(
      "PP1 papéis de origem e destino não acumulam autoridade",
      async () => {
        const src = await sourceDb!.cliente.query<{
          source_event: boolean;
          source_unit: boolean;
          source_insert: boolean;
          platform_insert: boolean;
        }>(
          "SELECT " +
            "has_column_privilege($1,'entregas.public_outbox','event','SELECT') AS source_event," +
            "has_column_privilege($1,'entregas.public_outbox','unit_id','SELECT') AS source_unit," +
            "has_table_privilege($1,'entregas.public_outbox','INSERT') AS source_insert," +
            "has_table_privilege($1,'platform.event_log','INSERT') AS platform_insert",
          [READER],
        );
        assert.deepEqual(src[0], {
          source_event: true,
          source_unit: false,
          source_insert: false,
          platform_insert: false,
        });

        const dst = await targetDb!.cliente.query<{
          platform_insert: boolean;
          source_event: boolean;
        }>(
          "SELECT " +
            "has_table_privilege($1,'platform.event_log','INSERT') AS platform_insert," +
            "has_column_privilege($1,'entregas.public_outbox','event','SELECT') AS source_event",
          [WRITER],
        );
        assert.deepEqual(dst[0], {
          platform_insert: true,
          source_event: false,
        });
      },
    );

    await testCase(
      "PP2 kill switch ausente impede leitura útil e escrita no destino",
      async () => {
        const r = await makeConsumer().tick();
        assert.equal(r.status, "killed");
        assert.deepEqual(await targetCounts(), { facts: 0, outbox: 0 });
      },
    );

    await testCase(
      "PP3 RUN consome PG fonte e grava só equivalências seguras no PG destino",
      async () => {
        writeFileSync(controlFile, "RUN\n", "utf8");
        const r = await makeConsumer().tick();
        assert.equal(r.status, "worked");
        assert.equal(r.pulled, 3);
        assert.equal(r.ingested, 2);
        assert.equal(r.isolated, 1);
        assert.deepEqual(await targetCounts(), { facts: 2, outbox: 2 });

        const facts = await targetDb!.cliente.query<{
          event_type: string;
          unit_id: string;
          source_mode: string;
        }>(
          "SELECT event_type,unit_id,source_mode FROM platform.event_log " +
            "ORDER BY occurred_at,event_type",
        );
        assert.deepEqual(
          facts.map((x) => [x.event_type, x.unit_id]),
          [
            ["trip_created", "ITAIM"],
            ["trip_started", "PINHEIROS"],
          ],
        );
        assert.ok(facts.every((x) => x.source_mode === "simulated"));

        const state = await new FileConsumerStateStore(stateFile).load();
        assert.equal(state.checkpoint, e3.event_id);
        assert.equal(state.isolated_count, 1);
        assert.equal(
          state.last_isolation?.reason,
          "tipo_sem_equivalencia_segura",
        );
      },
    );

    await testCase(
      "PP4 restart no checkpoint fica idle e não duplica destino",
      async () => {
        const before = await targetCounts();
        const r = await makeConsumer().tick();
        assert.equal(r.status, "idle");
        assert.deepEqual(await targetCounts(), before);
      },
    );

    await testCase(
      "PP5 evento novo acumula na fonte durante STOP e entra após RUN",
      async () => {
        const e4 = publicEvent(
          "pgpg-e4-" + suffix,
          "ITAIM",
          "trip_created",
          "2026-10-04T19:10:00.000Z",
        );
        await insertPublic(sourceDb!, e4);

        writeFileSync(controlFile, "STOP\n", "utf8");
        const before = await targetCounts();
        assert.equal((await makeConsumer().tick()).status, "killed");
        assert.deepEqual(await targetCounts(), before);

        writeFileSync(controlFile, "RUN\n", "utf8");
        const resumed = await makeConsumer().tick();
        assert.equal(resumed.status, "worked");
        assert.equal(resumed.pulled, 1);
        assert.equal(resumed.ingested, 1);
        assert.deepEqual(await targetCounts(), {
          facts: before.facts + 1,
          outbox: before.outbox + 1,
        });

        const state = await new FileConsumerStateStore(stateFile).load();
        assert.equal(state.checkpoint, e4.event_id);
      },
    );

    await testCase(
      "PP6 writer de destino continua sem leitura da verdade",
      async () => {
        const code = await targetDb!.cliente
          .transaction(async (tx) => {
            await tx.query("SET LOCAL ROLE " + WRITER);
            await tx.query(
              "SELECT event_id FROM platform.event_log LIMIT 1",
            );
          })
          .then(
            () => null,
            (e: unknown) => {
              const c = (e as { code?: unknown } | null)?.code;
              return typeof c === "string" ? c : "erro_sem_sqlstate";
            },
          );
        assert.equal(code, "42501");
      },
    );
  } finally {
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

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log("\nSOURCE_INGEST_PG_TO_PG: " + passed + "/6 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
