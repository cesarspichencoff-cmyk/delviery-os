/**
 * B5 — prova PostgreSQL real da fila offline.
 *
 * Cria banco isolado, aplica migrations 0001..0009 pelo runner real, aplica
 * papeis_minimos.sql com nomes exclusivos desta execucao e prova:
 *  - somente as tres colunas de telemetria sao atualizaveis pelo critico;
 *  - zero/valores reais atravessam PgDeviceRegistry -> leitura -> Product System;
 *  - revogacao concorrente impede UPDATE;
 *  - constraints recusam contadores invalidos.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado, urlCom } from "./banco-isolado";
import { createPgClient, type PgSqlClient } from "./persistence/sql-client";
import { PgDeviceRegistry } from "./persistence/pg-repositories";
import { lerRealidadeDeEntregas } from "./leitura/realidade-de-entregas";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("DELIVERYOS_PG_URL_REQUIRED");
  process.exit(78);
}

const sufixo = `${process.pid}_${Date.now().toString(36)}`;
const CRIT = `b5_crit_${sufixo}`;
const ASY = `b5_async_${sufixo}`;
const SRC = `b5_src_${sufixo}`;
const PILOT = `b5_pilot_${sufixo}`;

function urlComo(base: string, usuario: string, banco: string): string {
  const u = new URL(urlCom(base, banco));
  u.username = usuario;
  u.password = "";
  return u.toString();
}

function erroComCodigo(e: unknown, codigo: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === codigo;
}

async function deveFalhar(
  nome: string,
  fn: () => Promise<unknown>,
  codigo: string,
): Promise<void> {
  try {
    await fn();
    assert.fail(`${nome}: operacao proibida passou`);
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    assert.ok(erroComCodigo(e, codigo), `${nome}: codigo inesperado ${String((e as { code?: string })?.code)}`);
  }
}

async function main(): Promise<void> {
  const b = await bancoIsolado(URL_BASE, undefined, "b5queue");
  let critico: PgSqlClient | null = null;
  let adminGlobal: PgSqlClient | null = null;
  let passou = false;

  try {
    const migracao = await b.cliente.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM platform.schema_migration
        WHERE version = '0009_device_offline_queue_depth'`,
    );
    assert.equal(Number(migracao[0]?.n), 1, "migration 0009 nao foi registrada exatamente uma vez");

    const colunas = await b.cliente.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema='identity' AND table_name='device'
          AND column_name LIKE 'queue_%'
        ORDER BY column_name`,
    );
    assert.deepEqual(
      colunas.map((x) => String(x.column_name)),
      ["queue_depth_reported_at", "queue_pending_events", "queue_pending_points"],
      "surface de fila no banco ganhou coluna extra",
    );

    await b.cliente.query(
      `INSERT INTO identity.unit(unit_id, display_name)
       VALUES ('ITAIM', 'Itaim')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.actor(actor_id, unit_id, role, label)
       VALUES ('rider-b5', 'ITAIM', 'motoboy_interno', 'Rider B5')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.device(
         device_id, unit_id, actor_id, label, secret_hash, secret_bound_at
       ) VALUES ('device-b5-pg', 'ITAIM', 'rider-b5', 'Aparelho B5 PG', 'fixturehash', now())`,
    );

    const papeis = readFileSync(join(process.cwd(), "deploy/sql/papeis_minimos.sql"), "utf8")
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", SRC)
      .replaceAll("deliveryos_entregas_pilot", PILOT);
    await b.cliente.query(papeis);

    critico = await createPgClient({
      url: urlComo(URL_BASE, CRIT, b.nome),
      max: 1,
    });

    const registro = new PgDeviceRegistry(critico);

    const antes = await lerRealidadeDeEntregas(critico, {
      agora: new Date("2026-10-06T09:00:00.000Z"),
      unit_id: "ITAIM",
    });
    assert.equal(antes.aparelhos[0]?.fila_offline, null, "ausencia inicial virou zero");

    const gravou = await registro.registrarFilaOffline("device-b5-pg", {
      pending_points: 7,
      pending_events: 3,
      agora: new Date("2026-10-06T09:01:00.000Z"),
    });
    assert.equal(gravou, true);

    const depois = await lerRealidadeDeEntregas(critico, {
      agora: new Date("2026-10-06T09:01:01.000Z"),
      unit_id: "ITAIM",
    });
    assert.deepEqual(depois.aparelhos[0]?.fila_offline, {
      pending_points: 7,
      pending_events: 3,
      reportada_em: "2026-10-06T09:01:00.000Z",
    });

    // Falha de ordem: dois requests autenticados podem terminar fora de ordem.
    // O snapshot mais antigo NAO pode substituir o mais recente, inclusive
    // se o sistema gerar dois carimbos identicos no mesmo milissegundo.
    for (const antigo of [
      new Date("2026-10-06T09:00:30.000Z"),
      new Date("2026-10-06T09:01:00.000Z"),
    ]) {
      assert.equal(await registro.registrarFilaOffline("device-b5-pg", {
        pending_points: 99,
        pending_events: 88,
        agora: antigo,
      }), true, "request antigo de aparelho ativo continua autorizado");
      const atual = await lerRealidadeDeEntregas(critico, {
        agora: new Date("2026-10-06T09:01:01.000Z"), unit_id: "ITAIM",
      });
      assert.deepEqual(atual.aparelhos[0]?.fila_offline, {
        pending_points: 7,
        pending_events: 3,
        reportada_em: "2026-10-06T09:01:00.000Z",
      }, "snapshot antigo/empate nao pode regredir fila e tempo");
    }

    // Um relato autenticamente posterior deve ser aceito, inclusive zero.
    assert.equal(await registro.registrarFilaOffline("device-b5-pg", {
      pending_points: 0,
      pending_events: 0,
      agora: new Date("2026-10-06T09:01:30.000Z"),
    }), true);
    const zerou = await lerRealidadeDeEntregas(critico, {
      agora: new Date("2026-10-06T09:01:31.000Z"), unit_id: "ITAIM",
    });
    assert.deepEqual(zerou.aparelhos[0]?.fila_offline, {
      pending_points: 0, pending_events: 0, reportada_em: "2026-10-06T09:01:30.000Z",
    }, "zero posterior e medicao real, nao ausencia");

    assert.equal(await registro.registrarFilaOffline("device-b5-pg", {
      pending_points: 7, pending_events: 3,
      agora: new Date("2026-10-06T09:01:45.000Z"),
    }), true);

    await deveFalhar(
      "critico nao pode revogar",
      () => critico!.query(`UPDATE identity.device SET revoked_at=now() WHERE device_id='device-b5-pg'`),
      "42501",
    );
    await deveFalhar(
      "critico nao pode mudar unidade",
      () => critico!.query(`UPDATE identity.device SET unit_id='OUTRA' WHERE device_id='device-b5-pg'`),
      "42501",
    );
    await deveFalhar(
      "critico nao pode mudar segredo",
      () => critico!.query(`UPDATE identity.device SET secret_hash='x' WHERE device_id='device-b5-pg'`),
      "42501",
    );
    await deveFalhar(
      "constraint recusa contador negativo",
      () => critico!.query(
        `UPDATE identity.device SET queue_pending_points=-1 WHERE device_id='device-b5-pg'`,
      ),
      "23514",
    );
    await deveFalhar(
      "constraint recusa contador acima do contrato",
      () => critico!.query(
        `UPDATE identity.device SET queue_pending_events=1000001 WHERE device_id='device-b5-pg'`,
      ),
      "23514",
    );

    // Corrida de revogacao: auth poderia ter passado antes, mas o writer
    // condicionado precisa falhar fechado depois que o humano revogou.
    await b.cliente.query(
      `UPDATE identity.device SET revoked_at=now(), revoked_by='fixture-b5'
        WHERE device_id='device-b5-pg'`,
    );
    const depoisDaRevogacao = await registro.registrarFilaOffline("device-b5-pg", {
      pending_points: 99,
      pending_events: 99,
      agora: new Date("2026-10-06T09:02:00.000Z"),
    });
    assert.equal(depoisDaRevogacao, false);

    const linha = await b.cliente.query<{
      queue_pending_points: number;
      queue_pending_events: number;
    }>(
      `SELECT queue_pending_points, queue_pending_events
         FROM identity.device WHERE device_id='device-b5-pg'`,
    );
    assert.equal(Number(linha[0]?.queue_pending_points), 7);
    assert.equal(Number(linha[0]?.queue_pending_events), 3);

    console.log("B5_QUEUE_DEPTH_PG: 12/12 PASS");
    passou = true;
  } finally {
    await critico?.close().catch(() => undefined);
    await b.descartar().catch(() => undefined);

    // Papeis sao globais no cluster; apagar somente os quatro nomes que esta
    // execucao criou, depois do banco proprio ter sido descartado.
    adminGlobal = await createPgClient({ url: urlCom(URL_BASE, "postgres"), max: 1 });
    try {
      for (const papel of [CRIT, ASY, SRC, PILOT]) {
        await adminGlobal.query(`DROP ROLE IF EXISTS ${papel}`).catch(() => undefined);
      }
    } finally {
      await adminGlobal.close().catch(() => undefined);
    }
  }

  if (!passou) process.exit(1);
}

void main();
