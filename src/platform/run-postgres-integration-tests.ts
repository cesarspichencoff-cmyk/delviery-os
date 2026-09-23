/**
 * Integração com PostgreSQL REAL.
 *
 * Roda contra um servidor de verdade, indicado por `DELIVERYOS_PG_URL`. Sem a
 * variável, o teste se declara PULADO e sai com sucesso — assim a suíte
 * continua executável em máquina sem banco, sem que a ausência vire um verde
 * enganoso: a saída diz, com todas as letras, que não rodou.
 *
 * O que só aqui pode ser provado, e por isso este arquivo existe:
 *
 *  - a migration aplica de verdade num Postgres real;
 *  - o event log é append-only por TRIGGER — UPDATE e DELETE são rejeitados
 *    pelo banco, não pela boa vontade de quem escreve o código;
 *  - a unicidade de idempotência é do índice, não de um `if` em TypeScript;
 *  - o claim da outbox é atômico sob CONCORRÊNCIA REAL, com dois clientes
 *    simultâneos disputando as mesmas linhas. Isso é o que `FOR UPDATE SKIP
 *    LOCKED` compra, e é impossível de provar em memória num runtime de uma
 *    thread só.
 *
 * Sem dependência de `pg`: usa o `psql` do próprio PostgreSQL, que existe em
 * qualquer lugar onde exista um servidor para testar.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoVazio } from "./banco-isolado";

const PG_URL = process.env.DELIVERYOS_PG_URL;
const PSQL = process.env.DELIVERYOS_PSQL || "psql";

if (!PG_URL) {
  console.log("=== Integração PostgreSQL ===");
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum banco foi testado.");
  console.log("Para rodar:  DELIVERYOS_PG_URL=postgres://user:senha@host:porta/base");
  process.exit(0);
}

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Argumentos de conexão.
 *
 * `-d` é obrigatório e não é estilo: passar a URL como argumento POSICIONAL
 * faz o psql do Windows ignorar em silêncio todas as flags seguintes — o `-c`
 * inclusive — conectando, não executando nada e saindo com código 0.
 *
 * `-q` silencia o rótulo do comando (`UPDATE 10`), que o psql imprime JUNTO
 * com as linhas do RETURNING mesmo em modo `-tA`. Sem isso o rótulo entra na
 * lista de resultados e finge ser uma linha de dado.
 */
/**
 * O banco que esta suíte exercita: VAZIO e dela (`bancoVazio`), criado no
 * começo e apagado no fim. Até 2026-09-23 era o próprio banco de
 * `DELIVERYOS_PG_URL` — a suíte apagava outbox, job, inbox e `entregas.*`
 * alheios para montar o fixture, e reaplicava migrations num banco já
 * migrado chamando isso de "banco limpo". Agora a URL serve só para chegar ao
 * servidor, e "banco limpo" é literal.
 */
let ALVO = "";
const CONN = (): string[] => ["-d", ALVO, "-tA", "-q"];

/** Executa SQL e devolve a saída. `expectError` inverte o critério. */
function sql(query: string, opts: { expectError?: boolean } = {}): string {
  try {
    const out = execFileSync(
      PSQL,
      [...CONN(), "-v", "ON_ERROR_STOP=1", "-c", query],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (opts.expectError) throw new Error(`esperava erro, mas passou: ${query.slice(0, 60)}`);
    return out.trim();
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const texto = err.stderr || err.message || String(e);
    if (opts.expectError) return texto;
    throw new Error(texto.split("\n").slice(0, 2).join(" | "));
  }
}

function file(rel: string): string {
  const p = join(process.cwd(), rel);
  assert.ok(existsSync(p), `ausente: ${rel}`);
  return readFileSync(p, "utf8");
}

/**
 * Espera bloqueante de verdade.
 *
 * `Atomics.wait` para a thread sem ocupar CPU e sem depender do laço de
 * eventos — necessário porque o processo concorrente é observado pelo disco,
 * e não por callbacks que só rodariam se esta thread estivesse livre.
 */
function esperarAte(cond: () => boolean, timeoutMs: number, mensagem: string): void {
  const limite = Date.now() + timeoutMs;
  const sinal = new Int32Array(new SharedArrayBuffer(4));
  while (!cond()) {
    if (Date.now() > limite) throw new Error(`${mensagem} (após ${timeoutMs}ms)`);
    Atomics.wait(sinal, 0, 0, 50);
  }
}

/** Extrai só os identificadores de outbox da saída, ignorando marcas. */
function linhasDeIds(saida: string): string[] {
  return saida
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^o-\d+$/.test(l));
}


/** Tudo que esta suíte afirma, contra o banco `ALVO`. */
function provas(): void {

  /**
   * Preflight — o teste tem que provar que consegue executar SQL antes de
   * afirmar qualquer coisa sobre o banco.
   *
   * Não é zelo abstrato: na primeira execução deste arquivo o `psql` do Windows
   * recebeu a URL como argumento POSICIONAL e ignorou silenciosamente todas as
   * flags depois dela — incluindo o `-c`. Conectava, não rodava nada, saía com
   * código 0. Um conjunto de asserções mais frouxo teria ficado verde sem tocar
   * no banco uma vez sequer. Este bloco torna esse cenário impossível: se o
   * canal não devolve o valor combinado, o processo morre aqui.
   */
  {
    const eco = sql("select 'canal_ok'");
    if (eco !== "canal_ok") {
      // Lança em vez de sair: sair aqui pularia a limpeza do banco da suíte.
      throw new Error(
        `FALHA DE PREFLIGHT: o canal com o psql não executa SQL (recebido: ${JSON.stringify(eco)}).\n` +
          "Nenhum teste rodou. Não interprete esta saída como banco aprovado.",
      );
    }
  }

  /* ------------------------------------------------------------------ *
   * Migration
   * ------------------------------------------------------------------ */

  /**
   * TODAS as migrations, em ordem — não só a 0001.
   *
   * Aplicar só a fundação bastava enquanto nenhuma migration posterior mudava
   * o que os testes abaixo escrevem. Desde a 0003 o banco exige `source_mode` em
   * fato novo; um banco limpo com só a 0001 não teria a coluna, e um banco
   * compartilhado já migrado recusaria insert sem ela. "O schema" é a soma das
   * migrations, e é contra ele que estas invariantes precisam valer.
   */
  function aplicarTodasAsMigrations(): void {
    const dir = "src/platform/migrations";
    for (const f of readdirSync(dir).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
      execFileSync(
        PSQL,
        ["-d", ALVO, "-v", "ON_ERROR_STOP=1", "-f", `${dir}/${f}`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    }
  }

  test("a migration aplica sem erro num banco limpo", () => {
    // Idempotente por construção (IF NOT EXISTS / OR REPLACE): reaplicar é
    // exatamente o que acontece num redeploy.
    aplicarTodasAsMigrations();
    const schemas = sql(
      `select count(*) from pg_namespace where nspname in
       ('platform','identity','entregas','sources','orders','crm','copiloto')`,
    );
    assert.equal(schemas, "7", "faltam schemas");
  });

  test("reaplicar a migration não quebra — redeploy é seguro", () => {
    aplicarTodasAsMigrations();
    assert.ok(true);
  });

  test("as tabelas da plataforma existem", () => {
    for (const t of ["platform.inbox", "platform.event_log", "platform.outbox", "platform.job"]) {
      const [schema, nome] = t.split(".");
      const n = sql(
        `select count(*) from information_schema.tables
         where table_schema='${schema}' and table_name='${nome}'`,
      );
      assert.equal(n, "1", `tabela ausente: ${t}`);
    }
  });

  /* ------------------------------------------------------------------ *
   * Fixtures
   * ------------------------------------------------------------------ */

  // Nenhum DELETE de preparação: o banco nasceu vazio e é só desta suíte.
  sql(`insert into identity.unit(unit_id,display_name) values ('ITAIM','TATA Itaim')
       on conflict (unit_id) do nothing`);
  sql(`insert into entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version)
       values ('t-pg','ITAIM','rid-1','em_rota','ops','2026-07-26T12:00:00Z','COR@1.0.3')
       on conflict (trip_id) do nothing`);

  /* ------------------------------------------------------------------ *
   * Invariantes que só o banco garante
   * ------------------------------------------------------------------ */

  // Os fatos abaixo carregam um modo VÁLIDO (`simulated`, dado sintético) de
  // propósito. Desde a 0003 o CHECK de modo roda antes de trigger, índice único e
  // outbox: um insert sem modo seria recusado pelo motivo errado, e cada teste
  // passaria a medir o CHECK em vez da invariante que o nome dele promete. Foi o
  // que a primeira execução pós-0003 mostrou — o DELETE "passou" porque o INSERT
  // de preparação nem tinha entrado.
  test("event log é append-only: UPDATE é rejeitado pelo banco", () => {
    sql(`insert into platform.event_log
         (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version,source_mode)
         values ('ev-pg','ITAIM','trip','t-pg','trip_created','{}','2026-07-26T12:00:00Z','device','k-pg','COR@1.0.3','simulated')
         on conflict do nothing`);
    const erro = sql(`update platform.event_log set event_type='alterado' where event_id='ev-pg'`, {
      expectError: true,
    });
    assert.match(erro, /append-only/);
    assert.equal(
      sql(`select event_type from platform.event_log where event_id='ev-pg'`),
      "trip_created",
      "o evento foi alterado",
    );
  });

  test("event log é append-only: DELETE é rejeitado pelo banco", () => {
    const erro = sql(`delete from platform.event_log where event_id='ev-pg'`, { expectError: true });
    assert.match(erro, /append-only/);
    assert.equal(sql(`select count(*) from platform.event_log where event_id='ev-pg'`), "1");
  });

  test("idempotency_key duplicada é rejeitada pelo índice", () => {
    const erro = sql(
      `insert into platform.event_log
       (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version,source_mode)
       values ('ev-outro','ITAIM','trip','t-pg','trip_created','{}','2026-07-26T12:00:00Z','device','k-pg','COR@1.0.3','simulated')`,
      { expectError: true },
    );
    assert.match(erro, /duplicate key|unique/i);
  });

  test("coordenada fora de faixa é rejeitada por CHECK", () => {
    const erro = sql(
      `insert into entregas.gps_point
       (point_id,idempotency_key,trip_id,device_id,latitude,longitude,accuracy_m,occurred_at,source,quality,clock_trust,schema_version)
       values ('p-ruim','gk-ruim','t-pg','d1',999,-46.6,12,'2026-07-26T12:00:00Z','device','good','trusted','gps@1.0.0')`,
      { expectError: true },
    );
    assert.match(erro, /gps_latitude_valida/);
  });

  test("accuracy negativa é rejeitada por CHECK", () => {
    const erro = sql(
      `insert into entregas.gps_point
       (point_id,idempotency_key,trip_id,device_id,latitude,longitude,accuracy_m,occurred_at,source,quality,clock_trust,schema_version)
       values ('p-neg','gk-neg','t-pg','d1',-23.5,-46.6,-1,'2026-07-26T12:00:00Z','device','good','trusted','gps@1.0.0')`,
      { expectError: true },
    );
    assert.match(erro, /gps_accuracy_valida/);
  });

  test("ponto de GPS repetido é rejeitado pela chave de idempotência", () => {
    const ins = `insert into entregas.gps_point
      (point_id,idempotency_key,trip_id,device_id,latitude,longitude,accuracy_m,occurred_at,source,quality,clock_trust,schema_version)
      values ('p-ok','gps:d1:t-pg:2026-07-26T12:00:00Z','t-pg','d1',-23.5,-46.6,12,'2026-07-26T12:00:00Z','device','good','trusted','gps@1.0.0')`;
    sql(ins);
    const erro = sql(ins.replace("'p-ok'", "'p-ok-2'"), { expectError: true });
    assert.match(erro, /duplicate key|unique/i);
    assert.equal(sql(`select count(*) from entregas.gps_point where trip_id='t-pg'`), "1");
  });

  test("inbox deduplica pela chave primária", () => {
    const ins = `insert into platform.inbox(idempotency_key,unit_id,source,kind,payload,occurred_at)
                 values ('inb-1','ITAIM','android','gps_point','{}','2026-07-26T12:00:00Z')`;
    sql(ins);
    const erro = sql(ins, { expectError: true });
    assert.match(erro, /duplicate key|unique/i);
  });

  test("estado inválido de outbox é rejeitado por CHECK", () => {
    const erro = sql(
      `insert into platform.outbox(outbox_id,stream,kind,payload,idempotency_key,state)
       values ('o-ruim','s','k','{}','ik','estado_inventado')`,
      { expectError: true },
    );
    assert.match(erro, /outbox_state_valido/);
  });

  /* ------------------------------------------------------------------ *
   * Concorrência real — o que memória não prova
   * ------------------------------------------------------------------ */

  test("claim sob concorrência real: worker lento não bloqueia nem duplica", () => {
    sql(`delete from platform.outbox`);
    for (let i = 0; i < 20; i += 1) {
      sql(
        `insert into platform.outbox(outbox_id,stream,kind,payload,idempotency_key)
         values ('o-${String(i).padStart(2, "0")}','entregas','trip_created','{}','ik-${i}')`,
      );
    }

    // `FOR UPDATE SKIP LOCKED` é a peça central: sem SKIP LOCKED o segundo
    // worker BLOQUEIA esperando o primeiro terminar; sem FOR UPDATE, os dois
    // leem as mesmas linhas e o efeito externo acontece duas vezes.
    //
    // Rodar os dois em sequência não prova nada disso — o primeiro já teria
    // confirmado. É preciso que o lento esteja com a transação ABERTA enquanto
    // o rápido tenta, e é isso que o teste monta.
    const claim = (worker: string, holdS: number) => `
      begin;
      with pego as (
        select outbox_id from platform.outbox
        where state='pending' and available_at <= now()
        order by created_at, outbox_id
        for update skip locked
        limit 10
      )
      update platform.outbox o set state='processing', locked_by='${worker}', locked_at=now()
      from pego where o.outbox_id = pego.outbox_id
      returning o.outbox_id;
      select pg_sleep(${holdS});
      commit;`;

    const APP_LENTO = "deliveryos-w-lento";
    const saidaLento = join(tmpdir(), `deliveryos-pg-lento-${process.pid}.txt`);
    const fd = openSync(saidaLento, "w");
    // `PGAPPNAME` identifica o backend lento no catálogo. Ele é a única forma
    // confiável de saber em que ponto o outro processo está: a saída do psql
    // redirecionada para arquivo fica BUFFERADA, e uma marca impressa no meio da
    // transação só aparece no disco quando o processo termina — quando os locks
    // já foram soltos. Sincronizar por ela fazia o teste passar mesmo sem
    // `SKIP LOCKED`, medindo um worker rápido que nunca disputou nada.
    const lento = spawn(PSQL, [...CONN(), "-c", claim("w-lento", 3)], {
      stdio: ["ignore", fd, fd],
      env: { ...process.env, PGAPPNAME: APP_LENTO },
    });

    /** Quantos backends do worker lento estão dormindo DEPOIS de travar as linhas. */
    const lentoSegurandoLocks = () =>
      sql(
        `select count(*) from pg_stat_activity
         where application_name = '${APP_LENTO}' and wait_event = 'PgSleep'`,
      ) !== "0";
    const lentoVivo = () =>
      sql(`select count(*) from pg_stat_activity where application_name = '${APP_LENTO}'`) !== "0";

    try {
      // `wait_event = 'PgSleep'` só acontece dentro do `pg_sleep`, que vem
      // DEPOIS do UPDATE: quando isto é verdade, as 10 linhas estão travadas e
      // a transação está aberta. É o instante exato em que o outro worker deve
      // tentar — e é o que faltava antes.
      esperarAte(lentoSegurandoLocks, 20_000, "o worker lento não chegou a segurar as linhas");

      const t0 = Date.now();
      const saidaRapido = execFileSync(PSQL, [...CONN(), "-c", claim("w-rapido", 0)], {
        encoding: "utf8",
      });
      const decorrido = Date.now() - t0;

      const idsRapido = linhasDeIds(saidaRapido);
      assert.equal(idsRapido.length, 10, `o worker rápido pegou ${idsRapido.length} de 10`);
      assert.ok(
        decorrido < 2000,
        `o worker rápido esperou ${decorrido}ms — travou atrás do lento em vez de pular as linhas`,
      );

      esperarAte(() => !lentoVivo(), 25_000, "o worker lento não terminou");
      const idsLento = linhasDeIds(readFileSync(saidaLento, "utf8"));

      const todos = [...idsLento, ...idsRapido];
      assert.equal(
        new Set(todos).size,
        todos.length,
        "a MESMA mensagem foi entregue a dois workers",
      );
      assert.equal(todos.length, 20, "as 20 mensagens deveriam ter sido distribuídas");
      assert.equal(sql(`select count(*) from platform.outbox where state='processing'`), "20");
      assert.equal(sql(`select count(distinct locked_by) from platform.outbox`), "2");
    } finally {
      try {
        lento.kill();
      } catch {
        /* já saiu */
      }
      closeSync(fd);
      if (existsSync(saidaLento)) rmSync(saidaLento, { force: true });
    }
  });

  test("índice parcial da fila existe — a consulta não degrada com o histórico", () => {
    const n = sql(
      `select count(*) from pg_indexes
       where schemaname='platform' and indexname in ('outbox_fila_idx','job_fila_idx','job_lease_idx')`,
    );
    assert.equal(n, "3", "índices de fila ausentes");
  });

  test("lease vencido é identificável por índice — job de worker morto volta", () => {
    sql(`delete from platform.job`);
    sql(
      `insert into platform.job(job_id,kind,payload,idempotency_key,state,locked_by,locked_at,lease_expires_at)
       values ('j-morto','reprojetar','{}','jk-1','running','w-morto',now(),now() - interval '1 minute')`,
    );
    const vencidos = sql(
      `select count(*) from platform.job where state='running' and lease_expires_at <= now()`,
    );
    assert.equal(vencidos, "1");
    sql(
      `update platform.job set state='pending', locked_by=null, lease_expires_at=null, available_at=now()
       where state='running' and lease_expires_at <= now()`,
    );
    assert.equal(sql(`select state from platform.job where job_id='j-morto'`), "pending");
    // Recuperar não é falhar: as tentativas não podem ter sido gastas.
    assert.equal(sql(`select attempts from platform.job where job_id='j-morto'`), "0");
  });

  test("fato e outbox confirmam na MESMA transação — rollback desfaz os dois", () => {
    sql(`delete from platform.outbox where outbox_id='o-tx'`);
    const antesEventos = sql(`select count(*) from platform.event_log`);

    // A transação falha no meio, depois de já ter inserido o fato.
    const erro = sql(
      `begin;
       insert into platform.event_log
         (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version,source_mode)
         values ('ev-tx','ITAIM','trip','t-pg','trip_started','{}','2026-07-26T12:00:00Z','device','k-tx','COR@1.0.3','simulated');
       insert into platform.outbox(outbox_id,stream,kind,payload,idempotency_key,state)
         values ('o-tx','entregas','trip_started','{}','k-tx','estado_invalido');
       commit;`,
      { expectError: true },
    );
    assert.match(erro, /outbox_state_valido/);

    assert.equal(sql(`select count(*) from platform.event_log`), antesEventos, "fato ficou órfão");
    assert.equal(sql(`select count(*) from platform.outbox where outbox_id='o-tx'`), "0");
  });

  test("timestamps são TIMESTAMPTZ em todas as tabelas da plataforma", () => {
    const semTz = sql(
      `select count(*) from information_schema.columns
       where table_schema in ('platform','entregas','identity','sources','orders')
         and data_type = 'timestamp without time zone'`,
    );
    assert.equal(semTz, "0", "coluna TIMESTAMP sem fuso");
  });

  test("a migration declarada no repositório é a mesma aplicada", () => {
    const sqlText = file("src/platform/migrations/0001_platform_foundation.sql");
    assert.match(sqlText, /CREATE SCHEMA IF NOT EXISTS platform/);
    assert.match(sqlText, /impedir_mutacao_event_log/);
  });
}

void (async () => {
  console.log("=== Integração PostgreSQL (servidor real, banco próprio) ===");
  const banco = await bancoVazio(PG_URL, "pgint");
  ALVO = banco.url;
  try {
    provas();
  } catch (e) {
    failures.push(`execução: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await banco.descartar();
  }
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} postgres-integration tests OK ===`);
})().catch((e: unknown) => {
  console.error("falha ao executar a integração PostgreSQL:", e);
  process.exit(1);
});
