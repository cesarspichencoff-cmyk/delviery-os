/**
 * APPEND-ONLY DO EVENT LOG — contra UPDATE, DELETE e TRUNCATE.
 * ============================================================================
 * `platform.event_log` promete ser append-only (L3), e a Q-016 fez dele a
 * fonte que governa a reconstrução da Operação Viva. A promessa vivia numa
 * trigger da 0001:
 *
 *   BEFORE UPDATE OR DELETE ON platform.event_log FOR EACH ROW
 *
 * `TRUNCATE` não dispara trigger de linha. A proteção cobria editar e apagar
 * linha a linha — e deixava apagar TUDO de uma vez, sem erro.
 *
 * FASE 1 — O BURACO, REPRODUZIDO ANTES DE FECHAR
 * ----------------------------------------------
 * Num banco ISOLADO com as migrations oficiais até a 0003 — o schema que
 * existia até esta missão —, pelo runner real:
 *
 *   A0  o canal executa SQL, e o banco está exatamente na 0003;
 *   A1  havia linhas: três fatos válidos entram;
 *   A2  UPDATE é recusado pela trava, e a linha não muda;
 *   A3  DELETE é recusado pela trava, e as três continuam lá;
 *   A4  O BURACO: TRUNCATE passa sem erro, e a tabela fica vazia.
 *
 * A1 e A0 são o que dá sentido a A4: sem linhas antes, "ficou vazia" não
 * prova nada; sem canal que executa, "não deu erro" também não.
 *
 * Esta seção fica aqui depois da correção, de propósito: é o controle
 * positivo de tudo que vier depois. A mesma operação, pelo mesmo cliente,
 * contra o schema que não tem a correção — se a recusa posterior não vier da
 * correção, este bloco é que muda.
 *
 * FASES 2 E 3 — A 0004, E A PROTEÇÃO EXECUTADA
 * --------------------------------------------
 * A 0004 põe `BEFORE TRUNCATE ... FOR EACH STATEMENT` na MESMA função da
 * 0001. Tudo abaixo EXECUTA a operação; o catálogo só confirma o que a
 * execução já provou (uma trigger no catálogo sem a função certa por trás não
 * protege nada):
 *
 *   D0  o banco está na última migration, e a trava nova é de COMANDO;
 *   D1  INSERT válido continua permitido;
 *   D2  UPDATE recusado · D3 DELETE recusado · D4 TRUNCATE recusado;
 *   D5  as variantes de TRUNCATE — ONLY, CASCADE, RESTART IDENTITY — também;
 *   D6  TRUNCATE de várias tabelas com o log no meio é recusado INTEIRO: a
 *       outra tabela não perde linha nenhuma;
 *   D7  é a mesma regra: a mesma função recusa as três, citando cada uma;
 *   D8  a 0004 entra por cima de um banco que já existia — histórico sem
 *       modo, fatos com modo — sem tocar em linha nenhuma;
 *   D9  a 0004 roda de novo sem erro, e continua uma trava só;
 *   D10 o PostgreSQL recusa a forma de LINHA para TRUNCATE — por isso a
 *       trava é de comando, e não uma extensão da da 0001.
 *
 * Depois de backup e restauração, as mesmas proteções são executadas no banco
 * restaurado por `run-backup-restore-tests.ts`.
 *
 * Nunca toca o banco compartilhado: exige `DELIVERYOS_PG_URL` só para chegar
 * ao SERVIDOR, e cria (e apaga) bancos próprios (`banco-isolado.ts`). Sem a
 * variável, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado, migrationsAte, type BancoIsolado } from "./banco-isolado";
import { diretorioDeMigrations } from "./migrations/localizar";
import { loadMigrations, runMigrations } from "./migrations/runner";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
/** O schema que existia antes desta missão. */
const ATE_0003 = "0003_event_log_source_mode";
/** A migration sob prova. Se mudar de nome, este gate TEM de quebrar. */
const MIGRATION_0004 = "0004_event_log_sem_truncate";
const TODAS = (): string[] => loadMigrations(diretorioDeMigrations()).map((m) => m.version);

console.log("\n=== APPEND-ONLY DO EVENT LOG ===\n");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum banco foi exercitado.");
  process.exit(0);
}

let passaram = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* ------------------------------------------------------------------ *
 * Operações — executadas, nunca inferidas do catálogo
 * ------------------------------------------------------------------ */

/** Fatos válidos, com modo declarado (`simulated`: nada aqui é da rua). */
async function inserirFatos(b: BancoIsolado, prefixo: string, n: number): Promise<void> {
  for (let i = 1; i <= n; i += 1) {
    await b.cliente.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
          payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
       VALUES ($1, 'AO-U', 'trip', 't-ao', 'trip_created', $2::jsonb, $3, 'system', $4,
               'trip_created@1.0.0', 'simulated')`,
      [`ev-${prefixo}-${i}`, JSON.stringify({ n: i }), `2026-09-23T10:0${i}:00Z`, `k-${prefixo}-${i}`],
    );
  }
}

async function linhas(b: BancoIsolado): Promise<number> {
  const r = await b.cliente.query<{ n: string }>(`SELECT count(*) AS n FROM platform.event_log`);
  return Number(r[0].n);
}

/** Executa e devolve a mensagem do erro — ou `null` se o banco ACEITOU. */
async function tentar(b: BancoIsolado, sql: string): Promise<string | null> {
  try {
    await b.cliente.query(sql);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Tudo do log, em ordem estável — para provar "nenhuma linha tocada". */
async function conteudo(b: BancoIsolado): Promise<string> {
  const r = await b.cliente.query<{ h: string; n: string }>(
    `SELECT count(*) AS n, md5(coalesce(string_agg(
        event_id || '|' || event_type || '|' || payload::text || '|' || occurred_at::text || '|' ||
        coalesce(source_mode, '<NULL>'), E'\\n' ORDER BY event_id), '')) AS h
       FROM platform.event_log`,
  );
  return `${r[0].n}:${r[0].h}`;
}

async function versoes(b: BancoIsolado): Promise<string[]> {
  const r = await b.cliente.query<{ version: string }>(
    `SELECT version FROM platform.schema_migration WHERE version NOT LIKE 'probe:%' ORDER BY version`,
  );
  return r.map((x) => String(x.version));
}

/* ================================================================== */

void (async () => {
  console.log("1. ANTES — o schema ate a 0003, o que existia ate esta missao");
  const antes = await bancoIsolado(URL_SERVIDOR, ATE_0003, "ao");
  try {
    await teste("A0 o canal executa SQL, e o banco está exatamente na 0003", async () => {
      const r = await antes.cliente.query<{ canal: string }>(`SELECT 'canal_ok' AS canal`);
      assert.equal(r[0]?.canal, "canal_ok", "o canal não devolveu o que executou");
      assert.deepEqual(
        await versoes(antes),
        ["0001_platform_foundation", "0002_event_log_contexto_dispositivo", ATE_0003],
        "o banco de 'antes' não está na 0003 — a reprodução mediria outro schema",
      );
    });

    await teste("A1 havia linhas: três fatos válidos entram", async () => {
      await inserirFatos(antes, "antes", 3);
      assert.equal(await linhas(antes), 3);
    });

    await teste("A2 UPDATE é recusado pela trava, e a linha não muda", async () => {
      const erro = await tentar(antes, `UPDATE platform.event_log SET event_type = 'alterado'`);
      assert.match(String(erro), /append-only: UPDATE nao e permitido/, `UPDATE não foi recusado: ${String(erro)}`);
      const r = await antes.cliente.query<{ t: string }>(
        `SELECT DISTINCT event_type AS t FROM platform.event_log`,
      );
      assert.deepEqual(r.map((x) => x.t), ["trip_created"], "uma linha mudou");
    });

    await teste("A3 DELETE é recusado pela trava, e as três continuam lá", async () => {
      const erro = await tentar(antes, `DELETE FROM platform.event_log`);
      assert.match(String(erro), /append-only: DELETE nao e permitido/, `DELETE não foi recusado: ${String(erro)}`);
      assert.equal(await linhas(antes), 3);
    });

    await teste("A4 O BURACO: TRUNCATE passa sem erro, e a tabela fica vazia", async () => {
      const erro = await tentar(antes, `TRUNCATE platform.event_log`);
      assert.equal(erro, null, `TRUNCATE foi recusado no schema antigo — o buraco não é o descrito: ${String(erro)}`);
      assert.equal(await linhas(antes), 0, "TRUNCATE aceito, mas as linhas ficaram");
    });
  } finally {
    await antes.descartar();
  }

  /* ---------------------------------------------------------------- *
   * DEPOIS — todas as migrations, com a 0004
   * ---------------------------------------------------------------- */
  console.log("\n2. DEPOIS — todas as migrations, com a 0004");
  const depois = await bancoIsolado(URL_SERVIDOR, undefined, "ao");
  const recusas: Record<string, string> = {};
  try {
    await teste("D0 o banco está na última migration, e a trava nova é de COMANDO, na função da 0001", async () => {
      assert.deepEqual(await versoes(depois), TODAS(), "o banco de 'depois' não está na última migration");
      assert.ok(TODAS().includes(MIGRATION_0004), `a ${MIGRATION_0004} não está no repositório`);
      const t = await depois.cliente.query<{ nivel: string; quando: string; funcao: string }>(
        `SELECT CASE WHEN tgtype & 1 = 1 THEN 'linha' ELSE 'comando' END AS nivel,
                CASE WHEN tgtype & 2 = 2 THEN 'before' ELSE 'after' END AS quando,
                tgfoid::regproc::text AS funcao
           FROM pg_trigger WHERE tgrelid = 'platform.event_log'::regclass AND tgname = 'event_log_sem_truncate'`,
      );
      assert.deepEqual(t, [{ nivel: "comando", quando: "before", funcao: "platform.impedir_mutacao_event_log" }]);
    });

    await teste("D1 INSERT válido continua permitido", async () => {
      await inserirFatos(depois, "depois", 3);
      assert.equal(await linhas(depois), 3);
    });

    await teste("D2 UPDATE recusado, e a linha não muda", async () => {
      const erro = await tentar(depois, `UPDATE platform.event_log SET source_mode = 'real'`);
      assert.match(String(erro), /append-only: UPDATE nao e permitido/, `UPDATE passou: ${String(erro)}`);
      recusas.UPDATE = String(erro);
      const r = await depois.cliente.query<{ m: string }>(`SELECT DISTINCT source_mode AS m FROM platform.event_log`);
      assert.deepEqual(r.map((x) => x.m), ["simulated"]);
    });

    await teste("D3 DELETE recusado, e as três continuam", async () => {
      const erro = await tentar(depois, `DELETE FROM platform.event_log`);
      assert.match(String(erro), /append-only: DELETE nao e permitido/, `DELETE passou: ${String(erro)}`);
      recusas.DELETE = String(erro);
      assert.equal(await linhas(depois), 3);
    });

    await teste("D4 TRUNCATE recusado, e as três continuam", async () => {
      const erro = await tentar(depois, `TRUNCATE platform.event_log`);
      assert.match(String(erro), /append-only: TRUNCATE nao e permitido/, `TRUNCATE passou: ${String(erro)}`);
      recusas.TRUNCATE = String(erro);
      assert.equal(await linhas(depois), 3);
    });

    await teste("D5 as variantes de TRUNCATE também: ONLY, TABLE, CASCADE, RESTART IDENTITY", async () => {
      for (const sql of [
        `TRUNCATE ONLY platform.event_log`,
        `TRUNCATE TABLE platform.event_log`,
        `TRUNCATE platform.event_log CASCADE`,
        `TRUNCATE platform.event_log RESTART IDENTITY`,
      ]) {
        const erro = await tentar(depois, sql);
        assert.match(String(erro), /append-only: TRUNCATE nao e permitido/, `${sql} passou: ${String(erro)}`);
      }
      assert.equal(await linhas(depois), 3);
    });

    await teste("D6 TRUNCATE de várias tabelas com o log no meio é recusado INTEIRO", async () => {
      for (const id of ["o-ao-1", "o-ao-2"]) {
        await depois.cliente.query(
          `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key)
           VALUES ($1, 'entregas', 'trip_created', '{}'::jsonb, $2)`,
          [id, `ik-${id}`],
        );
      }
      const erro = await tentar(depois, `TRUNCATE platform.outbox, platform.event_log`);
      assert.match(String(erro), /append-only: TRUNCATE nao e permitido/, `passou: ${String(erro)}`);
      const r = await depois.cliente.query<{ n: string }>(`SELECT count(*) AS n FROM platform.outbox`);
      assert.equal(Number(r[0].n), 2, "a outra tabela foi esvaziada mesmo com o comando recusado");
      assert.equal(await linhas(depois), 3);
    });

    await teste("D7 é a MESMA regra: a mesma função recusa as três operações, citando cada uma", async () => {
      assert.deepEqual(Object.keys(recusas).sort(), ["DELETE", "TRUNCATE", "UPDATE"]);
      for (const [op, msg] of Object.entries(recusas)) {
        assert.match(msg, new RegExp(`^event_log e append-only: ${op} nao e permitido$`), `mensagem fora da regra: ${msg}`);
      }
      const f = await depois.cliente.query<{ n: string }>(
        `SELECT count(DISTINCT tgfoid) AS n FROM pg_trigger
          WHERE tgrelid = 'platform.event_log'::regclass AND NOT tgisinternal`,
      );
      assert.equal(Number(f[0].n), 1, "as travas do event log usam funções diferentes");
    });
  } finally {
    await depois.descartar();
  }

  /* ---------------------------------------------------------------- *
   * A 0004 sobre um banco que já existia
   * ---------------------------------------------------------------- */
  console.log("\n3. A 0004 SOBRE UM BANCO QUE JA EXISTIA — historico sem modo, fatos com modo");
  const legado = await bancoIsolado(URL_SERVIDOR, "0002_event_log_contexto_dispositivo", "ao");
  try {
    let antesDa0004 = "";

    await teste("D8 a 0004 entra por cima de histórico sem tocar em linha nenhuma — e fecha o TRUNCATE", async () => {
      for (const i of [1, 2]) {
        await legado.cliente.query(
          `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
              payload, occurred_at, origin, idempotency_key, contract_version)
           VALUES ($1, 'AO-H', 'trip', 't-h', 'trip_created', '{}'::jsonb, '2026-08-01T10:00:00Z',
                   'system', $2, 'trip_created@1.0.0')`,
          [`ev-hist-${i}`, `k-hist-${i}`],
        );
      }
      // Até a 0003, pelo runner real, e fatos com modo por cima.
      const parcial = migrationsAte(ATE_0003);
      try {
        const m = await runMigrations(legado.cliente, parcial);
        assert.deepEqual(m.applied, [ATE_0003]);
      } finally {
        rmSync(parcial, { recursive: true, force: true });
      }
      await inserirFatos(legado, "legado", 2);
      antesDa0004 = await conteudo(legado);

      const aplicadas = await legado.migrarTudo();
      assert.deepEqual(aplicadas, TODAS().filter((v) => v > ATE_0003), "o runner não aplicou o que faltava");
      assert.ok(aplicadas.includes(MIGRATION_0004));
      assert.equal(await conteudo(legado), antesDa0004, "a 0004 mexeu em linha do log");
      const nulos = await legado.cliente.query<{ n: string }>(
        `SELECT count(*) AS n FROM platform.event_log WHERE source_mode IS NULL`,
      );
      assert.equal(Number(nulos[0].n), 2, "o histórico sem modo não ficou NULL");
      const erro = await tentar(legado, `TRUNCATE platform.event_log`);
      assert.match(String(erro), /append-only: TRUNCATE nao e permitido/);
      assert.equal(await conteudo(legado), antesDa0004);
    });

    await teste("D9 a 0004 roda de novo sem erro, continua UMA trava, e continua recusando", async () => {
      const texto = readFileSync(join(diretorioDeMigrations(), `${MIGRATION_0004}.sql`), "utf8");
      for (let i = 0; i < 2; i += 1) await legado.cliente.query(texto);
      const n = await legado.cliente.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_trigger
          WHERE tgrelid = 'platform.event_log'::regclass AND tgname = 'event_log_sem_truncate'`,
      );
      assert.equal(Number(n[0].n), 1);
      assert.match(String(await tentar(legado, `TRUNCATE platform.event_log`)), /TRUNCATE nao e permitido/);
      assert.equal(await conteudo(legado), antesDa0004);
    });

    await teste("D10 o PostgreSQL recusa trava de LINHA para TRUNCATE — por isso ela é de comando", async () => {
      const erro = await tentar(
        legado,
        `CREATE TRIGGER ao_forma_de_linha BEFORE TRUNCATE ON platform.event_log
           FOR EACH ROW EXECUTE FUNCTION platform.impedir_mutacao_event_log()`,
      );
      assert.match(String(erro), /TRUNCATE FOR EACH ROW triggers are not supported/, `aceitou: ${String(erro)}`);
    });
  } finally {
    await legado.descartar();
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas contra PostgreSQL real, em bancos isolados`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nAPPEND_ONLY_RED");
    process.exit(1);
  }
  console.log("\nAPPEND_ONLY_GREEN");
})().catch((e: unknown) => {
  console.error("falha ao executar a suíte de append-only:", e);
  process.exit(1);
});
