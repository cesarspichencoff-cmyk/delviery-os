/**
 * Repositórios PostgreSQL contra um banco real.
 *
 * A suíte em memória descreve a semântica; esta prova que o SQL entrega a
 * mesma coisa. As duas precisam existir: a de memória roda em qualquer lugar e
 * é rápida, esta roda onde há banco e é a única que vale como evidência.
 *
 * Sem `DELIVERYOS_PG_URL` o arquivo se declara PULADO e sai com sucesso —
 * dizendo isso em voz alta, para que ausência de banco nunca seja lida como
 * aprovação.
 */

import assert from "node:assert/strict";
import { DEFAULT_RETRY } from "./contracts/messaging";
import type { Job, OutboxMessage } from "./contracts/messaging";
import {
  PgInboxRepository,
  PgJobRepository,
  PgOutboxRepository,
  PgTransactionalWriter,
  type FactRecord,
} from "./persistence/pg-repositories";
import { createPgClient, isLocalUrl, type PgSqlClient } from "./persistence/sql-client";

const PG_URL = process.env.DELIVERYOS_PG_URL;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const AGORA = new Date("2026-07-26T18:00:00.000Z");

function mensagem(id: string, extra: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    outbox_id: id,
    stream: "entregas",
    kind: "trip_created",
    payload: { trip_id: "t-1" },
    idempotency_key: `ik-${id}`,
    correlation_id: `corr-${id}`,
    created_at: AGORA.toISOString(),
    state: "pending",
    attempts: 0,
    available_at: AGORA.toISOString(),
    ...extra,
  };
}

function trabalho(id: string, extra: Partial<Job> = {}): Job {
  return {
    job_id: id,
    kind: "reprojetar",
    payload: {},
    idempotency_key: `jk-${id}`,
    state: "pending",
    attempts: 0,
    max_attempts: 3,
    available_at: AGORA.toISOString(),
    created_at: AGORA.toISOString(),
    ...extra,
  };
}

async function main(): Promise<void> {
  console.log("=== Repositórios PostgreSQL (banco real) ===");

  // A recusa de TLS não depende de banco nenhum: é decisão de configuração e
  // roda sempre, inclusive na máquina sem PostgreSQL.
  await test("conexão remota sem TLS é recusada no boot", async () => {
    await assert.rejects(
      () => createPgClient({ url: "postgres://u:s@banco.exemplo.com:5432/deliveryos", ssl: false }),
      /sem TLS recusada/,
    );
  });

  await test("localhost é reconhecido e dispensa TLS", async () => {
    assert.equal(isLocalUrl("postgres://u:s@127.0.0.1:5432/d"), true);
    assert.equal(isLocalUrl("postgres://u:s@localhost:5432/d"), true);
    assert.equal(isLocalUrl("postgres://u:s@db.supabase.co:5432/d"), false);
  });

  if (!PG_URL) {
    console.log("PULADO: DELIVERYOS_PG_URL não definida — os repositórios não foram exercitados.");
    console.log(`(${passed} verificações de configuração passaram, ${failures.length} falharam)`);
    if (failures.length) {
      for (const f of failures) console.error(` - ${f}`);
      process.exit(1);
    }
    process.exit(0);
  }

  let cliente: PgSqlClient;
  try {
    cliente = await createPgClient({ url: PG_URL, max: 4 });
    await cliente.query("SELECT 1");
  } catch (e) {
    console.error(`FALHA: não conectou em DELIVERYOS_PG_URL — ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const limpar = async () => {
    await cliente.query("DELETE FROM platform.outbox");
    await cliente.query("DELETE FROM platform.job");
    await cliente.query("DELETE FROM platform.inbox");
    await cliente.query("DELETE FROM platform.audit");
    // TRUNCATE, e não DELETE: o event_log é append-only por trigger de linha,
    // e a própria limpeza do teste bate nessa trava. É a confirmação de que a
    // proteção vale para todo mundo — inclusive para quem escreveu o teste.
    await cliente.query("TRUNCATE platform.event_log");
  };

  try {
    /* --------------------------- inbox --------------------------- */

    await test("inbox aceita o primeiro e reconhece a retentativa como duplicata", async () => {
      await limpar();
      const inbox = new PgInboxRepository(cliente);
      const reg = {
        idempotency_key: "gps:d1:t1:0001",
        unit_id: "ITAIM",
        source: "android",
        kind: "gps_point",
        payload: { lat: -23.5 },
        occurred_at: "2026-07-26T17:59:00.000Z",
        received_at: AGORA.toISOString(),
        sequence_local: 41,
        device_id: "d1",
      };

      const primeiro = await inbox.accept(reg);
      assert.equal(primeiro.accepted, true);

      // Mesma chave, carimbo de recebimento diferente: é a retentativa do
      // aparelho depois da rede voltar.
      const segundo = await inbox.accept({ ...reg, received_at: "2026-07-26T18:05:00.000Z" });
      assert.equal(segundo.accepted, false);
      assert.equal(segundo.accepted === false && segundo.reason, "duplicate");
      assert.equal(
        segundo.accepted === false && segundo.reason === "duplicate" && segundo.existing_received_at,
        AGORA.toISOString(),
        "a duplicata precisa devolver o recebimento ORIGINAL",
      );

      const n = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.inbox",
      );
      assert.equal(Number(n[0].n), 1, "a retentativa criou uma segunda linha");
    });

    await test("inbox preserva occurred_at e received_at separados", async () => {
      const inbox = new PgInboxRepository(cliente);
      const achado = await inbox.find("gps:d1:t1:0001");
      assert.ok(achado);
      assert.equal(achado.occurred_at, "2026-07-26T17:59:00.000Z");
      assert.equal(achado.received_at, AGORA.toISOString());
      assert.notEqual(achado.occurred_at, achado.received_at);
      assert.equal(achado.sequence_local, 41);
    });

    await test("inbox recusa registro sem chave de idempotência", async () => {
      const inbox = new PgInboxRepository(cliente);
      const r = await inbox.accept({
        idempotency_key: "  ",
        unit_id: "ITAIM",
        source: "android",
        kind: "x",
        payload: {},
        occurred_at: AGORA.toISOString(),
        received_at: AGORA.toISOString(),
      });
      assert.equal(r.accepted, false);
      assert.equal(r.accepted === false && r.reason, "invalid");
    });

    /* -------------------------- outbox --------------------------- */

    await test("outbox entrega cada mensagem a um worker só", async () => {
      await limpar();
      const outbox = new PgOutboxRepository(cliente);
      for (let i = 0; i < 6; i += 1) await outbox.enqueue(mensagem(`o-${i}`));

      const a = await outbox.claim("w1", 4, AGORA);
      const b = await outbox.claim("w2", 4, AGORA);
      assert.equal(a.length, 4);
      assert.equal(b.length, 2);
      const ids = [...a, ...b].map((m) => m.outbox_id);
      assert.equal(new Set(ids).size, 6);
      assert.equal(await outbox.pendingCount(), 0);
    });

    await test("markDone tira da fila e limpa a reserva", async () => {
      const outbox = new PgOutboxRepository(cliente);
      await outbox.markDone("o-0", AGORA);
      const r = await cliente.query<{ state: string; locked_by: string | null }>(
        "SELECT state, locked_by FROM platform.outbox WHERE outbox_id='o-0'",
      );
      assert.equal(r[0].state, "done");
      assert.equal(r[0].locked_by, null);
    });

    await test("falha adia com backoff e não perde a mensagem", async () => {
      const outbox = new PgOutboxRepository(cliente);
      const decisao = await outbox.markFailed("o-1", "destino fora do ar", DEFAULT_RETRY, AGORA);
      assert.equal(decisao, "retry");

      const r = await cliente.query<{ state: string; attempts: number; available_at: Date }>(
        "SELECT state, attempts, available_at FROM platform.outbox WHERE outbox_id='o-1'",
      );
      assert.equal(r[0].state, "pending");
      assert.equal(Number(r[0].attempts), 1);
      assert.ok(
        new Date(r[0].available_at).getTime() > AGORA.getTime(),
        "a mensagem voltou disponível imediatamente — não houve backoff",
      );
    });

    await test("mensagem esgotada vira dead-letter, e não some", async () => {
      const outbox = new PgOutboxRepository(cliente);
      const politica = { ...DEFAULT_RETRY, max_attempts: 3 };
      let ultima: "retry" | "dead" = "retry";
      for (let i = 0; i < 3; i += 1) {
        ultima = await outbox.markFailed("o-2", "erro persistente", politica, AGORA);
      }
      assert.equal(ultima, "dead");
      const mortas = await outbox.deadLetters(10);
      assert.equal(mortas.length, 1);
      assert.equal(mortas[0].outbox_id, "o-2");
      assert.equal(mortas[0].last_error, "erro persistente");
    });

    await test("reprocessar dead-letter exige dono e fica registrado na auditoria", async () => {
      const outbox = new PgOutboxRepository(cliente);
      const ok = await outbox.requeue("o-2", "cesar", AGORA);
      assert.equal(ok, true);

      const r = await cliente.query<{ state: string; attempts: number }>(
        "SELECT state, attempts FROM platform.outbox WHERE outbox_id='o-2'",
      );
      assert.equal(r[0].state, "pending");
      assert.equal(Number(r[0].attempts), 0);

      const auditoria = await cliente.query<{ actor_id: string; action: string }>(
        "SELECT actor_id, action FROM platform.audit WHERE object_id='o-2'",
      );
      assert.equal(auditoria.length, 1, "reprocessamento manual sem registro de auditoria");
      assert.equal(auditoria[0].actor_id, "cesar");
      assert.equal(auditoria[0].action, "outbox_requeue");
    });

    await test("requeue não ressuscita mensagem que não está morta", async () => {
      const outbox = new PgOutboxRepository(cliente);
      assert.equal(await outbox.requeue("o-0", "cesar", AGORA), false);
    });

    /* ---------------------------- jobs --------------------------- */

    await test("agendar o mesmo trabalho duas vezes não duplica", async () => {
      await limpar();
      const jobs = new PgJobRepository(cliente);
      await jobs.schedule(trabalho("j-1"));
      await jobs.schedule({ ...trabalho("j-1-outro"), idempotency_key: "jk-j-1" });
      assert.equal(await jobs.pendingCount(), 1);
    });

    await test("claim reserva com lease e conta a tentativa", async () => {
      const jobs = new PgJobRepository(cliente);
      const pegos = await jobs.claim("w1", 5, DEFAULT_RETRY, AGORA);
      assert.equal(pegos.length, 1);
      assert.equal(pegos[0].attempts, 1, "quem pega, gasta a tentativa");
      assert.ok(pegos[0].lease_expires_at);
      assert.equal(
        new Date(pegos[0].lease_expires_at as string).getTime(),
        AGORA.getTime() + DEFAULT_RETRY.lease_ms,
      );
      // Um segundo worker não pode pegar o mesmo job.
      assert.equal((await jobs.claim("w2", 5, DEFAULT_RETRY, AGORA)).length, 0);
    });

    await test("lease vencido devolve o job SEM cobrar tentativa", async () => {
      const jobs = new PgJobRepository(cliente);
      const antes = await cliente.query<{ attempts: number }>(
        "SELECT attempts FROM platform.job WHERE job_id='j-1'",
      );

      const depois = new Date(AGORA.getTime() + DEFAULT_RETRY.lease_ms + 1_000);
      assert.equal(await jobs.reclaimExpired(depois), 1);

      const agora = await cliente.query<{ state: string; attempts: number; locked_by: string | null }>(
        "SELECT state, attempts, locked_by FROM platform.job WHERE job_id='j-1'",
      );
      assert.equal(agora[0].state, "pending");
      assert.equal(agora[0].locked_by, null);
      assert.equal(
        Number(agora[0].attempts),
        Number(antes[0].attempts),
        "worker morto não é falha de negócio: a tentativa não pode ser cobrada",
      );
    });

    await test("lease vivo não é recuperado", async () => {
      const jobs = new PgJobRepository(cliente);
      await jobs.claim("w1", 5, DEFAULT_RETRY, AGORA);
      const dentroDoPrazo = new Date(AGORA.getTime() + 1_000);
      assert.equal(await jobs.reclaimExpired(dentroDoPrazo), 0);
    });

    await test("job esgota tentativas e vai para dead-letter", async () => {
      await limpar();
      const jobs = new PgJobRepository(cliente);
      await jobs.schedule(trabalho("j-morre", { max_attempts: 2 }));

      let decisao: "retry" | "dead" = "retry";
      for (let i = 0; i < 2; i += 1) {
        const [j] = await jobs.claim("w1", 1, DEFAULT_RETRY, AGORA);
        assert.ok(j, "o job deveria estar disponível");
        // Disponibiliza de novo para a próxima rodada do teste.
        decisao = await jobs.markFailed(j.job_id, "sempre falha", DEFAULT_RETRY, AGORA);
        // Desfaz o backoff usando o MESMO relógio do claim. `now()` do banco
        // adiantaria a linha para além de AGORA e o job sumiria da fila do
        // teste sem que nada estivesse errado no código sob teste.
        await cliente.query("UPDATE platform.job SET available_at = $2 WHERE job_id = $1", [
          j.job_id,
          AGORA.toISOString(),
        ]);
      }
      assert.equal(decisao, "dead");
      const mortos = await jobs.deadLetters(10);
      assert.equal(mortos.length, 1);
      assert.equal(mortos[0].last_error, "sempre falha");
    });

    /* ------------------- transação fato + mensagem ---------------- */

    const fato = (k: string): FactRecord => ({
      event_id: `ev-${k}`,
      unit_id: "ITAIM",
      object_type: "trip",
      object_id: "t-1",
      event_type: "trip_started",
      payload: {},
      occurred_at: AGORA.toISOString(),
      origin: "device",
      idempotency_key: k,
      contract_version: "COR-ENTREGAS-V1@1.0.3",
    });

    await test("fato e mensagem são gravados juntos", async () => {
      await limpar();
      await cliente.query(
        `INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','TATA Itaim')
         ON CONFLICT (unit_id) DO NOTHING`,
      );
      const writer = new PgTransactionalWriter(cliente);
      const r = await writer.commit([fato("k-1")], [mensagem("o-tx-1")]);
      assert.equal(r.ok, true);

      const eventos = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log",
      );
      const msgs = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.outbox",
      );
      assert.equal(Number(eventos[0].n), 1);
      assert.equal(Number(msgs[0].n), 1);
    });

    await test("falha no meio desfaz os DOIS — nunca fato órfão", async () => {
      const writer = new PgTransactionalWriter(cliente);
      const antesEventos = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log",
      );
      const antesMsgs = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.outbox",
      );

      // O fato é válido; a mensagem tem estado inválido e o CHECK do banco a
      // rejeita depois de o fato já ter sido inserido na transação.
      const r = await writer.commit(
        [fato("k-2")],
        [mensagem("o-tx-2", { state: "estado_inventado" as OutboxMessage["state"] })],
      );
      assert.equal(r.ok, false);
      assert.equal(r.ok === false && r.code, "storage");

      const depoisEventos = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log",
      );
      const depoisMsgs = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.outbox",
      );
      assert.equal(
        Number(depoisEventos[0].n),
        Number(antesEventos[0].n),
        "o fato sobreviveu sem a mensagem: a garantia do outbox está quebrada",
      );
      assert.equal(Number(depoisMsgs[0].n), Number(antesMsgs[0].n));
    });

    await test("reenvio do mesmo fato não duplica o event log", async () => {
      const writer = new PgTransactionalWriter(cliente);
      const r = await writer.commit([fato("k-1")], []);
      assert.equal(r.ok, true);
      assert.equal(r.ok === true && r.facts, 0, "o fato repetido não deveria contar como gravado");

      const eventos = await cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log WHERE idempotency_key='k-1'",
      );
      assert.equal(Number(eventos[0].n), 1);
    });
  } finally {
    await cliente.close();
  }

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} pg-repository tests OK ===`);
}

void main();
