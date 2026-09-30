/**
 * Prova PostgreSQL do papel mínimo de source-ingest.
 *
 * Usa SET LOCAL ROLE dentro de banco isolado. Assim mede os privilégios
 * efetivos do papel sem depender de senha/pg_hba e sem ativar serviço.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado, urlCom, type BancoIsolado } from "./banco-isolado";
import { ingerir } from "./ingest/ingest-service";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import { createPgClient } from "./persistence/sql-client";

const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const ROOT = process.cwd();

let passed = 0;
const failures: string[] = [];

async function testCase(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(
      name + ": " + (e instanceof Error ? e.message : String(e)),
    );
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

async function main(): Promise<void> {
  console.log("\n=== SOURCE INGEST — PAPEL MÍNIMO POSTGRESQL ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — papel mínimo NÃO foi provado.",
    );
    return;
  }

  let banco: BancoIsolado | null = null;
  const suffix =
    process.pid.toString(36) +
    "_" +
    Date.now().toString(36).slice(-7);
  const CRIT = ident("srcgate_crit_" + suffix);
  const ASY = ident("srcgate_async_" + suffix);
  const SRC = ident("srcgate_source_" + suffix);
  const roles = [CRIT, ASY, SRC];

  try {
    banco = await bancoIsolado(
      PG_URL,
      undefined,
      "source_ingest_role",
    );

    const sql = readFileSync(
      join(ROOT, "deploy/sql/papeis_minimos.sql"),
      "utf8",
    )
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", SRC);

    await banco.cliente.query(sql);

    await testCase(
      "SR1 papel não é superuser, owner, createrole nem createdb",
      async () => {
        const r = await banco!.cliente.query<{
          rolsuper: boolean;
          rolcreaterole: boolean;
          rolcreatedb: boolean;
        }>(
          "SELECT rolsuper, rolcreaterole, rolcreatedb " +
            "FROM pg_roles WHERE rolname=$1",
          [SRC],
        );
        assert.deepEqual(r[0], {
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
        });

        const owner = await banco!.cliente.query<{ tableowner: string }>(
          "SELECT tableowner FROM pg_tables " +
            "WHERE schemaname='platform' AND tablename='event_log'",
        );
        assert.notEqual(owner[0]?.tableowner, SRC);
      },
    );

    await testCase(
      "SR2 grants são somente USAGE + INSERT nos dois destinos",
      async () => {
        const r = await banco!.cliente.query<{
          schema_usage: boolean;
          event_insert: boolean;
          event_select: boolean;
          event_update: boolean;
          outbox_insert: boolean;
          outbox_select: boolean;
          job_insert: boolean;
        }>(
          "SELECT " +
            "has_schema_privilege($1,'platform','USAGE') AS schema_usage," +
            "has_table_privilege($1,'platform.event_log','INSERT') AS event_insert," +
            "has_table_privilege($1,'platform.event_log','SELECT') AS event_select," +
            "has_table_privilege($1,'platform.event_log','UPDATE') AS event_update," +
            "has_table_privilege($1,'platform.outbox','INSERT') AS outbox_insert," +
            "has_table_privilege($1,'platform.outbox','SELECT') AS outbox_select," +
            "has_table_privilege($1,'platform.job','INSERT') AS job_insert",
          [SRC],
        );
        assert.deepEqual(r[0], {
          schema_usage: true,
          event_insert: true,
          event_select: false,
          event_update: false,
          outbox_insert: true,
          outbox_select: false,
          job_insert: false,
        });
      },
    );

    const roleWriter = new PgTransactionalWriter({
      transaction: async <T>(
        fn: Parameters<PgTransactionalWriter["commit"]>[0] extends never
          ? never
          : (tx: import("./persistence/sql-client").SqlClient) => Promise<T>,
      ): Promise<T> =>
        banco!.cliente.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE " + SRC);
          return fn(tx);
        }),
    } as ConstructorParameters<typeof PgTransactionalWriter>[0]);

    await testCase(
      "SR3 writer real grava 1 fato + 1 outbox sob o papel mínimo",
      async () => {
        const key = "source-role:" + suffix;
        const r = await ingerir(
          [
            {
              event_id: "source-role-event-" + suffix,
              event_type: "trip_started",
              event_version: "trip_started@1.0.0",
              unit_id: "ITAIM",
              trip_id: "source-role-trip-" + suffix,
              occurred_at: "2026-09-30T22:00:00.000Z",
              origin: "source",
              source_mode: "simulated",
              idempotency_key: key,
              correlation_id: "source-role-trip-" + suffix,
              payload: {},
            },
          ],
          {
            escritor: roleWriter,
            recebido_em: new Date("2026-09-30T22:00:01.000Z"),
          },
        );

        assert.equal(r.aceito, true, JSON.stringify(r));
        assert.equal(r.gravados, 1);
        assert.equal(r.mensagens, 1);

        const fact = await banco!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.event_log " +
            "WHERE idempotency_key=$1",
          [key],
        );
        const msg = await banco!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.outbox " +
            "WHERE idempotency_key=$1",
          [key],
        );
        assert.equal(Number(fact[0]?.n), 1);
        assert.equal(Number(msg[0]?.n), 1);
      },
    );

    async function denied(sql: string): Promise<string> {
      try {
        await banco!.cliente.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE " + SRC);
          await tx.query(sql);
        });
        return "";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }

    await testCase(
      "SR4 leitura, mutação, DDL e tabelas alheias são recusadas",
      async () => {
        for (const sql of [
          "SELECT event_id FROM platform.event_log LIMIT 1",
          "SELECT outbox_id FROM platform.outbox LIMIT 1",
          "UPDATE platform.event_log SET event_type='x'",
          "DELETE FROM platform.event_log",
          "TRUNCATE platform.event_log",
          "ALTER TABLE platform.event_log DISABLE TRIGGER ALL",
          "SELECT * FROM identity.device",
          "INSERT INTO platform.job(job_id) VALUES ('source-intruso')",
          "INSERT INTO platform.audit(actor_id,action,object_type,object_id,granted,at) " +
            "VALUES ('x','x','x','x',true,now())",
          "SELECT * FROM platform.schema_migration",
        ]) {
          const msg = await denied(sql);
          assert.match(
            msg,
            /permission denied|must be owner/,
            "comando indevidamente permitido: " + sql,
          );
        }
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

  console.log(
    "\nSOURCE_INGEST_ROLE_PG: " + passed + "/4 PASS",
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
