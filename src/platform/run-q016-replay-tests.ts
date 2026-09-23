/**
 * Q-016 — A PROJEÇÃO DA OPERAÇÃO VIVA SOBREVIVE AO REINÍCIO.
 * ============================================================================
 * Decisão do César: `platform.event_log` é a fonte durável que governa a
 * reconstrução, e o runtime assíncrono a executa no boot, antes do laço.
 *
 * FASE 1 — O GAP, PROVADO ANTES DE QUALQUER CORREÇÃO
 * --------------------------------------------------
 * O `EventEnvelope` carrega `source_mode`, a mensagem da outbox carrega
 * `source_mode`, e o `platform.event_log` NÃO. Um replay a partir do log, hoje,
 * só reconstruiria os escopos real/simulated/control inventando o modo.
 *
 * Esta seção não lê código à procura de uma coluna ausente. Ela INGERE fatos
 * pelo caminho real — `ingerir()` com o `PgTransactionalWriter` que o binário
 * crítico usa, contra PostgreSQL real — e mede o que ficou gravado.
 *
 * O instrumento central é uma comparação de linhas, e comparação sem controle
 * é opinião. Por isso dois controles:
 *   - a comparação ENXERGA diferença quando o log preserva o campo que difere;
 *   - a diferença de modo EXISTIA na entrada, e chegou à outbox.
 * Só com os dois de pé "as linhas são iguais" significa "o modo se perdeu".
 *
 * Banco ISOLADO por execução: criado aqui, migrado pelo runner real, apagado
 * no fim. Suíte que presume banco vazio e roda num compartilhado reprova o
 * produto por um fato do ambiente — foi o que o `spine:processos` fez no PB19.
 *
 * Exige `DELIVERYOS_PG_URL`. Sem banco, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";

import type { EventEnvelope, SourceMode } from "./contracts/event-catalog";
import { ingerir } from "./ingest/ingest-service";
import { runMigrations } from "./migrations/runner";
import { diretorioDeMigrations } from "./migrations/localizar";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import { createPgClient, type PgSqlClient } from "./persistence/sql-client";
import { envelopeDaMensagem } from "./projections/consumidor";

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
 * Banco isolado
 * ------------------------------------------------------------------ */

function urlCom(base: string, banco: string): string {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

async function bancoIsolado(): Promise<{ url: string; cliente: PgSqlClient; descartar(): Promise<void> }> {
  const nome = `q016_${process.pid}_${Date.now().toString(36)}`;
  const admin = await createPgClient({ url: urlCom(URL_PG, "postgres"), max: 1 });
  await admin.query(`CREATE DATABASE ${nome}`);
  const url = urlCom(URL_PG, nome);
  const cliente = await createPgClient({ url, max: 4 });
  const m = await runMigrations(cliente, diretorioDeMigrations());
  if (m.mismatch) throw new Error(`migration divergente no banco isolado: ${m.mismatch.version}`);
  return {
    url,
    cliente,
    async descartar() {
      await cliente.close();
      await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await admin.close();
    },
  };
}

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
    console.log("1. O GAP — antes de qualquer correção");

    // Dois fatos IDÊNTICOS em tudo que o domínio descreve, diferentes só no
    // modo. Se o log os distingue, o modo sobreviveu. Se não distingue,
    // nenhuma função da linha consegue devolver o modo certo para os dois.
    const A = fato({ modo: "real" });
    const B = fato({ modo: "simulated" });

    await teste("G1 os dois fatos ENTRAM pelo caminho real, cada um com o seu modo", async () => {
      const r = await ingerir([A, B], { escritor, recebido_em });
      assert.equal(r.aceito, true, `ingestão recusou: ${JSON.stringify(r.recusados)}`);
      assert.equal(r.gravados, 2, "os dois fatos precisavam ser gravados");
      assert.equal(r.mensagens, 2, "os dois fatos precisavam gerar mensagem");
    });

    await teste("G2 controle: a diferença de modo EXISTIA na entrada e chegou à outbox", async () => {
      const pa = await payloadDaOutbox(A.idempotency_key);
      const pb = await payloadDaOutbox(B.idempotency_key);
      assert.equal(pa.source_mode, "real");
      assert.equal(pb.source_mode, "simulated");
      assert.deepEqual(
        diferencas(pa, pb, IDENTIDADE_OUTBOX),
        ["source_mode"],
        "na outbox os dois fatos deviam diferir EXATAMENTE no modo",
      );
    });

    await teste("G3 o schema do event_log não tem coluna de modo", async () => {
      const colunas = (
        await cliente.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'platform' AND table_name = 'event_log'`,
        )
      ).map((c) => String(c.column_name));
      assert.ok(colunas.length > 10, `leitura do schema vazia — instrumento quebrado: ${colunas.join(",")}`);
      assert.deepEqual(
        colunas.filter((c) => /mode|modo/i.test(c)),
        [],
        "existe coluna de modo — o gap já não é o que esta fase descreve",
      );
    });

    await teste("G4 controle: a comparação ENXERGA diferença que o log preserva", async () => {
      // Sem este controle, "as linhas são iguais" poderia significar só que a
      // comparação é cega. Aqui dois fatos diferem em `sequence`, que o log
      // grava — e a comparação precisa apontar exatamente essa coluna.
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

    await teste("G5 O GAP: no event_log, o fato real e o simulado são a MESMA linha", async () => {
      const la = await linhaDoLog(A.idempotency_key);
      const lb = await linhaDoLog(B.idempotency_key);
      assert.deepEqual(
        diferencas(la, lb, IDENTIDADE_LOG),
        [],
        "as linhas diferem — o log guarda algo que separa os modos, e o gap não é o descrito",
      );
      // Consequência direta: qualquer função linha→modo devolve o MESMO modo
      // para as duas, e erra pelo menos uma. Não há heurística que salve isso.
    });

    await teste("G6 o modo também não se esconde no payload gravado", async () => {
      const la = await linhaDoLog(A.idempotency_key);
      const lb = await linhaDoLog(B.idempotency_key);
      assert.equal(temChaveDeModo(la), false, "achei source_mode dentro da linha de A");
      assert.equal(temChaveDeModo(lb), false, "achei source_mode dentro da linha de B");
      // Controle do mesmo instrumento: na outbox ele ACHA.
      assert.equal(temChaveDeModo(await payloadDaOutbox(A.idempotency_key)), true, "instrumento cego");
    });

    await teste("G7 o contrato de reconstrução RECUSA a linha do log: completá-la exigiria inventar o modo", async () => {
      // `envelopeDaMensagem` é a reconstrução que o consumidor já usa, e exige
      // `source_mode` entre os campos mínimos. Entregar a ele a linha do log
      // é exatamente o que um replay faria hoje.
      const la = await linhaDoLog(A.idempotency_key);
      const comoMensagem = {
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
        } as Record<string, unknown>,
      };
      assert.equal(envelopeDaMensagem(comoMensagem), null, "o consumidor aceitou envelope sem modo");
      // Controle: com o modo que ESTAVA na outbox, a mesma linha reconstrói.
      comoMensagem.payload.source_mode = (await payloadDaOutbox(A.idempotency_key)).source_mode;
      assert.ok(envelopeDaMensagem(comoMensagem), "nem com o modo a linha reconstrói — o controle não vale");
    });
  } finally {
    await banco.descartar();
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
