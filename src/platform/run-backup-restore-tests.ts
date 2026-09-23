/**
 * Backup e restauração — ciclo completo contra PostgreSQL real, num
 * patrimônio que é SÓ desta suíte.
 *
 * Um backup que ninguém restaurou é uma suposição, não uma proteção. Este
 * arquivo faz o caminho inteiro: grava dados conhecidos, gera o dump,
 * restaura num banco novo e confere o que voltou.
 *
 * O que ele confere não é só a contagem de linhas. As coisas que costumam
 * sumir num restore e só dão sinal meses depois:
 *
 *  - as **triggers** de append-only — contra UPDATE e DELETE (0001) e contra
 *    TRUNCATE (0004). Se elas não voltarem, o event log fica editável ou
 *    apagável e ninguém percebe — até o dia em que alguém edita ou apaga;
 *  - as **constraints**, inclusive a `NOT VALID` da 0003, que precisa voltar
 *    ainda NÃO validada — validada, ela recusaria o histórico sem modo;
 *  - os **índices**. Sem eles nada quebra: só fica lento, progressivamente,
 *    conforme o histórico cresce;
 *  - o **instante**, até o microssegundo, e o **modo** de cada fato;
 *  - o que a Q-016 lê do log: a reconstrução da Operação Viva a partir do
 *    banco restaurado tem de ser a MESMA da fonte.
 *
 * PATRIMÔNIO. Até 2026-09-23 esta suíte usava o banco de `DELIVERYOS_PG_URL`
 * como fonte: fazia `DELETE` em `entregas.*` e `TRUNCATE platform.event_log`
 * nele para montar o fixture, e restaurava num `<banco>_restaurado` de nome
 * fixo, com `DROP DATABASE IF EXISTS` antes. Três jeitos de apagar o que não
 * era dela — o segundo dependia do buraco que a 0004 fecha.
 *
 * Agora a URL serve só para chegar ao SERVIDOR. A suíte cria DOIS bancos
 * próprios (`banco-isolado.ts`) — a fonte, migrada pelo runner real a partir
 * da 0002 para carregar histórico sem modo de verdade, e o destino, vazio — e
 * apaga só esses dois, também em falha e em SIGINT/SIGTERM. Ela nunca abre
 * conexão com o banco nomeado na URL.
 *
 * Sem `DELIVERYOS_PG_URL`, declara-se PULADO em voz alta. `DELIVERYOS_PG_BIN`
 * aponta outro diretório para `pg_dump`/`pg_restore` (padrão: o PATH).
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado, bancoVazio, type BancoIsolado } from "./banco-isolado";
import { diretorioDeMigrations } from "./migrations/localizar";
import { loadMigrations } from "./migrations/runner";
import { reconstruirNoBoot, type ResultadoDoReplayNoBoot } from "./runtime/replay-no-boot";
import { montarPonteDaOperacaoViva, TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";
import { lerFatosParaReplay } from "./projections/replay-do-event-log";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const PG_BIN = process.env.DELIVERYOS_PG_BIN ?? "";
const ferramenta = (nome: string): string => (PG_BIN ? join(PG_BIN, nome) : nome);

/** O histórico nasce aqui: antes da 0003, fato não tinha modo. */
const ANTES_DO_MODO = "0002_event_log_contexto_dispositivo";
const SCHEMAS = ["platform", "identity", "entregas", "sources", "orders", "crm", "copiloto"];
const LISTA_DE_SCHEMAS = SCHEMAS.map((s) => `'${s}'`).join(",");

console.log("=== Backup e restauração (PostgreSQL real, patrimônio próprio) ===");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum backup foi testado.");
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
 * Processos externos e limpeza
 * ------------------------------------------------------------------ */

const criados: BancoIsolado[] = [];
const trabalho = mkdtempSync(join(tmpdir(), "deliveryos-backup-"));
let filhoAtivo: ChildProcess | null = null;
let limpando: Promise<void> | null = null;

/** Apaga SÓ o que esta execução criou, na ordem inversa. Uma vez. */
function limpar(): Promise<void> {
  limpando ??= (async () => {
    for (const b of [...criados].reverse()) await b.descartar().catch(() => undefined);
    rmSync(trabalho, { recursive: true, force: true });
  })();
  return limpando;
}

// Interrupção também é falha: o banco criado não fica para trás. Os binários
// externos rodam ASSÍNCRONOS justamente para que o sinal seja atendido na
// hora, e não depois de um `pg_restore` que ninguém vai esperar.
for (const [sinal, codigo] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  process.once(sinal, () => {
    filhoAtivo?.kill("SIGKILL");
    void limpar().finally(() => process.exit(codigo));
  });
}

/** Roda um binário do PostgreSQL. Resolve com a saída; rejeita com ela. */
function rodar(nome: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const filho = spawn(ferramenta(nome), args, { stdio: ["ignore", "pipe", "pipe"] });
    filhoAtivo = filho;
    let stdout = "";
    let stderr = "";
    filho.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    filho.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    filho.once("error", (e) => {
      filhoAtivo = null;
      reject(new Error(`${nome} não executou: ${e.message}`));
    });
    filho.once("exit", (c) => {
      filhoAtivo = null;
      if (c === 0) resolve({ stdout, stderr });
      else reject(new Error(`${nome} saiu ${String(c)}: ${stderr.trim().slice(0, 400)}`));
    });
  });
}

/* ------------------------------------------------------------------ *
 * Leituras que comparam fonte e destino
 * ------------------------------------------------------------------ */

const json = (x: unknown): string => JSON.stringify(x);

async function linhasDe<T extends Record<string, unknown>>(b: BancoIsolado, sql: string): Promise<T[]> {
  return b.cliente.query<T>(sql);
}

/** Contagem EXATA de cada tabela dos sete schemas. */
async function contagens(b: BancoIsolado): Promise<Record<string, number>> {
  const tabelas = await linhasDe<{ t: string }>(
    b,
    `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
      WHERE table_schema IN (${LISTA_DE_SCHEMAS}) AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  const r: Record<string, number> = {};
  for (const { t } of tabelas) {
    const n = await linhasDe<{ n: string }>(b, `SELECT count(*) AS n FROM ${t}`);
    r[t] = Number(n[0].n);
  }
  return r;
}

/** Cada fato, todas as colunas; instantes até o microssegundo, em UTC. */
async function fatos(b: BancoIsolado): Promise<Record<string, unknown>[]> {
  const us = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS ${c}`;
  return linhasDe(
    b,
    `SELECT event_id, unit_id, object_type, object_id, event_type, payload::text AS payload,
            ${us("occurred_at")}, ${us("recorded_at")}, actor_id, origin, idempotency_key,
            correlation_id, causation_id, clock_trust, contract_version, device_id,
            sequence_local::text AS sequence_local, source_mode
       FROM platform.event_log ORDER BY event_id`,
  );
}

async function constraints(b: BancoIsolado): Promise<unknown[]> {
  return linhasDe(
    b,
    `SELECT n.nspname || '.' || c.relname AS tabela, k.conname, k.contype, k.convalidated,
            pg_get_constraintdef(k.oid) AS def
       FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN (${LISTA_DE_SCHEMAS}) ORDER BY 1, 2`,
  );
}

async function indices(b: BancoIsolado): Promise<unknown[]> {
  return linhasDe(
    b,
    `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname IN (${LISTA_DE_SCHEMAS}) ORDER BY 1, 2, 3`,
  );
}

async function triggers(b: BancoIsolado): Promise<{ tabela: string; tgname: string; tgenabled: string; def: string }[]> {
  return linhasDe(
    b,
    `SELECT n.nspname || '.' || c.relname AS tabela, t.tgname, t.tgenabled::text AS tgenabled,
            pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname IN (${LISTA_DE_SCHEMAS}) ORDER BY 1, 2`,
  );
}

/** As funções dos sete schemas, pelo corpo — trigger sem a função certa não protege. */
async function funcoes(b: BancoIsolado): Promise<unknown[]> {
  return linhasDe(
    b,
    `SELECT n.nspname || '.' || p.proname AS funcao, md5(pg_get_functiondef(p.oid)) AS corpo
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN (${LISTA_DE_SCHEMAS}) ORDER BY 1`,
  );
}

async function versoes(b: BancoIsolado): Promise<string[]> {
  const r = await linhasDe<{ version: string }>(b, `SELECT version FROM platform.schema_migration ORDER BY 1`);
  return r.map((x) => String(x.version));
}

/** Executa e devolve a mensagem de erro — ou `null` se o banco ACEITOU. */
async function tentar(b: BancoIsolado, sql: string): Promise<string | null> {
  try {
    await b.cliente.query(sql);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const INSERIR_FATO = `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
    payload, occurred_at, origin, idempotency_key, contract_version, device_id, sequence_local, source_mode)
  VALUES ($1, $2, 'trip', $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)`;

/** O que a Q-016 lê e reconstrói do log — sem o tempo gasto, que varia. */
async function replay(b: BancoIsolado, agora: Date): Promise<Omit<ResultadoDoReplayNoBoot, "ms">> {
  const r = await reconstruirNoBoot(b.cliente, montarPonteDaOperacaoViva(), agora);
  const { ms: _ms, ...resto } = r;
  return resto;
}

/* ================================================================== */

void (async () => {
  const arquivoDump = join(trabalho, "fonte.dump");
  const AGORA = new Date("2026-09-23T12:00:00Z");

  try {
    /* -------------------------------------------------------------- *
     * A fonte: histórico sem modo, depois o schema inteiro, depois fatos
     * -------------------------------------------------------------- */
    const fonte = await bancoIsolado(URL_SERVIDOR, ANTES_DO_MODO, "bkpfonte");
    criados.push(fonte);

    // Histórico de um ambiente que já existia antes da 0003: a coluna de modo
    // nem existe ainda. É o UNKNOWN que precisa sobreviver ao restore.
    for (const [i, tipo] of [[1, "trip_created"], [2, "trip_started"]] as const) {
      await fonte.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
            payload, occurred_at, origin, idempotency_key, contract_version)
         VALUES ($1, 'BKP-H', 'trip', 't-hist', $2, '{}'::jsonb, $3, 'system', $4, $5)`,
        [`ev-hist-${i}`, tipo, `2026-08-01T10:0${i}:00.123456Z`, `k-hist-${i}`, `${tipo}@1.0.0`],
      );
    }
    await fonte.migrarTudo();

    await fonte.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ('BKP', 'Backup')`);
    await fonte.cliente.query(
      `INSERT INTO entregas.trip(trip_id, unit_id, courier_actor_id, state, created_by, created_at, contract_version)
       VALUES ('t-bkp', 'BKP', 'rid-1', 'em_rota', 'ops', '2026-07-26T12:00:00Z', 'COR-ENTREGAS-V1@1.0.3')`,
    );
    await fonte.cliente.query(
      `INSERT INTO entregas.gps_point (point_id, idempotency_key, trip_id, device_id, latitude, longitude,
          accuracy_m, occurred_at, source, quality, clock_trust, schema_version)
       VALUES ('p-bkp', 'gk-bkp', 't-bkp', 'dev-bkp', -23.55, -46.63, 12, '2026-07-26T12:05:00Z',
               'device', 'good', 'trusted', 'gps@1.0.0')`,
    );
    // Um fato de CADA modo, com microssegundo no instante: o restore tem de
    // devolver os três, cada um no seu, e o instante exato.
    const novos: [string, string, string, string, string, string, string | null, number | null, string][] = [
      ["ev-real-1", "t-real", "trip_created", "{}", "2026-09-20T10:00:00.000001Z", "system", null, null, "real"],
      ["ev-sim-1", "t-sim", "trip_created", "{}", "2026-09-20T10:01:00.250000Z", "system", null, null, "simulated"],
      [
        "ev-sim-2", "t-sim", "gps_batch_received",
        json({ latitude: -23.58, longitude: -46.68, accuracy_m: 8 }),
        "2026-09-20T10:02:00.999999Z", "device", "dev-bkp", 7, "simulated",
      ],
      ["ev-ctl-1", "t-ctl", "trip_created", "{}", "2026-09-20T10:03:00.500000Z", "system", null, null, "control"],
    ];
    for (const [id, viagem, tipo, payload, ocorreu, origem, aparelho, seq, modo] of novos) {
      await fonte.cliente.query(INSERIR_FATO, [
        id, "BKP", viagem, tipo, payload, ocorreu, origem, `k-${id}`, `${tipo}@1.0.0`, aparelho, seq, modo,
      ]);
    }
    await fonte.cliente.query(
      `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key, correlation_id)
       VALUES ('o-bkp', 'entregas', 'trip_created', '{"trip_id":"t-real"}'::jsonb, 'k-ev-real-1', 'c-bkp')`,
    );

    // O retrato da fonte, tirado ANTES do dump e nunca mais mexido.
    const antes = {
      versoes: await versoes(fonte),
      contagens: await contagens(fonte),
      fatos: await fatos(fonte),
      constraints: await constraints(fonte),
      indices: await indices(fonte),
      triggers: await triggers(fonte),
      funcoes: await funcoes(fonte),
      replay: await replay(fonte, AGORA),
    };

    await teste("B0 a fonte é PRÓPRIA, migrada pelo runner real até a última, com os três modos e histórico sem modo", async () => {
      // Derivado do diretório, nunca escrito à mão: a próxima migration entra
      // aqui sozinha, e uma que não foi aplicada aparece como diferença.
      const todas = loadMigrations(diretorioDeMigrations()).map((m) => m.version);
      assert.deepEqual(antes.versoes, todas, "a fonte não está na última migration do repositório");
      const modos = antes.fatos.map((f) => String(f.source_mode)).sort();
      assert.deepEqual(modos, ["control", "null", "null", "real", "simulated", "simulated"]);
      assert.equal(antes.replay.estado, "completo");
      assert.equal(antes.replay.sem_modo_unknown, 2, "o histórico sem modo não foi lido como UNKNOWN na fonte");
      assert.equal(antes.replay.aptos, 4, "a fonte não tem os quatro fatos aptos ao replay");
    });

    /* -------------------------------------------------------------- *
     * Backup
     * -------------------------------------------------------------- */
    await teste("B1 pg_dump gera um arquivo de formato custom, não vazio", async () => {
      await rodar("pg_dump", ["-d", fonte.url, "--format=custom", "--file", arquivoDump]);
      assert.ok(statSync(arquivoDump).size > 4096, "dump suspeito de vazio");
      assert.equal(readFileSync(arquivoDump).subarray(0, 5).toString("latin1"), "PGDMP", "não é um dump custom");
    });

    /* -------------------------------------------------------------- *
     * Restauração num banco novo e VAZIO de verdade
     * -------------------------------------------------------------- */
    const destino = await bancoVazio(URL_SERVIDOR, "bkpdestino");
    criados.push(destino);

    await teste("B2 o destino nasce vazio: nenhum schema da plataforma, nenhuma relação fora do catálogo", async () => {
      const r = await linhasDe<{ n: string }>(
        destino,
        `SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'`,
      );
      assert.equal(Number(r[0].n), 0, "restaurar por cima de algo esconderia o que o dump não traz");
    });

    await teste("B3 pg_restore recompõe o banco sem erro", async () => {
      const r = await rodar("pg_restore", ["-d", destino.url, "--no-owner", "--no-privileges", "--exit-on-error", arquivoDump]);
      assert.doesNotMatch(r.stderr, /error/i, `pg_restore reclamou: ${r.stderr.slice(0, 300)}`);
    });

    /* -------------------------------------------------------------- *
     * O que voltou — comparado com a fonte, não com uma lista à mão
     * -------------------------------------------------------------- */
    await teste("B4 os sete schemas voltaram", async () => {
      const r = await linhasDe<{ n: string }>(destino, `SELECT count(*) AS n FROM pg_namespace WHERE nspname IN (${LISTA_DE_SCHEMAS})`);
      assert.equal(Number(r[0].n), SCHEMAS.length);
    });

    await teste("B5 cada tabela voltou com a MESMA contagem exata", async () => {
      assert.deepEqual(await contagens(destino), antes.contagens);
      assert.equal(antes.contagens["platform.event_log"], 6);
      assert.equal(antes.contagens["platform.outbox"], 1);
    });

    await teste("B6 o conteúdo voltou íntegro: cada fato, cada coluna", async () => {
      assert.deepEqual(await fatos(destino), antes.fatos);
    });

    await teste("B7 os instantes voltaram iguais até o microssegundo, e as colunas de tempo com fuso", async () => {
      const d = await fatos(destino);
      const instante = (fs: Record<string, unknown>[], id: string) => fs.find((f) => f.event_id === id)?.occurred_at;
      assert.equal(instante(d, "ev-sim-2"), "2026-09-20T10:02:00.999999");
      assert.equal(instante(d, "ev-real-1"), "2026-09-20T10:00:00.000001");
      const semFuso = await linhasDe<{ n: string }>(
        destino,
        `SELECT count(*) AS n FROM information_schema.columns
          WHERE table_schema IN (${LISTA_DE_SCHEMAS}) AND data_type = 'timestamp without time zone'`,
      );
      assert.equal(Number(semFuso[0].n), 0, "coluna perdeu o fuso no restore");
    });

    await teste("B8 o modo de cada fato voltou o mesmo, e o histórico sem modo continua UNKNOWN", async () => {
      const d = await fatos(destino);
      // `NULL` é o valor que importa aqui: um `??` trocaria o UNKNOWN por outra
      // coisa e o teste compararia o que não devia.
      const modo = (id: string): unknown => {
        const f = d.find((x) => x.event_id === id);
        assert.ok(f, `o fato ${id} não voltou`);
        return f.source_mode;
      };
      assert.equal(modo("ev-real-1"), "real");
      assert.equal(modo("ev-sim-1"), "simulated");
      assert.equal(modo("ev-ctl-1"), "control");
      assert.equal(modo("ev-hist-1"), null, "o histórico ganhou modo no restore — backfill por acidente");
      assert.equal(modo("ev-hist-2"), null);
    });

    await teste("B9 as constraints voltaram iguais — a da 0003 ainda NÃO validada", async () => {
      const d = await constraints(destino);
      assert.deepEqual(d, antes.constraints);
      const modo = (d as { conname: string; convalidated: boolean }[]).find(
        (k) => k.conname === "event_log_source_mode_obrigatorio",
      );
      assert.ok(modo, "a constraint de modo não voltou");
      assert.equal(modo.convalidated, false, "voltou VALIDADA — recusaria o histórico sem modo");
    });

    await teste("B10 os índices voltaram iguais, definição por definição", async () => {
      const d = await indices(destino);
      assert.deepEqual(d, antes.indices);
      const nomes = (d as { indexname: string }[]).map((i) => i.indexname);
      for (const n of ["outbox_fila_idx", "job_fila_idx", "job_lease_idx", "event_log_dispositivo_idx"]) {
        assert.ok(nomes.includes(n), `índice ${n} não voltou`);
      }
    });

    await teste("B11 as triggers e as funções voltaram iguais, e habilitadas", async () => {
      const d = await triggers(destino);
      assert.deepEqual(d, antes.triggers);
      for (const nome of ["event_log_sem_update", "event_log_sem_truncate"]) {
        assert.ok(d.some((t) => t.tgname === nome), `a trava ${nome} não voltou`);
      }
      assert.ok(d.every((t) => t.tgenabled === "O"), `trigger voltou desabilitada: ${json(d)}`);
      assert.deepEqual(await funcoes(destino), antes.funcoes);
    });

    await teste("B12 o registro de migrations voltou IGUAL — o restore não reaplica schema", async () => {
      assert.deepEqual(await versoes(destino), antes.versoes);
    });

    await teste("B13 a Q-016 lê do banco restaurado a MESMA reconstrução da fonte", async () => {
      const d = await replay(destino, AGORA);
      assert.deepEqual(d, antes.replay, "o event log restaurado reconstrói outra Operação Viva");
      const porta = await lerFatosParaReplay(destino.cliente, TIPOS_DA_OPERACAO_VIVA);
      assert.equal(porta.sem_modo, 2);
      assert.equal(porta.corrompidas.length, 0);
    });

    /* -------------------------------------------------------------- *
     * As proteções, executadas no banco restaurado
     * -------------------------------------------------------------- */
    await teste("B14 o restaurado aceita fato NOVO válido", async () => {
      await destino.cliente.query(INSERIR_FATO, [
        "ev-pos", "BKP", "t-real", "trip_started", "{}", "2026-09-23T13:00:00Z", "system",
        "k-ev-pos", "trip_started@1.0.0", null, null, "simulated",
      ]);
      assert.equal((await contagens(destino))["platform.event_log"], antes.contagens["platform.event_log"] + 1);
    });

    await teste("B15 UPDATE continua recusado no restaurado, e nada mudou", async () => {
      const erro = await tentar(destino, `UPDATE platform.event_log SET source_mode = 'real'`);
      assert.match(String(erro), /append-only: UPDATE nao e permitido/, `UPDATE passou: ${String(erro)}`);
      const d = await fatos(destino);
      assert.deepEqual(d.filter((f) => f.event_id !== "ev-pos"), antes.fatos);
    });

    await teste("B16 DELETE continua recusado no restaurado", async () => {
      const erro = await tentar(destino, `DELETE FROM platform.event_log`);
      assert.match(String(erro), /append-only: DELETE nao e permitido/, `DELETE passou: ${String(erro)}`);
      assert.equal((await contagens(destino))["platform.event_log"], antes.contagens["platform.event_log"] + 1);
    });

    await teste("B17 as constraints recusam no restaurado: coordenada, chave repetida, fato sem modo", async () => {
      const coordenada = await tentar(
        destino,
        `INSERT INTO entregas.gps_point (point_id, idempotency_key, trip_id, device_id, latitude, longitude,
            accuracy_m, occurred_at, source, quality, clock_trust, schema_version)
         VALUES ('p-x', 'gk-x', 't-bkp', 'd1', 999, -46.6, 12, '2026-07-26T12:00:00Z', 'device', 'good', 'trusted', 'gps@1.0.0')`,
      );
      assert.match(String(coordenada), /gps_latitude_valida/);
      // Chave repetida COM modo válido: a única razão de recusa é a chave.
      const repetida = await tentar(
        destino,
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
            occurred_at, origin, idempotency_key, contract_version, source_mode)
         VALUES ('ev-dup', 'BKP', 'trip', 't-real', 'trip_started', '{}', '2026-09-23T13:00:00Z', 'system',
                 'k-ev-real-1', 'trip_started@1.0.0', 'simulated')`,
      );
      assert.match(String(repetida), /duplicate key|unique/i);
      const semModo = await tentar(
        destino,
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
            occurred_at, origin, idempotency_key, contract_version)
         VALUES ('ev-sm', 'BKP', 'trip', 't-real', 'trip_started', '{}', '2026-09-23T13:00:00Z', 'system',
                 'k-ev-sm', 'trip_started@1.0.0')`,
      );
      assert.match(String(semModo), /event_log_source_mode_obrigatorio/);
    });

    // Por último de propósito: se a trava não tivesse voltado, o TRUNCATE
    // esvaziaria a tabela e contaminaria qualquer prova que viesse depois.
    await teste("B18 TRUNCATE continua recusado no restaurado — a trava da 0004 voltou e protege", async () => {
      const erro = await tentar(destino, `TRUNCATE platform.event_log`);
      assert.match(String(erro), /append-only: TRUNCATE nao e permitido/, `TRUNCATE passou: ${String(erro)}`);
      assert.equal((await contagens(destino))["platform.event_log"], antes.contagens["platform.event_log"] + 1);
    });
  } catch (e) {
    falhas.push(`preparação: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  preparação: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await limpar();
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas de backup e restauração`);
  if (falhas.length) {
    console.error(`\n=== ${falhas.length} FALHA(S) ===`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("\n=== backup-restore tests OK ===");
})();
