/**
 * PATRIMÔNIO — o gate de backup não pode apagar o que não é dele.
 * ============================================================================
 * `run-backup-restore-tests.ts` já PROMETE, no próprio código, que só cria e
 * apaga os bancos dele e nunca abre conexão com o banco da URL. Esta suíte
 * não lê a promessa: RODA o gate como processo, contra um banco de
 * referência com linhas conhecidas, e mede o que aconteceu com tudo ao redor.
 *
 *   P1  REFERÊNCIA TRANCADA — o banco da URL com `ALLOW_CONNECTIONS false`.
 *       O gate passa assim mesmo: ele não conecta nele. Qualquer TRUNCATE,
 *       DELETE, DISABLE TRIGGER ou "usar o banco da URL como fonte" precisaria
 *       conectar — e falharia aqui;
 *   P2  REFERÊNCIA ABERTA — o caso real do banco compartilhado. Depois do
 *       gate, cada linha da referência está lá, byte a byte (md5 por tabela);
 *   P3  depois do SUCESSO, o conjunto de bancos do servidor é o de antes;
 *   P4  depois de uma FALHA injetada (`pg_restore` que sai 1), também;
 *   P5  depois de SIGTERM no meio do restore, também — e o gate sai 143;
 *   P6  HOSTIL, nome semelhante: bancos `<ref>_restaurado` (o nome fixo que o
 *       gate antigo apagava com DROP IF EXISTS) e `bkpfonte_…`/`bkpdestino_…`
 *       com uma marca conhecida sobrevivem a todas as execuções acima;
 *   P7  HOSTIL, colisão exata: pedir ao `banco-isolado` um nome que já existe
 *       é RECUSADO (`ColisaoDeBanco`), e o banco alheio fica como estava.
 *
 * Esta suíte cria e apaga os seus próprios bancos (a referência e os hostis),
 * pelo mesmo `banco-isolado` — e só eles. Exige `DELIVERYOS_PG_URL` (o
 * servidor); sem ela, PULA EM VOZ ALTA.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado, bancoVazio, ColisaoDeBanco, urlCom, type BancoIsolado } from "./banco-isolado";
import { createPgClient } from "./persistence/sql-client";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const GATE = join(raiz, "src/platform/run-backup-restore-tests.ts");

console.log("\n=== PATRIMONIO — o gate de backup so apaga o que e dele ===\n");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum patrimônio foi exercitado.");
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
 * O servidor, visto de fora
 * ------------------------------------------------------------------ */

async function comAdmin<T>(fn: (q: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const admin = await createPgClient({ url: urlCom(URL_SERVIDOR, "postgres"), max: 1 });
  try {
    return await fn((sql) => admin.query(sql));
  } finally {
    await admin.close();
  }
}

/** Todos os bancos do servidor, pelo nome. */
async function bancos(): Promise<string[]> {
  return comAdmin(async (q) => (await q(`SELECT datname FROM pg_database ORDER BY 1`)).map((r) => String(r.datname)));
}

async function trancar(nome: string, trancado: boolean): Promise<void> {
  await comAdmin(async (q) => {
    await q(`ALTER DATABASE ${nome} ALLOW_CONNECTIONS ${trancado ? "false" : "true"}`);
  });
}

/** Contagem e md5 de cada tabela que o gate antigo tocava — linha a linha. */
async function impressao(b: BancoIsolado): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  for (const [tabela, chave] of [
    ["platform.event_log", "event_id"],
    ["platform.outbox", "outbox_id"],
    ["entregas.trip", "trip_id"],
    ["entregas.gps_point", "point_id"],
    ["identity.unit", "unit_id"],
  ] as const) {
    const x = await b.cliente.query<{ n: string; h: string }>(
      `SELECT count(*) AS n, md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t.${chave}), '')) AS h FROM ${tabela} t`,
    );
    r[tabela] = `${x[0].n}:${x[0].h}`;
  }
  return r;
}

interface Execucao {
  codigo: number | null;
  sinal: NodeJS.Signals | null;
  saida: string;
}

/**
 * Roda o gate de backup como PROCESSO, com a URL apontando para `url`.
 * `aoVer` permite agir no meio (o SIGTERM do P5).
 */
function rodarGate(url: string, extra: NodeJS.ProcessEnv = {}, aoVer?: { padrao: RegExp; fazer: (pid: number) => void }): Promise<Execucao> {
  return new Promise((resolve) => {
    // O gate roda como UM processo, com o mesmo loader do tsx que carrega
    // esta suíte (`process.execArgv`). Por `npx`, o sinal morreria no meio:
    // MEDIDO — SIGTERM no `npm exec` o faz sair 143 SEM repassar, e o script
    // continua rodando órfão.
    const filho = spawn(process.execPath, [...process.execArgv, GATE], {
      cwd: raiz,
      env: { ...process.env, DELIVERYOS_PG_URL: url, ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    let agiu = false;
    const ver = (d: Buffer) => {
      saida += d.toString();
      if (aoVer && !agiu && aoVer.padrao.test(saida) && filho.pid) {
        agiu = true;
        aoVer.fazer(filho.pid);
      }
    };
    filho.stdout?.on("data", ver);
    filho.stderr?.on("data", ver);
    const limite = setTimeout(() => filho.kill("SIGKILL"), 180_000);
    filho.once("exit", (codigo, sinal) => {
      clearTimeout(limite);
      resolve({ codigo, sinal, saida });
    });
  });
}

/** Diretório de binários com um `pg_restore` falso; os outros são os reais. */
function binariosComRestore(corpo: string): string {
  const dir = mkdtempSync(join(tmpdir(), "patrimonio-bin-"));
  for (const nome of ["pg_dump", "psql"]) {
    const real = execFileSync("sh", ["-c", `command -v ${nome}`], { encoding: "utf8" }).trim();
    symlinkSync(real, join(dir, nome));
  }
  writeFileSync(join(dir, "pg_restore"), `#!/bin/sh\n${corpo}\n`);
  chmodSync(join(dir, "pg_restore"), 0o755);
  return dir;
}

/* ================================================================== */

void (async () => {
  const meus: BancoIsolado[] = [];
  const binarios: string[] = [];
  try {
    // A referência: um banco com a cara do compartilhado — todas as
    // migrations, e linhas conhecidas em cada tabela que o gate antigo tocava.
    const ref = await bancoIsolado(URL_SERVIDOR, undefined, "patref");
    meus.push(ref);
    await ref.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ('REF', 'Referência')`);
    await ref.cliente.query(
      `INSERT INTO entregas.trip(trip_id, unit_id, courier_actor_id, state, created_by, created_at, contract_version)
       VALUES ('t-ref', 'REF', 'rid-ref', 'em_rota', 'ops', '2026-09-01T12:00:00Z', 'COR-ENTREGAS-V1@1.0.3')`,
    );
    await ref.cliente.query(
      `INSERT INTO entregas.gps_point (point_id, idempotency_key, trip_id, device_id, latitude, longitude,
          accuracy_m, occurred_at, source, quality, clock_trust, schema_version)
       VALUES ('p-ref', 'gk-ref', 't-ref', 'dev-ref', -23.5, -46.6, 9, '2026-09-01T12:01:00Z',
               'device', 'good', 'trusted', 'gps@1.0.0')`,
    );
    for (let i = 1; i <= 5; i += 1) {
      await ref.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
            occurred_at, origin, idempotency_key, contract_version, source_mode)
         VALUES ($1, 'REF', 'trip', 't-ref', 'trip_created', '{}'::jsonb, $2, 'system', $3, 'trip_created@1.0.0', $4)`,
        [`ev-ref-${i}`, `2026-09-01T12:0${i}:00Z`, `k-ref-${i}`, i % 2 ? "simulated" : "control"],
      );
    }
    for (let i = 1; i <= 3; i += 1) {
      await ref.cliente.query(
        `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key)
         VALUES ($1, 'entregas', 'trip_created', '{}'::jsonb, $2)`,
        [`o-ref-${i}`, `ik-ref-${i}`],
      );
    }
    const digitalRef = await impressao(ref);

    // Os hostis: nomes que um gate descuidado apagaria, cada um com uma marca.
    const MARCA = `patrimonio-alheio-${Date.now()}`;
    const hostis: BancoIsolado[] = [];
    for (const nome of [`${ref.nome}_restaurado`, `bkpfonte_hostil_${process.pid}`, `bkpdestino_hostil_${process.pid}`]) {
      const h = await bancoVazio(URL_SERVIDOR, "hostil", { nome });
      meus.push(h);
      hostis.push(h);
      await h.cliente.query(`CREATE TABLE patrimonio (marca TEXT NOT NULL)`);
      await h.cliente.query(`INSERT INTO patrimonio VALUES ($1)`, [MARCA]);
    }
    const marcasIntactas = async (): Promise<void> => {
      const existentes = await bancos();
      for (const h of hostis) {
        assert.ok(existentes.includes(h.nome), `o banco hostil ${h.nome} foi APAGADO`);
        const r = await h.cliente.query<{ marca: string }>(`SELECT marca FROM patrimonio`);
        assert.deepEqual(r.map((x) => x.marca), [MARCA], `a marca de ${h.nome} mudou`);
      }
    };

    const antes = await bancos();

    await teste("P1 REFERÊNCIA TRANCADA: o gate passa sem conectar no banco da URL", async () => {
      await trancar(ref.nome, true);
      let r: Execucao;
      try {
        r = await rodarGate(ref.url);
      } finally {
        await trancar(ref.nome, false);
      }
      assert.equal(r.codigo, 0, `o gate não passou com a referência trancada — ele precisa dela:\n${r.saida.slice(-900)}`);
      assert.match(r.saida, /backup-restore tests OK/);
      assert.deepEqual(await impressao(ref), digitalRef);
    });

    await teste("P2 REFERÊNCIA ABERTA: cada linha da referência está lá depois do gate, md5 por tabela", async () => {
      const r = await rodarGate(ref.url);
      assert.equal(r.codigo, 0, `o gate falhou:\n${r.saida.slice(-900)}`);
      assert.deepEqual(await impressao(ref), digitalRef, "o gate mexeu no banco da URL");
    });

    await teste("P3 depois do SUCESSO, o conjunto de bancos do servidor é o de antes", async () => {
      assert.deepEqual(await bancos(), antes);
    });

    await teste("P4 depois de uma FALHA injetada (pg_restore sai 1), nenhum banco fica para trás", async () => {
      const bin = binariosComRestore(`echo "falha injetada pelo teste de patrimonio" >&2\nexit 1`);
      binarios.push(bin);
      const r = await rodarGate(ref.url, { DELIVERYOS_PG_BIN: bin });
      assert.notEqual(r.codigo, 0, "o gate passou com o pg_restore quebrado — a falha nem foi exercitada");
      assert.match(r.saida, /falha injetada pelo teste de patrimonio/, `a falha foi outra:\n${r.saida.slice(-600)}`);
      assert.deepEqual(await bancos(), antes, "a falha deixou banco para trás");
      assert.deepEqual(await impressao(ref), digitalRef);
    });

    await teste("P5 depois de SIGTERM no meio do restore, nenhum banco fica para trás, e o gate sai 143", async () => {
      const bin = binariosComRestore(`sleep 60`);
      binarios.push(bin);
      // Com os DOIS bancos do gate já criados: o B2 só é impresso depois do destino.
      const r = await rodarGate(ref.url, { DELIVERYOS_PG_BIN: bin }, {
        padrao: /ok {2}B2 /,
        fazer: (pid) => setTimeout(() => process.kill(pid, "SIGTERM"), 300),
      });
      assert.equal(r.codigo, 143, `o gate não saiu pelo SIGTERM (código ${String(r.codigo)}, sinal ${String(r.sinal)}):\n${r.saida.slice(-600)}`);
      assert.deepEqual(await bancos(), antes, "a interrupção deixou banco para trás");
      assert.deepEqual(await impressao(ref), digitalRef);
    });

    await teste("P6 HOSTIL, nome semelhante: <ref>_restaurado, bkpfonte_… e bkpdestino_… sobreviveram a tudo", async () => {
      await marcasIntactas();
    });

    await teste("P7 HOSTIL, colisão exata: nome que já existe é RECUSADO e o banco alheio fica como estava", async () => {
      for (const h of hostis) {
        await assert.rejects(() => bancoIsolado(URL_SERVIDOR, undefined, "x", { nome: h.nome }), ColisaoDeBanco);
        await assert.rejects(() => bancoVazio(URL_SERVIDOR, "x", { nome: h.nome }), ColisaoDeBanco);
      }
      await marcasIntactas();
      assert.deepEqual(await bancos(), antes);
    });
  } catch (e) {
    falhas.push(`preparação: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  preparação: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    for (const b of [...meus].reverse()) await b.descartar().catch(() => undefined);
    for (const d of binarios) rmSync(d, { recursive: true, force: true });
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas de patrimônio`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nPATRIMONIO_RED");
    process.exit(1);
  }
  console.log("\nPATRIMONIO_GREEN");
})();
