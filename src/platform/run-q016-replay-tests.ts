/**
 * Q-016 — A PROJEÇÃO DA OPERAÇÃO VIVA SOBREVIVE AO REINÍCIO.
 * ============================================================================
 * Decisão do César: `platform.event_log` é a fonte durável que governa a
 * reconstrução, e o runtime assíncrono a executa no boot, antes do laço.
 *
 * FASE 1 — O GAP (commit 9ebe5ea)
 * -------------------------------
 * Provado ANTES de qualquer correção, e registrado naquele commit: o
 * `EventEnvelope` e a outbox carregavam `source_mode`, e o `platform.event_log`
 * não. Dois fatos iguais em tudo menos no modo viravam a MESMA linha no log.
 *
 * FASE 2 — O CONTRATO DURÁVEL (esta versão)
 * -----------------------------------------
 * A seção 1 usa o MESMO instrumento e os MESMOS dois fatos da Fase 1. Onde ela
 * media "as linhas são iguais", agora mede "as linhas diferem exatamente no
 * modo". Trocar o instrumento junto com a correção tornaria a comparação entre
 * antes e depois impossível.
 *
 * O instrumento central é uma comparação de linhas, e comparação sem controle
 * é opinião. Por isso os controles continuam:
 *   - a comparação ENXERGA diferença quando o log preserva o campo que difere;
 *   - a diferença de modo EXISTE na entrada, e chega à outbox.
 *
 * A seção 2 é o histórico: um banco migrado só até a 0002, com fatos gravados
 * sem modo, recebendo a 0003 por cima — o caso de todo ambiente que já existe.
 *
 * Banco ISOLADO por execução: criado aqui, migrado pelo runner real, apagado
 * no fim. Suíte que presume banco vazio e roda num compartilhado reprova o
 * produto por um fato do ambiente — foi o que o `spine:processos` fez no PB19.
 *
 * Exige `DELIVERYOS_PG_URL`. Sem banco, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EventEnvelope, SourceMode } from "./contracts/event-catalog";
import { ingerir } from "./ingest/ingest-service";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import { bancoIsolado as bancoIsoladoDe } from "./banco-isolado";
import { diretorioDeMigrations } from "./migrations/localizar";
import { loadMigrations } from "./migrations/runner";
import {
  envelopeDaMensagem,
  MemoriaDaProjecao,
  projecaoAtual,
  reconstruirPorReplay,
} from "./projections/consumidor";
import type { Projecao } from "./projections/operacao-viva";
import { lerFatosParaReplay } from "./projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();

console.log("\n=== Q-016 — REPLAY DA OPERACAO VIVA A PARTIR DO EVENT LOG ===\n");

if (!URL_PG) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum fato foi gravado nem relido.");
  console.log("Para rodar:  DELIVERYOS_PG_URL=postgres://user@host:porta/base");
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
 * Banco isolado — implementação única em banco-isolado.ts
 * ------------------------------------------------------------------ */

const bancoIsolado = (ate?: string) => bancoIsoladoDe(URL_PG, ate, "q016");

/* ------------------------------------------------------------------ *
 * Fatos de teste — sintéticos, e declarados como tal
 * ------------------------------------------------------------------ */

let seq = 0;
function fato(o: {
  modo: SourceMode;
  unidade?: string;
  tipo?: EventEnvelope["event_type"];
  viagem?: string;
  ocorreu?: string;
  sequencia?: number;
  chave?: string;
}): EventEnvelope {
  seq += 1;
  const id = o.chave ?? `q016-${process.pid}-${seq}`;
  return {
    event_id: `ev-${id}`,
    event_type: o.tipo ?? "trip_created",
    event_version: `${o.tipo ?? "trip_created"}@1.0.0`,
    unit_id: o.unidade ?? "Q016-UNIDADE",
    trip_id: o.viagem ?? "Q016-VIAGEM-1",
    occurred_at: o.ocorreu ?? "2026-09-23T12:00:00.000Z",
    origin: "system",
    source_mode: o.modo,
    sequence: o.sequencia,
    idempotency_key: `k-${id}`,
    payload: {},
  };
}

/* ------------------------------------------------------------------ *
 * O instrumento: diferença entre duas linhas
 * ------------------------------------------------------------------ */

function normal(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return "undefined";
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])));
  }
  return JSON.stringify(v);
}

/** Campos cujo valor difere entre `a` e `b`, ignorando os de identidade. */
function diferencas(a: Record<string, unknown>, b: Record<string, unknown>, ignorar: readonly string[]): string[] {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...chaves].filter((k) => !ignorar.includes(k) && normal(a[k]) !== normal(b[k])).sort();
}

/** Procura uma CHAVE `source_mode` em qualquer profundidade. */
function temChaveDeModo(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some(temChaveDeModo);
  return Object.entries(v as Record<string, unknown>).some(
    ([k, x]) => k === "source_mode" || temChaveDeModo(x),
  );
}

/** Identidade de uma linha: arbitrária por construção, nunca carrega modo. */
const IDENTIDADE_LOG = ["event_id", "idempotency_key", "recorded_at"] as const;
const IDENTIDADE_OUTBOX = ["event_id"] as const;

/* ================================================================== */

void (async () => {
  const banco = await bancoIsolado();
  const { cliente } = banco;
  const escritor = new PgTransactionalWriter(cliente);
  const recebido_em = new Date("2026-09-23T12:00:05.000Z");

  async function linhaDoLog(chave: string): Promise<Record<string, unknown>> {
    const r = await cliente.query(`SELECT * FROM platform.event_log WHERE idempotency_key = $1`, [chave]);
    assert.equal(r.length, 1, `esperava 1 linha no event_log para ${chave}, vieram ${r.length}`);
    return r[0] as Record<string, unknown>;
  }
  async function payloadDaOutbox(chave: string): Promise<Record<string, unknown>> {
    const r = await cliente.query(`SELECT payload FROM platform.outbox WHERE idempotency_key = $1`, [chave]);
    assert.equal(r.length, 1, `esperava 1 mensagem na outbox para ${chave}, vieram ${r.length}`);
    return r[0].payload as Record<string, unknown>;
  }

  try {
    console.log("1. O CONTRATO — o mesmo instrumento e os mesmos fatos da Fase 1");

    // Os mesmos dois fatos da Fase 1: iguais em tudo que o domínio descreve,
    // diferentes só no modo. Lá eles viravam a mesma linha.
    const A = fato({ modo: "real" });
    const B = fato({ modo: "simulated" });

    await teste("C1 os dois fatos ENTRAM pelo caminho real, cada um com o seu modo", async () => {
      const r = await ingerir([A, B], { escritor, recebido_em });
      assert.equal(r.aceito, true, `ingestão recusou: ${JSON.stringify(r.recusados)}`);
      assert.equal(r.gravados, 2, "os dois fatos precisavam ser gravados");
      assert.equal(r.mensagens, 2, "os dois fatos precisavam gerar mensagem");
    });

    await teste("C2 controle: a diferença de modo EXISTE na entrada e chega à outbox", async () => {
      const pa = await payloadDaOutbox(A.idempotency_key);
      const pb = await payloadDaOutbox(B.idempotency_key);
      assert.equal(pa.source_mode, "real");
      assert.equal(pb.source_mode, "simulated");
      assert.deepEqual(diferencas(pa, pb, IDENTIDADE_OUTBOX), ["source_mode"]);
    });

    await teste("C3 o schema tem a coluna: anulável, SEM default, com obrigatoriedade NOT VALID", async () => {
      const col = await cliente.query<{ is_nullable: string; column_default: string | null }>(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = 'platform' AND table_name = 'event_log' AND column_name = 'source_mode'`,
      );
      assert.equal(col.length, 1, "a coluna source_mode não existe");
      assert.equal(col[0].is_nullable, "YES", "a coluna deixou de aceitar nulo — o histórico não caberia");
      // L9: um DEFAULT faria o fato sem modo virar algum modo por conta própria.
      assert.equal(col[0].column_default, null, `a coluna tem DEFAULT (${col[0].column_default}) — coerção silenciosa`);
      const c = await cliente.query<{ convalidated: boolean; def: string }>(
        `SELECT convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'event_log_source_mode_obrigatorio' AND conrelid = 'platform.event_log'::regclass`,
      );
      assert.equal(c.length, 1, "a restrição de obrigatoriedade não existe");
      assert.equal(c[0].convalidated, false, "a restrição foi validada contra o histórico — ele não tem modo");
      assert.match(c[0].def, /IS NOT NULL/, "a restrição não exige presença");
    });

    await teste("C4 controle: a comparação ENXERGA diferença que o log preserva", async () => {
      const C = fato({ modo: "real", sequencia: 1 });
      const D = fato({ modo: "real", sequencia: 2 });
      const r = await ingerir([C, D], { escritor, recebido_em });
      assert.equal(r.gravados, 2);
      assert.deepEqual(
        diferencas(await linhaDoLog(C.idempotency_key), await linhaDoLog(D.idempotency_key), IDENTIDADE_LOG),
        ["sequence_local"],
        "a comparação não enxergou a diferença que o log guarda — instrumento cego",
      );
    });

    await teste("C5 o gap FECHADO: no event_log o fato real e o simulado diferem EXATAMENTE no modo", async () => {
      // Fase 1 (9ebe5ea), mesma comparação: `[]`. Agora: `["source_mode"]`.
      const la = await linhaDoLog(A.idempotency_key);
      const lb = await linhaDoLog(B.idempotency_key);
      assert.deepEqual(diferencas(la, lb, IDENTIDADE_LOG), ["source_mode"]);
      assert.equal(la.source_mode, "real");
      assert.equal(lb.source_mode, "simulated");
    });

    await teste("C6 o modo mora na COLUNA, não contrabandeado para dentro do payload", async () => {
      const la = await linhaDoLog(A.idempotency_key);
      assert.equal(temChaveDeModo(la.payload), false, "o modo vazou para o payload do fato");
      assert.equal(temChaveDeModo(await payloadDaOutbox(A.idempotency_key)), true, "instrumento cego");
    });

    await teste("C7 a linha do log reconstrói o envelope SOZINHA, sem pedir nada à outbox", async () => {
      // Na Fase 1 esta reconstrução era recusada, e só passava emprestando o
      // modo da outbox. Agora o log basta — é o que torna a Q-016 respondível.
      const la = await linhaDoLog(A.idempotency_key);
      const e = envelopeDaMensagem({
        outbox_id: "replay",
        kind: String(la.event_type),
        idempotency_key: String(la.idempotency_key),
        payload: {
          event_id: la.event_id,
          event_type: la.event_type,
          event_version: la.contract_version,
          unit_id: la.unit_id,
          trip_id: la.object_type === "trip" ? la.object_id : undefined,
          occurred_at: la.occurred_at instanceof Date ? la.occurred_at.toISOString() : la.occurred_at,
          origin: la.origin,
          source_mode: la.source_mode,
        },
      });
      assert.ok(e, "a linha do log, sozinha, não reconstruiu o envelope");
      assert.equal(e!.source_mode, "real");
    });

    await teste("C8 o banco RECUSA fato novo sem modo — por qualquer escritor, não só pelo tipo", async () => {
      // Escrita crua, sem passar pelo TypeScript: é o que um script, um
      // escritor futuro ou um reparo manual fariam.
      let erro = "";
      try {
        await cliente.query(
          `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
              payload, occurred_at, origin, idempotency_key, contract_version)
           VALUES ('ev-sem-modo','U','trip','t','trip_created','{}'::jsonb, now(),'system','k-sem-modo','x@1')`,
        );
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      assert.match(erro, /event_log_source_mode_obrigatorio/, `o banco aceitou fato novo sem modo: "${erro}"`);
    });

    await teste("C9 o banco RECUSA modo fora de real|simulated|control — sem coerção", async () => {
      let erro = "";
      try {
        await cliente.query(
          `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
              payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
           VALUES ('ev-modo-ruim','U','trip','t','trip_created','{}'::jsonb, now(),'system','k-modo-ruim','x@1','REAL')`,
        );
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      // 'REAL' em maiúsculas: a tentação de normalizar é exatamente a coerção
      // silenciosa que a missão proíbe.
      assert.match(erro, /event_log_source_mode_obrigatorio/, `o banco aceitou modo inválido: "${erro}"`);
    });
  } finally {
    await banco.descartar();
  }

  /* ================================================================ *
   * 2. O HISTÓRICO — um ambiente que já existia antes da 0003
   * ================================================================ */
  console.log("\n2. O HISTORICO — banco parado na 0002, com fatos sem modo, recebendo a 0003");

  const antigo = await bancoIsolado("0002_event_log_contexto_dispositivo");
  const hc = antigo.cliente;
  const HISTORICOS = 3;

  /** Tudo da linha menos o modo, em ordem estável — para provar "não tocado". */
  async function conteudoHistorico(): Promise<string> {
    const r = await hc.query(
      `SELECT event_id, unit_id, object_type, object_id, event_type, payload::text AS payload,
              occurred_at, recorded_at, origin, idempotency_key, contract_version
         FROM platform.event_log WHERE event_id LIKE 'ev-hist-%' ORDER BY event_id`,
    );
    return JSON.stringify(r.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, normal(v)]))));
  }

  try {
    let antes = "";

    await teste("H1 o histórico nasce sem modo, e a 0003 é aplicada por cima pelo runner real", async () => {
      const colunas = (
        await hc.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'platform' AND table_name = 'event_log'`,
        )
      ).map((c) => String(c.column_name));
      assert.ok(!colunas.includes("source_mode"), "o banco 'antigo' já tinha a coluna — simulação inválida");
      for (let i = 1; i <= HISTORICOS; i += 1) {
        await hc.query(
          `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
              payload, occurred_at, origin, idempotency_key, contract_version)
           VALUES ($1,'Q016-HIST','trip','t-hist','trip_created','{}'::jsonb,
                   '2026-08-01T10:00:00Z','system',$2,'trip_created@1.0.0')`,
          [`ev-hist-${i}`, `k-hist-${i}`],
        );
      }
      antes = await conteudoHistorico();
      const aplicadas = await antigo.migrarTudo();
      // O que falta depois da 0002, DERIVADO do diretório: a lista escrita à
      // mão ("só a 0003") quebrou quando a 0004 chegou, sem que nada do que
      // este teste prova tivesse mudado. A propriedade é a 0003 entrar por cima.
      const depoisDa0002 = loadMigrations(diretorioDeMigrations())
        .map((m) => m.version)
        .filter((v) => v > "0002_event_log_contexto_dispositivo");
      assert.deepEqual(aplicadas, depoisDa0002, `aplicou: ${aplicadas.join(",")}`);
      assert.equal(aplicadas[0], "0003_event_log_source_mode", "a 0003 não foi a primeira a entrar");
    });

    await teste("H2 a 0003 NÃO tocou o histórico: mesmas linhas, mesmo conteúdo, modo NULO", async () => {
      assert.equal(await conteudoHistorico(), antes, "o conteúdo histórico mudou com a migration");
      const r = await hc.query<{ n: string; nulos: string }>(
        `SELECT count(*) AS n, count(*) FILTER (WHERE source_mode IS NULL) AS nulos
           FROM platform.event_log WHERE event_id LIKE 'ev-hist-%'`,
      );
      assert.equal(Number(r[0].n), HISTORICOS);
      assert.equal(Number(r[0].nulos), HISTORICOS, "alguma linha histórica ganhou modo — backfill por suposição");
    });

    await teste("H3 backfill NO LUGAR é estruturalmente impossível: o append-only recusa", async () => {
      // Mesmo que existisse prova do modo histórico, gravá-lo exigiria UPDATE
      // no event log. A trigger de L3 recusa — e ela está no Preservation Set.
      let erro = "";
      try {
        await hc.query(`UPDATE platform.event_log SET source_mode = 'real' WHERE event_id = 'ev-hist-1'`);
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      assert.match(erro, /append-only/, `o event log aceitou UPDATE: "${erro}"`);
      assert.equal(await conteudoHistorico(), antes);
    });

    await teste("H4 VALIDATE CONSTRAINT falha enquanto houver histórico sem modo — o banco diz a verdade", async () => {
      let erro = "";
      try {
        await hc.query(`ALTER TABLE platform.event_log VALIDATE CONSTRAINT event_log_source_mode_obrigatorio`);
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      assert.match(erro, /violated by some row|violada/i, `a validação passou com histórico sem modo: "${erro}"`);
    });

    await teste("H5 a outbox não serve de prova para o histórico: ela é MUTÁVEL", async () => {
      // A outbox carrega o campo, e por isso é a tentação. Mas prova de
      // procedência exige registro que não pode ter sido alterado, e ela não
      // tem trigger de append-only: aceita UPDATE e DELETE, e é purgável.
      const gatilhos = await hc.query<{ tabela: string; tgname: string }>(
        `SELECT c.relname AS tabela, t.tgname FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'platform' AND NOT t.tgisinternal`,
      );
      const porTabela = (x: string) => gatilhos.filter((g) => g.tabela === x).map((g) => g.tgname);
      // Controle: a consulta ENXERGA trava onde ela existe — sem isto, a outbox
      // "sem nenhuma" não provaria nada. Presença, não lista exata: a 0004
      // somou a trava de TRUNCATE ao log, e a lista escrita à mão quebrou sem
      // que a propriedade desta prova mudasse.
      assert.ok(porTabela("event_log").includes("event_log_sem_update"), "controle: o log perdeu a trigger");
      assert.deepEqual(porTabela("outbox"), [], "a outbox ganhou proteção — reavaliar H5");
      await hc.query(
        `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key)
         VALUES ('ob-prova','entregas','trip_created','{"source_mode":"simulated"}'::jsonb,'k-prova')`,
      );
      await hc.query(`UPDATE platform.outbox SET payload = '{"source_mode":"real"}'::jsonb WHERE outbox_id = 'ob-prova'`);
      const r = await hc.query<{ m: string }>(`SELECT payload->>'source_mode' AS m FROM platform.outbox WHERE outbox_id='ob-prova'`);
      assert.equal(r[0].m, "real", "controle: a reescrita não aconteceu");
      // "simulated" virou "real" sem deixar rastro. Um backfill que confiasse
      // nisso herdaria a reescrita como se fosse fato.
    });

    await teste("H6 depois do upgrade, fato NOVO entra com modo e o histórico continua UNKNOWN", async () => {
      const E = fato({ modo: "control", unidade: "Q016-HIST" });
      const r = await ingerir([E], { escritor: new PgTransactionalWriter(hc), recebido_em });
      assert.equal(r.gravados, 1, `ingestão pós-upgrade falhou: ${JSON.stringify(r)}`);
      const modos = await hc.query<{ modo: string | null; n: string }>(
        `SELECT source_mode AS modo, count(*) AS n FROM platform.event_log
          WHERE unit_id = 'Q016-HIST' GROUP BY 1 ORDER BY 1 NULLS LAST`,
      );
      assert.deepEqual(
        modos.map((m) => [m.modo, Number(m.n)]),
        [["control", 1], [null, HISTORICOS]],
        "novo e histórico não ficaram separados como deviam",
      );
    });

    await teste("H7 o banco com histórico UNKNOWN continua RESTAURÁVEL por pg_dump/pg_restore", async () => {
      // Se a restrição NOT VALID fosse recriada como válida no restore, o
      // histórico nulo a violaria e o restore morreria — todo backup tirado
      // depois da 0003 num ambiente com histórico seria irrecuperável. O
      // pg_dump emite restrição NOT VALID DEPOIS dos dados, e aqui isso é
      // medido em vez de lembrado.
      const dir = mkdtempSync(join(tmpdir(), "q016-dump-"));
      const arquivo = join(dir, "antigo.dump");
      const restaurado = await bancoIsolado("0000_nenhuma");
      try {
        execFileSync("pg_dump", ["-d", antigo.url, "--format=custom", "--file", arquivo], { stdio: "pipe" });
        // O banco restaurado nasce VAZIO (nenhuma migration): quem traz o
        // schema é o dump, como num restore de verdade.
        await restaurado.cliente.query(`DROP TABLE IF EXISTS platform.schema_migration`);
        await restaurado.cliente.query(`DROP SCHEMA IF EXISTS platform CASCADE`);
        execFileSync(
          "pg_restore",
          ["-d", restaurado.url, "--no-owner", "--exit-on-error", arquivo],
          { stdio: "pipe" },
        );
        const rc = restaurado.cliente;
        const n = await rc.query<{ modo: string | null; n: string }>(
          `SELECT source_mode AS modo, count(*) AS n FROM platform.event_log
            WHERE unit_id = 'Q016-HIST' GROUP BY 1 ORDER BY 1 NULLS LAST`,
        );
        assert.deepEqual(n.map((x) => [x.modo, Number(x.n)]), [["control", 1], [null, HISTORICOS]]);
        const c = await rc.query<{ convalidated: boolean }>(
          `SELECT convalidated FROM pg_constraint WHERE conname = 'event_log_source_mode_obrigatorio'`,
        );
        assert.equal(c.length, 1, "o restore perdeu a obrigatoriedade de modo");
        assert.equal(c[0].convalidated, false, "o restore validou a restrição contra o histórico");
        let erro = "";
        try {
          await rc.query(
            `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
                payload, occurred_at, origin, idempotency_key, contract_version)
             VALUES ('ev-pos-restore','U','trip','t','trip_created','{}'::jsonb, now(),'system','k-pos-restore','x@1')`,
          );
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
        }
        assert.match(erro, /event_log_source_mode_obrigatorio/, "no banco restaurado, fato sem modo voltou a entrar");
      } finally {
        await restaurado.descartar();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  } finally {
    await antigo.descartar();
  }

  /* ================================================================ *
   * 3. A PORTA DE LEITURA
   * ================================================================ */
  console.log("\n3. A PORTA — le o que a Operacao Viva projeta, e nada mais");

  const porta = await bancoIsolado("0002_event_log_contexto_dispositivo");
  const pc = porta.cliente;

  /** Todas as projeções, escopo a escopo, num mesmo relógio. */
  function projecoes(memoria: MemoriaDaProjecao, agora: Date): Record<string, Projecao> {
    const r: Record<string, Projecao> = {};
    for (const e of memoria.escopos()) {
      r[`${e.unit_id}|${e.source_mode}`] = projecaoAtual(memoria, { agora, ...e });
    }
    return r;
  }

  try {
    // Histórico antes da 0003: sem modo, e portanto UNKNOWN.
    await pc.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
          payload, occurred_at, origin, idempotency_key, contract_version)
       VALUES ('ev-velho-1','U-VELHA','trip','t-v','trip_created','{}'::jsonb,'2026-08-01T10:00:00Z','system','k-velho-1','trip_created@1.0.0'),
              ('ev-velho-2','U-VELHA','trip','t-v','trip_started','{}'::jsonb,'2026-08-01T10:01:00Z','system','k-velho-2','trip_started@1.0.0')`,
    );
    await porta.migrarTudo();

    // Fatos novos pelo caminho real: três modos, duas unidades, sequência,
    // e uma grafia de instante que o log não preserva.
    const novos = [
      fato({ modo: "real", unidade: "U-1", viagem: "t-1", ocorreu: "2026-09-23T12:00:00.000Z", sequencia: 7 }),
      fato({ modo: "real", unidade: "U-1", viagem: "t-1", tipo: "trip_started", ocorreu: "2026-09-23T12:01:00.000Z" }),
      fato({ modo: "simulated", unidade: "U-1", viagem: "t-1", ocorreu: "2026-09-23T12:00:00.000Z" }),
      fato({ modo: "control", unidade: "U-2", viagem: "t-9", ocorreu: "2026-09-23T09:00:00-03:00" }),
    ];
    const r = await ingerir(novos, { escritor: new PgTransactionalWriter(pc), recebido_em });
    assert.equal(r.gravados, novos.length, `ingestão da seção 3 falhou: ${JSON.stringify(r)}`);

    // Um tipo que a Operação Viva NÃO projeta, gravado com modo válido.
    await pc.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
          payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
       VALUES ('ev-alheio','U-1','order','o-1','order_confirmed','{}'::jsonb, now(),'source','k-alheio','x@1','real')`,
    );

    const leitura = await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA);

    await teste("P1 só entram os tipos da Operação Viva — o alheio fica no log, fora da leitura", async () => {
      assert.ok(!TIPOS_DA_OPERACAO_VIVA.includes("order_confirmed"), "o tipo 'alheio' não é alheio — teste inválido");
      assert.equal(leitura.aptos.some((e) => e.event_id === "ev-alheio"), false, "a porta leu tipo que a projeção não entende");
      assert.equal(leitura.lidas, 6, `esperava 6 linhas dos tipos pedidos (2 velhas + 4 novas), vieram ${leitura.lidas}`);
    });

    await teste("P2 histórico sem modo fica FORA e CONTADO como UNKNOWN — nunca vira real", async () => {
      assert.equal(leitura.sem_modo, 2);
      assert.equal(leitura.aptos.some((e) => e.event_id.startsWith("ev-velho")), false, "histórico sem modo entrou no replay");
      assert.equal(leitura.aptos.length, 4);
      assert.deepEqual(leitura.corrompidas, []);
    });

    await teste("P3 modo, unidade, identidade e instante preservados, fato a fato", async () => {
      for (const f of novos) {
        const e = leitura.aptos.find((x) => x.idempotency_key === f.idempotency_key);
        assert.ok(e, `${f.idempotency_key} não voltou do log`);
        assert.equal(e!.source_mode, f.source_mode, `${f.idempotency_key}: modo trocado`);
        assert.equal(e!.unit_id, f.unit_id);
        assert.equal(e!.event_id, f.event_id);
        assert.equal(e!.trip_id, f.trip_id);
        assert.equal(Date.parse(e!.occurred_at), Date.parse(f.occurred_at), `${f.idempotency_key}: instante mudou`);
      }
    });

    await teste("P4 a sequência volta como NÚMERO — BIGINT chega do driver como texto", async () => {
      const e = leitura.aptos.find((x) => x.idempotency_key === novos[0].idempotency_key)!;
      assert.equal(e.sequence, 7);
      assert.equal(typeof e.sequence, "number");
    });

    await teste("P5 UM reconstrutor só: o envelope relido é o MESMO que o consumidor vivo monta da outbox", async () => {
      for (const f of novos) {
        const [m] = await pc.query(`SELECT outbox_id, kind, idempotency_key, payload FROM platform.outbox WHERE idempotency_key = $1`, [
          f.idempotency_key,
        ]);
        const vivo = envelopeDaMensagem({
          outbox_id: String(m.outbox_id),
          kind: String(m.kind),
          idempotency_key: String(m.idempotency_key),
          payload: m.payload as Record<string, unknown>,
        })!;
        const relido = leitura.aptos.find((x) => x.idempotency_key === f.idempotency_key)!;
        const semInstante = (e: EventEnvelope) => ({ ...e, occurred_at: "(comparado como instante)" });
        assert.deepEqual(semInstante(relido), semInstante(vivo), `${f.idempotency_key}: relido diverge do vivo`);
        assert.equal(Date.parse(relido.occurred_at), Date.parse(vivo.occurred_at));
      }
    });

    await teste("P6 a grafia que o log NÃO preserva: mesmo instante, texto canônico — declarado", async () => {
      const f = novos[3];
      const e = leitura.aptos.find((x) => x.idempotency_key === f.idempotency_key)!;
      assert.equal(f.occurred_at, "2026-09-23T09:00:00-03:00");
      assert.equal(e.occurred_at, "2026-09-23T12:00:00.000Z");
      assert.equal(Date.parse(e.occurred_at), Date.parse(f.occurred_at));
    });

    await teste("P7 a ordem do banco não importa: normal, invertida e embaralhada dão a MESMA projeção", async () => {
      const agora = new Date("2026-09-23T12:02:00.000Z");
      const resultado = (fatos: EventEnvelope[]) => {
        const m = new MemoriaDaProjecao();
        reconstruirPorReplay(fatos, m, { agora, unit_id: "U-1", source_mode: "real" });
        return projecoes(m, agora);
      };
      const base = resultado(leitura.aptos);
      assert.equal(Object.keys(base).length, 3, `esperava 3 escopos, vieram ${Object.keys(base).join(",")}`);
      const ids = (xs: EventEnvelope[]) => xs.map((x) => x.event_id).join(",");
      // Ordens que COMPROVADAMENTE diferem da original. Embaralhar sem conferir
      // poderia devolver a mesma ordem, e a prova de independência seria vazia.
      const invertida = [...leitura.aptos].reverse();
      const embaralhada = [...leitura.aptos];
      let semente = 7;
      for (let i = embaralhada.length - 1; i > 0; i -= 1) {
        semente = (semente * 16807) % 2147483647;
        const j = semente % (i + 1);
        [embaralhada[i], embaralhada[j]] = [embaralhada[j], embaralhada[i]];
      }
      for (const [nome, ordem] of [["invertida", invertida], ["embaralhada", embaralhada]] as const) {
        assert.notEqual(ids(ordem), ids(leitura.aptos), `a ordem ${nome} é a original — prova vazia`);
        assert.deepEqual(resultado(ordem), base, `a ordem ${nome} mudou a projeção`);
      }
    });

    await teste("P8 modos nunca se misturam: cada escopo só contém fatos do próprio modo", async () => {
      const m = new MemoriaDaProjecao();
      reconstruirPorReplay(leitura.aptos, m, { agora: new Date(), unit_id: "U-1", source_mode: "real" });
      for (const e of m.escopos()) {
        for (const x of m.fatos(e.unit_id, e.source_mode)) {
          assert.equal(x.source_mode, e.source_mode, `${x.event_id} (${x.source_mode}) caiu no escopo ${e.source_mode}`);
          assert.equal(x.unit_id, e.unit_id);
        }
      }
      assert.deepEqual(
        m.escopos().map((e) => `${e.unit_id}|${e.source_mode}`),
        ["U-1|real", "U-1|simulated", "U-2|control"],
      );
    });

    await teste("P9 a porta NÃO ESCREVE: event_log, outbox e job idênticos antes e depois", async () => {
      const contar = async () =>
        (
          await pc.query(
            `SELECT (SELECT count(*) FROM platform.event_log) AS l, (SELECT count(*) FROM platform.outbox) AS o,
                    (SELECT count(*) FROM platform.job) AS j,
                    (SELECT coalesce(sum(attempts),0) FROM platform.outbox) AS a`,
          )
        )[0];
      const antes = await contar();
      await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA);
      await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA);
      assert.deepEqual(await contar(), antes);
    });

    await teste("P11 a fonte é o LOG: outbox purgada e adulterada não mudam uma vírgula da leitura", async () => {
      // A decisão do César em forma executável. A outbox carrega o modo, e por
      // isso é a tentação — mas ela é purgável e mutável (H5). Um replay que
      // lesse dela perderia tudo depois de uma limpeza de rotina, e herdaria
      // qualquer adulteração como se fosse fato.
      const antes = await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA);
      await pc.query(`UPDATE platform.outbox SET payload = jsonb_set(payload, '{source_mode}', '"real"')`);
      await pc.query(`DELETE FROM platform.outbox WHERE idempotency_key = $1`, [novos[0].idempotency_key]);
      const depois = await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA);
      assert.deepEqual(depois, antes, "a leitura mudou quando só a outbox mudou");
      await pc.query(`DELETE FROM platform.outbox`);
      assert.deepEqual(
        await lerFatosParaReplay(pc, TIPOS_DA_OPERACAO_VIVA),
        antes,
        "com a outbox VAZIA a leitura mudou — ela não vinha do log",
      );
    });
  } finally {
    await porta.descartar();
  }

  /* Corrupção: só num banco onde a restrição foi removida de propósito. */
  const corrompido = await bancoIsolado();
  try {
    await teste("P10 modo fora do contrato é CORRUPÇÃO: fica fora, com motivo — nunca normalizado", async () => {
      await corrompido.cliente.query(
        `ALTER TABLE platform.event_log DROP CONSTRAINT event_log_source_mode_obrigatorio`,
      );
      await corrompido.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
            payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
         VALUES ('ev-podre','U','trip','t','trip_created','{}'::jsonb, now(),'system','k-podre','x@1','REAL')`,
      );
      const l = await lerFatosParaReplay(corrompido.cliente, TIPOS_DA_OPERACAO_VIVA);
      assert.equal(l.aptos.length, 0, "'REAL' virou 'real' — coerção silenciosa");
      assert.equal(l.corrompidas.length, 1);
      assert.match(l.corrompidas[0].motivo, /fora do contrato/);
    });
  } finally {
    await corrompido.descartar();
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total}`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length > 0) {
    console.error("\nQ016_RED");
    process.exit(1);
  }
  console.log("\nQ016_GREEN");
})().catch((e: unknown) => {
  console.error("falha ao executar a suíte Q-016:", e);
  process.exit(1);
});
