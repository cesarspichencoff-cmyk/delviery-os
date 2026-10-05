/**
 * Prova PostgreSQL real do feed público de Entregas.
 *
 * Mede cursor global, ordem, validação de envelope e privilégio mínimo do
 * leitor da fonte. Não ativa source-ingest como serviço.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import { EntregasFeedCursorNotFound } from "../entregas/integration/durable-event-feed";
import {
  PgCommittedOutboxEntregasEventFeed,
  PgEntregasFeedIdentityMismatch,
  PgEntregasFeedInvalidEvent,
} from "./runtime/pg-entregas-event-feed";
import {
  bancoIsolado,
  urlCom,
  type BancoIsolado,
} from "./banco-isolado";
import {
  createPgClient,
  type SqlClient,
  type TransactionalSqlClient,
} from "./persistence/sql-client";

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

function event(
  id: string,
  unit: string,
  type: EntregasPublicEvent["event_type"],
  occurredAt: string,
): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: type,
    schema_version: "1.0.0",
    occurred_at: occurredAt,
    recorded_at: occurredAt,
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

async function main(): Promise<void> {
  console.log("\n=== PG ENTREGAS EVENT FEED ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — feed PostgreSQL NÃO foi provado.",
    );
    return;
  }

  let banco: BancoIsolado | null = null;
  const suffix =
    process.pid.toString(36) + "_" + Date.now().toString(36).slice(-7);
  const READER = ident("feed_reader_" + suffix);

  try {
    banco = await bancoIsolado(PG_URL, undefined, "pg_entregas_feed");

    const readerSql = readFileSync(
      join(ROOT, "deploy/sql/entregas_feed_reader.sql"),
      "utf8",
    ).replaceAll("deliveryos_entregas_feed_reader", READER);

    await banco.cliente.query(readerSql);
    await banco.cliente.query("GRANT " + READER + " TO CURRENT_USER");

    const e1 = event(
      "feed-e1-" + suffix,
      "ITAIM",
      "trip_created",
      "2026-10-04T18:00:00.000Z",
    );
    const e2 = event(
      "feed-e2-" + suffix,
      "PINHEIROS",
      "trip_started",
      "2026-10-04T18:01:00.000Z",
    );
    const e3 = event(
      "feed-e3-" + suffix,
      "ITAIM",
      "trip_closed_manual",
      "2026-10-04T18:02:00.000Z",
    );

    for (const e of [e1, e2, e3]) {
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

    const asReader: TransactionalSqlClient = {
      query: async () => {
        throw new Error("feed_reader_query_outside_transaction");
      },
      transaction: async <T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> =>
        banco!.cliente.transaction(async (tx) => {
          let roleApplied = false;
          const wrapped: SqlClient = {
            query: async <R extends Record<string, unknown> = Record<string, unknown>>(
              sql: string,
              params: readonly unknown[] = [],
            ): Promise<R[]> => {
              const rows = await tx.query<R>(sql, params);
              if (
                !roleApplied &&
                /^SET TRANSACTION\b/i.test(sql.trim())
              ) {
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

    const feed = new PgCommittedOutboxEntregasEventFeed(asReader);

    await testCase(
      "PF1 leitor tem só USAGE + SELECT das 3 colunas necessárias",
      async () => {
        const r = await banco!.cliente.query<{
          schema_usage: boolean;
          table_select: boolean;
          seq_select: boolean;
          event_id_select: boolean;
          event_select: boolean;
          unit_select: boolean;
          insert_ok: boolean;
          update_ok: boolean;
          delete_ok: boolean;
        }>(
          "SELECT " +
            "has_schema_privilege($1,'entregas','USAGE') AS schema_usage," +
            "has_table_privilege($1,'entregas.public_outbox','SELECT') AS table_select," +
            "has_column_privilege($1,'entregas.public_outbox','seq','SELECT') AS seq_select," +
            "has_column_privilege($1,'entregas.public_outbox','event_id','SELECT') AS event_id_select," +
            "has_column_privilege($1,'entregas.public_outbox','event','SELECT') AS event_select," +
            "has_column_privilege($1,'entregas.public_outbox','unit_id','SELECT') AS unit_select," +
            "has_table_privilege($1,'entregas.public_outbox','INSERT') AS insert_ok," +
            "has_table_privilege($1,'entregas.public_outbox','UPDATE') AS update_ok," +
            "has_table_privilege($1,'entregas.public_outbox','DELETE') AS delete_ok",
          [READER],
        );
        assert.deepEqual(r[0], {
          schema_usage: true,
          table_select: false,
          seq_select: true,
          event_id_select: true,
          event_select: true,
          unit_select: false,
          insert_ok: false,
          update_ok: false,
          delete_ok: false,
        });
      },
    );

    await testCase(
      "PF2 lista usa ordem global seq atravessando unidades",
      async () => {
        const got = await feed.list();
        assert.deepEqual(
          got.map((e) => [e.event_id, e.unit_id]),
          [
            [e1.event_id, "ITAIM"],
            [e2.event_id, "PINHEIROS"],
            [e3.event_id, "ITAIM"],
          ],
        );
      },
    );

    await testCase(
      "PF3 cursor event_id retoma depois do seq correspondente",
      async () => {
        const got = await feed.list({
          after_event_id: e1.event_id,
        });
        assert.deepEqual(
          got.map((e) => e.event_id),
          [e2.event_id, e3.event_id],
        );
      },
    );

    await testCase(
      "PF4 limit e poll avançam cursor sem pular história",
      async () => {
        const first = await feed.poll(null, 2);
        assert.deepEqual(
          first.events.map((e) => e.event_id),
          [e1.event_id, e2.event_id],
        );
        assert.equal(first.next_cursor, e2.event_id);

        const second = await feed.poll(first.next_cursor, 2);
        assert.deepEqual(
          second.events.map((e) => e.event_id),
          [e3.event_id],
        );
        assert.equal(second.next_cursor, e3.event_id);
      },
    );

    await testCase(
      "PF5 cursor inexistente falha fechado",
      async () => {
        await assert.rejects(
          () => feed.list({ after_event_id: "nao-existe-" + suffix }),
          EntregasFeedCursorNotFound,
        );
      },
    );

    await testCase(
      "PF6 leitor não consegue ler coluna alheia nem mutar outbox",
      async () => {
        async function denied(sql: string): Promise<string | null> {
          try {
            await banco!.cliente.transaction(async (tx) => {
              await tx.query("SET LOCAL ROLE " + READER);
              await tx.query(sql);
            });
            return null;
          } catch (e) {
            const code = (e as { code?: unknown } | null)?.code;
            return typeof code === "string" ? code : "erro_sem_sqlstate";
          }
        }
        for (const sql of [
          "SELECT unit_id FROM entregas.public_outbox LIMIT 1",
          "SELECT * FROM entregas.trip LIMIT 1",
          "UPDATE entregas.public_outbox SET status='published'",
          "DELETE FROM entregas.public_outbox",
          "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) VALUES ('x','x','x','x','{}','pending',now())",
        ]) {
          assert.equal(
            await denied(sql),
            "42501",
            "comando deveria ser recusado por privilégio insuficiente: " + sql,
          );
        }
      },
    );

    await testCase(
      "PF7 envelope inválido na outbox não atravessa o feed",
      async () => {
        const badId = "feed-bad-" + suffix;
        await banco!.cliente.query(
          `INSERT INTO entregas.public_outbox
            (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,created_at)
           VALUES ($1,'ITAIM',$2,$3,$4::jsonb,'pending',0,now())`,
          [
            "out:" + badId,
            badId,
            "idem:" + badId,
            JSON.stringify({ event_id: badId }),
          ],
        );
        await assert.rejects(
          () => feed.list({ after_event_id: e3.event_id }),
          PgEntregasFeedInvalidEvent,
        );
        await banco!.cliente.query(
          "DELETE FROM entregas.public_outbox WHERE event_id=$1",
          [badId],
        );
      },
    );

    await testCase(
      "PF8 event_id relacional divergente do JSON não atravessa",
      async () => {
        const rowId = "feed-row-mismatch-" + suffix;
        const payload = event(
          "feed-json-mismatch-" + suffix,
          "ITAIM",
          "trip_created",
          "2026-10-04T18:03:00.000Z",
        );
        await banco!.cliente.query(
          `INSERT INTO entregas.public_outbox
            (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,created_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,'pending',0,$6::timestamptz)`,
          [
            "out:" + rowId,
            payload.unit_id,
            rowId,
            "idem:" + rowId,
            JSON.stringify(payload),
            payload.recorded_at,
          ],
        );
        await assert.rejects(
          () => feed.list({ after_event_id: e3.event_id }),
          PgEntregasFeedIdentityMismatch,
        );
      },
    );
  } finally {
    if (banco) await banco.descartar().catch(() => undefined);
    if (PG_URL) {
      const admin = await createPgClient({
        url: urlCom(PG_URL, "postgres"),
        max: 1,
      });
      try {
        await admin.query("DROP ROLE IF EXISTS " + READER);
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

  console.log("\nPG_ENTREGAS_EVENT_FEED: " + passed + "/8 PASS");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
