/**
 * Backup e restauração — ciclo completo contra PostgreSQL real.
 *
 * Um backup que ninguém restaurou é uma suposição, não uma proteção. Este
 * arquivo faz o caminho inteiro: grava dados conhecidos, gera o dump, DESTRÓI
 * a base, restaura em uma base nova e confere o que voltou.
 *
 * O que ele confere não é só a contagem de linhas. As coisas que costumam
 * sumir num restore e só dão sinal meses depois:
 *
 *  - a **trigger** de append-only. Se ela não voltar, o event log fica
 *    editável e ninguém percebe — até o dia em que alguém edita;
 *  - as **constraints**. Sem elas o banco aceita coordenada impossível e
 *    estado inválido, e o dado errado entra sem barulho;
 *  - os **índices parciais** das filas. Sem eles nada quebra: só fica lento,
 *    progressivamente, conforme o histórico cresce;
 *  - o **fuso**. Carimbo restaurado com fuso diferente move a operação inteira
 *    algumas horas.
 *
 * Sem `DELIVERYOS_PG_URL` e `DELIVERYOS_PG_BIN`, declara-se PULADO em voz alta.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PG_URL = process.env.DELIVERYOS_PG_URL;
/** Diretório com pg_dump/pg_restore/psql/createdb/dropdb. */
const PG_BIN = process.env.DELIVERYOS_PG_BIN ?? "";

function ferramenta(nome: string): string {
  return PG_BIN ? join(PG_BIN, nome) : nome;
}

if (!PG_URL) {
  console.log("=== Backup e restauração ===");
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum backup foi testado.");
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

const url = new URL(PG_URL);
const baseOriginal = url.pathname.replace(/^\//, "");
const baseRestaurada = `${baseOriginal}_restaurado`;
const urlAdmin = new URL(PG_URL);
urlAdmin.pathname = "/postgres";
const urlRestaurada = new URL(PG_URL);
urlRestaurada.pathname = `/${baseRestaurada}`;

function psql(alvo: URL, sql: string): string {
  return execFileSync(
    ferramenta("psql"),
    ["-d", alvo.toString(), "-tA", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

const trabalho = join(tmpdir(), `deliveryos-backup-${process.pid}`);
mkdirSync(trabalho, { recursive: true });
const arquivoDump = join(trabalho, "deliveryos.dump");

console.log("=== Backup e restauração (PostgreSQL real) ===");

// Preflight: o mesmo cuidado do resto da suíte — provar que o canal executa
// SQL antes de afirmar qualquer coisa sobre o banco.
if (psql(url, "select 'canal_ok'") !== "canal_ok") {
  console.error("FALHA DE PREFLIGHT: o canal com o psql não executa SQL. Nenhum teste rodou.");
  process.exit(1);
}

try {
  /* ---------------------------------------------------------------- *
   * Dados conhecidos
   * ---------------------------------------------------------------- */

  psql(url, `DELETE FROM entregas.gps_point`);
  psql(url, `DELETE FROM entregas.trip`);
  psql(url, `TRUNCATE platform.event_log`);
  psql(
    url,
    `INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','TATA Itaim')
     ON CONFLICT (unit_id) DO NOTHING`,
  );
  psql(
    url,
    `INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version)
     VALUES ('t-bkp','ITAIM','rid-1','em_rota','ops','2026-07-26T12:00:00Z','COR-ENTREGAS-V1@1.0.3')`,
  );
  for (let i = 0; i < 3; i += 1) {
    psql(
      url,
      `INSERT INTO platform.event_log
         (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version)
       VALUES ('ev-bkp-${i}','ITAIM','trip','t-bkp','trip_started','{"n":${i}}',
               '2026-07-26T12:0${i}:00Z','device','k-bkp-${i}','COR-ENTREGAS-V1@1.0.3')`,
    );
  }

  const eventosAntes = psql(url, `SELECT count(*) FROM platform.event_log`);
  const carimboAntes = psql(
    url,
    `SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')
       FROM platform.event_log WHERE event_id='ev-bkp-0'`,
  );

  /* ---------------------------------------------------------------- *
   * Backup
   * ---------------------------------------------------------------- */

  test("pg_dump gera um arquivo não vazio", () => {
    execFileSync(
      ferramenta("pg_dump"),
      ["-d", url.toString(), "--format=custom", "--file", arquivoDump],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.ok(existsSync(arquivoDump), "o dump não foi criado");
    assert.ok(statSync(arquivoDump).size > 1024, "dump suspeito de vazio");
  });

  /* ---------------------------------------------------------------- *
   * Destruição e restauração
   * ---------------------------------------------------------------- */

  test("a base restaurada é criada do zero", () => {
    // Restaurar por cima de uma base existente esconderia exatamente o que
    // este teste procura: o que o dump NÃO traz de volta.
    psql(urlAdmin, `DROP DATABASE IF EXISTS ${baseRestaurada}`);
    psql(urlAdmin, `CREATE DATABASE ${baseRestaurada}`);
    const n = psql(
      urlRestaurada,
      `SELECT count(*) FROM information_schema.tables WHERE table_schema='platform'`,
    );
    assert.equal(n, "0", "a base nova não estava vazia");
  });

  test("pg_restore recompõe a base", () => {
    execFileSync(
      ferramenta("pg_restore"),
      ["-d", urlRestaurada.toString(), "--no-owner", "--no-privileges", arquivoDump],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.ok(true);
  });

  /* ---------------------------------------------------------------- *
   * O que voltou
   * ---------------------------------------------------------------- */

  test("os sete schemas voltaram", () => {
    const n = psql(
      urlRestaurada,
      `SELECT count(*) FROM pg_namespace WHERE nspname IN
       ('platform','identity','entregas','sources','orders','crm','copiloto')`,
    );
    assert.equal(n, "7");
  });

  test("os dados voltaram, com a mesma contagem", () => {
    assert.equal(psql(urlRestaurada, `SELECT count(*) FROM platform.event_log`), eventosAntes);
    assert.equal(psql(urlRestaurada, `SELECT count(*) FROM entregas.trip`), "1");
  });

  test("o conteúdo voltou íntegro, e não só a quantidade", () => {
    const payload = psql(
      urlRestaurada,
      `SELECT payload->>'n' FROM platform.event_log WHERE event_id='ev-bkp-2'`,
    );
    assert.equal(payload, "2");
    assert.equal(
      psql(urlRestaurada, `SELECT state FROM entregas.trip WHERE trip_id='t-bkp'`),
      "em_rota",
    );
  });

  test("o carimbo de tempo voltou com o MESMO instante", () => {
    const depois = psql(
      urlRestaurada,
      `SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')
         FROM platform.event_log WHERE event_id='ev-bkp-0'`,
    );
    assert.equal(depois, carimboAntes, "o instante mudou no restore");
  });

  test("as colunas de tempo continuam COM fuso", () => {
    const semFuso = psql(
      urlRestaurada,
      `SELECT count(*) FROM information_schema.columns
        WHERE table_schema IN ('platform','entregas','identity','sources','orders')
          AND data_type = 'timestamp without time zone'`,
    );
    assert.equal(semFuso, "0", "coluna perdeu o fuso no restore");
  });

  /* ---------------------------------------------------------------- *
   * As proteções — o que costuma não voltar
   * ---------------------------------------------------------------- */

  test("a trigger de append-only voltou e AINDA impede UPDATE", () => {
    // A prova é comportamental, não a presença do nome no catálogo: uma
    // trigger restaurada sem a função por trás existe e não protege nada.
    let erro = "";
    try {
      psql(urlRestaurada, `UPDATE platform.event_log SET event_type='alterado'`);
    } catch (e) {
      erro = (e as { stderr?: string }).stderr ?? String(e);
    }
    assert.match(erro, /append-only/, "o event log ficou editável depois do restore");
  });

  test("a trigger de append-only ainda impede DELETE", () => {
    let erro = "";
    try {
      psql(urlRestaurada, `DELETE FROM platform.event_log WHERE event_id='ev-bkp-0'`);
    } catch (e) {
      erro = (e as { stderr?: string }).stderr ?? String(e);
    }
    assert.match(erro, /append-only/);
    assert.equal(psql(urlRestaurada, `SELECT count(*) FROM platform.event_log`), eventosAntes);
  });

  test("as constraints de coordenada voltaram", () => {
    let erro = "";
    try {
      psql(
        urlRestaurada,
        `INSERT INTO entregas.gps_point
           (point_id,idempotency_key,trip_id,device_id,latitude,longitude,accuracy_m,occurred_at,source,quality,clock_trust,schema_version)
         VALUES ('p-x','gk-x','t-bkp','d1',999,-46.6,12,'2026-07-26T12:00:00Z','device','good','trusted','gps@1.0.0')`,
      );
    } catch (e) {
      erro = (e as { stderr?: string }).stderr ?? String(e);
    }
    assert.match(erro, /gps_latitude_valida/, "o banco restaurado aceita coordenada impossível");
  });

  test("a unicidade de idempotência voltou", () => {
    let erro = "";
    try {
      psql(
        urlRestaurada,
        `INSERT INTO platform.event_log
           (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version)
         VALUES ('ev-dup','ITAIM','trip','t-bkp','trip_started','{}','2026-07-26T12:00:00Z','device','k-bkp-0','COR-ENTREGAS-V1@1.0.3')`,
      );
    } catch (e) {
      erro = (e as { stderr?: string }).stderr ?? String(e);
    }
    assert.match(erro, /duplicate key|unique/i);
  });

  test("os índices parciais das filas voltaram", () => {
    // Não voltar não quebra nada: só fica lento, progressivamente, conforme o
    // histórico cresce. É a perda mais silenciosa de um restore.
    const n = psql(
      urlRestaurada,
      `SELECT count(*) FROM pg_indexes WHERE schemaname='platform'
        AND indexname IN ('outbox_fila_idx','job_fila_idx','job_lease_idx')`,
    );
    assert.equal(n, "3", "índices de fila não voltaram");
  });

  test("o registro de migrations voltou — o restore não reaplica schema", () => {
    const versoes = psql(
      urlRestaurada,
      `SELECT count(*) FROM platform.schema_migration WHERE version LIKE '0%'`,
    );
    assert.ok(Number(versoes) >= 2, `esperava 2+ migrations registradas, achei ${versoes}`);
  });

  test("a base restaurada aceita escrita nova", () => {
    // Restore que volta somente leitura é backup que não serve para retomar.
    psql(
      urlRestaurada,
      `INSERT INTO platform.event_log
         (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version)
       VALUES ('ev-pos','ITAIM','trip','t-bkp','trip_finished','{}','2026-07-26T13:00:00Z','device','k-pos','COR-ENTREGAS-V1@1.0.3')`,
    );
    assert.equal(
      psql(urlRestaurada, `SELECT count(*) FROM platform.event_log`),
      String(Number(eventosAntes) + 1),
    );
  });
} finally {
  try {
    psql(urlAdmin, `DROP DATABASE IF EXISTS ${baseRestaurada}`);
  } catch {
    /* a base pode não existir se o teste falhou antes */
  }
  rmSync(trabalho, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} backup-restore tests OK ===`);
