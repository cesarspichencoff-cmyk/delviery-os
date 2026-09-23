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
 * FASE 8 — A FRONTEIRA DE PRIVILÉGIO, MEDIDA
 * ------------------------------------------
 * Trigger é contrato do banco, não cofre. Quem é DONO da tabela, ou
 * superusuário, pode desligá-la. A pergunta honesta é: a partir de que
 * privilégio?
 *
 *   F0  quem roda estas provas, e quem é dono do event log;
 *   F1  um papel NÃO dono com TODO privilégio de escrita no log — SELECT,
 *       INSERT, UPDATE, DELETE, TRUNCATE — insere, e só: as três mutações são
 *       recusadas pela trava. Privilégio concedido não basta;
 *   F2  esse papel também não DESLIGA a trava: DISABLE TRIGGER, DROP
 *       TRIGGER, DROP TABLE e `session_replication_role = replica` recusados;
 *   F3  o DONO/superusuário consegue — medido dentro de transação desfeita:
 *       DISABLE TRIGGER USER, e `session_replication_role = replica`, deixam o
 *       TRUNCATE passar. Isso é administração, não caminho operacional, e fica
 *       declarado como o limite desta garantia.
 *
 * O papel é global no servidor: nasce com nome único por `CREATE ROLE` (que
 * falha se já existir) e só é apagado se foi criado aqui.
 *
 * Nunca toca o banco compartilhado: exige `DELIVERYOS_PG_URL` só para chegar
 * ao SERVIDOR, e cria (e apaga) bancos próprios (`banco-isolado.ts`). Sem a
 * variável, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado, migrationsAte, urlCom, type BancoIsolado } from "./banco-isolado";
import { createPgClient } from "./persistence/sql-client";
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

  /* ---------------------------------------------------------------- *
   * A fronteira de privilégio
   * ---------------------------------------------------------------- */
  console.log("\n4. FRONTEIRA DE PRIVILEGIO — o que o banco garante, e para quem");
  const priv = await bancoIsolado(URL_SERVIDOR, undefined, "ao");
  const papel = `ao_app_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  let papelCriado = false;
  /** Executa como o papel NÃO dono, na mesma conexão, e devolve o erro ou null. */
  const comoPapel = async (sql: string): Promise<string | null> => {
    try {
      await priv.cliente.transaction(async (tx) => {
        await tx.query(`SET LOCAL ROLE ${papel}`);
        await tx.query(sql);
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  class Desfazer extends Error {}
  /** Executa como o dono, mede dentro, e DESFAZ — a sabotagem não fica. */
  const comoDonoDesfeito = async (comandos: string[]): Promise<{ erro: string | null; linhasDentro: number }> => {
    let linhasDentro = -1;
    try {
      await priv.cliente.transaction(async (tx) => {
        for (const c of comandos) await tx.query(c);
        const r = await tx.query<{ n: string }>(`SELECT count(*) AS n FROM platform.event_log`);
        linhasDentro = Number(r[0].n);
        throw new Desfazer("desfazer");
      });
      return { erro: null, linhasDentro };
    } catch (e) {
      if (e instanceof Desfazer) return { erro: null, linhasDentro };
      return { erro: e instanceof Error ? e.message : String(e), linhasDentro };
    }
  };

  try {
    await inserirFatos(priv, "priv", 2);

    await teste("F0 quem roda estas provas é superusuário, e é o dono do event log", async () => {
      const r = await priv.cliente.query<{ eu: string; super: boolean; dono: string }>(
        `SELECT current_user AS eu, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super,
                (SELECT tableowner FROM pg_tables WHERE schemaname = 'platform' AND tablename = 'event_log') AS dono`,
      );
      assert.equal(r[0].super, true, "as provas de F3 exigem o dono/superusuário");
      assert.equal(r[0].dono, r[0].eu, "o dono do log não é quem migrou");
    });

    await teste("F1 papel NÃO dono com todo privilégio de escrita: INSERT passa, UPDATE/DELETE/TRUNCATE recusados pela trava", async () => {
      await priv.cliente.query(`CREATE ROLE ${papel} NOLOGIN`);
      papelCriado = true;
      await priv.cliente.query(`GRANT USAGE ON SCHEMA platform TO ${papel}`);
      await priv.cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON platform.event_log TO ${papel}`);
      const insert = await comoPapel(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
            occurred_at, origin, idempotency_key, contract_version, source_mode)
         VALUES ('ev-papel', 'AO-U', 'trip', 't-ao', 'trip_created', '{}'::jsonb, now(), 'system',
                 'k-papel', 'trip_created@1.0.0', 'simulated')`,
      );
      assert.equal(insert, null, `o papel não conseguiu nem inserir — a prova não mede a trava: ${String(insert)}`);
      assert.equal(await linhas(priv), 3);
      for (const [op, sql] of [
        ["UPDATE", `UPDATE platform.event_log SET source_mode = 'real'`],
        ["DELETE", `DELETE FROM platform.event_log`],
        ["TRUNCATE", `TRUNCATE platform.event_log`],
      ] as const) {
        const erro = await comoPapel(sql);
        assert.match(String(erro), new RegExp(`append-only: ${op} nao e permitido`), `${op} do papel: ${String(erro)}`);
      }
      assert.equal(await linhas(priv), 3);
    });

    await teste("F2 o papel NÃO dono não desliga nem derruba a trava", async () => {
      for (const sql of [
        `ALTER TABLE platform.event_log DISABLE TRIGGER event_log_sem_truncate`,
        `ALTER TABLE platform.event_log DISABLE TRIGGER ALL`,
        `DROP TRIGGER event_log_sem_truncate ON platform.event_log`,
        `DROP TABLE platform.event_log`,
      ]) {
        const erro = await comoPapel(sql);
        // "table" ou "relation", conforme o comando — a recusa é a mesma: não é o dono.
        assert.match(String(erro), /must be owner of (table|relation) event_log/, `${sql}: ${String(erro)}`);
      }
      const replica = await comoPapel(`SET session_replication_role = replica`);
      assert.match(String(replica), /permission denied to set parameter "session_replication_role"/, String(replica));
      assert.match(String(await tentar(priv, `TRUNCATE platform.event_log`)), /TRUNCATE nao e permitido/);
      assert.equal(await linhas(priv), 3);
    });

    await teste("F3 o DONO/superusuário ainda consegue sabotar — medido e DESFEITO", async () => {
      const desliga = await comoDonoDesfeito([
        `ALTER TABLE platform.event_log DISABLE TRIGGER USER`,
        `TRUNCATE platform.event_log`,
      ]);
      assert.deepEqual(desliga, { erro: null, linhasDentro: 0 }, "o dono NÃO conseguiu — então o limite declarado está errado");
      const replica = await comoDonoDesfeito([
        `SET LOCAL session_replication_role = replica`,
        `TRUNCATE platform.event_log`,
      ]);
      assert.deepEqual(replica, { erro: null, linhasDentro: 0 }, "replica não desligou a trava");
      // Desfeito: nada ficou.
      assert.equal(await linhas(priv), 3);
      assert.match(String(await tentar(priv, `TRUNCATE platform.event_log`)), /TRUNCATE nao e permitido/);
    });
  } finally {
    await priv.descartar();
    if (papelCriado) {
      // Depois do banco: as concessões moram nele, e o papel só cai sem elas.
      const admin = await createPgClient({ url: urlCom(URL_SERVIDOR, "postgres"), max: 1 });
      try {
        await admin.query(`DROP ROLE IF EXISTS ${papel}`);
      } finally {
        await admin.close();
      }
    }
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
