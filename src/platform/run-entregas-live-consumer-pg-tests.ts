/**
 * Consumer live-capable de Entregas contra PostgreSQL REAL.
 *
 * Prova a janela de crash que importa:
 *   fato+outbox confirmam -> checkpoint falha -> processo reinicia -> replay
 *
 * O replay precisa ser reconhecido como duplicata pelo banco, sem duplicar
 * event_log nem outbox. Checkpoint é cursor; event_log é a verdade durável.
 */

import assert from "node:assert/strict";

import type { EntregasEventFeed } from "../entregas/contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import { bancoIsolado, type BancoIsolado } from "./banco-isolado";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import {
  EntregasLiveConsumer,
  type ConsumerCheckpointState,
  type ConsumerStateStore,
  type LiveConsumerControl,
} from "./runtime/entregas-live-consumer";

const PG_URL = process.env.DELIVERYOS_PG_URL;
const NOW = new Date("2026-09-30T21:45:00.000Z");

let passed = 0;
const failures: string[] = [];

async function testCase(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(
      name + ": " + (e instanceof Error ? e.message : String(e)),
    );
  }
}

function evento(id: string): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: "trip_started",
    schema_version: "1.0.0",
    occurred_at: "2026-09-30T21:00:00.000Z",
    recorded_at: "2026-09-30T21:00:01.000Z",
    idempotency_key: "public-" + id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: "ITAIM",
    source_mode: "simulated",
    trip_id: "T-PG",
    payload: {},
    correlation_id: "T-PG",
    contract_version: "COR-ENTREGAS-V1@1.0.3",
  };
}

class ArrayFeed implements EntregasEventFeed {
  constructor(readonly events: EntregasPublicEvent[]) {}

  async list(o?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    const start = o?.after_event_id
      ? this.events.findIndex((e) => e.event_id === o.after_event_id) + 1
      : 0;
    const rest = this.events.slice(Math.max(0, start));
    return o?.limit ? rest.slice(0, o.limit) : rest;
  }

  async poll(cursor: string | null, limit = 50) {
    const events = await this.list({
      after_event_id: cursor ?? undefined,
      limit,
    });
    return {
      events,
      next_cursor: events.length
        ? events[events.length - 1].event_id
        : cursor,
    };
  }
}

class StateComFalha implements ConsumerStateStore {
  value: ConsumerCheckpointState = {
    version: 1,
    checkpoint: null,
    isolated_count: 0,
    updated_at: null,
  };

  failNextSave = true;

  async load(): Promise<ConsumerCheckpointState> {
    return { ...this.value };
  }

  async save(v: ConsumerCheckpointState): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("checkpoint_failure_injected");
    }
    this.value = { ...v };
  }
}

class RunControl implements LiveConsumerControl {
  async canRun(): Promise<boolean> {
    return true;
  }
}

async function contar(
  banco: BancoIsolado,
  tabela: "platform.event_log" | "platform.outbox",
  chave: string,
): Promise<number> {
  const r = await banco.cliente.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM " +
      tabela +
      " WHERE idempotency_key = $1",
    [chave],
  );
  return Number(r[0]?.n ?? 0);
}

async function main(): Promise<void> {
  console.log(
    "\n=== ENTREGAS LIVE CONSUMER — POSTGRESQL PRE-ACTIVATION ===\n",
  );

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — replay durável NÃO foi provado.",
    );
    return;
  }

  let banco: BancoIsolado | null = null;
  try {
    banco = await bancoIsolado(
      PG_URL,
      undefined,
      "entregas_live_consumer",
    );

    await testCase(
      "LCPG1 commit durável + falha de checkpoint deixa exatamente 1 fato e 1 outbox",
      async () => {
        const state = new StateComFalha();
        const feed = new ArrayFeed([evento("pg-e1")]);
        const writer = new PgTransactionalWriter(banco!.cliente);

        const consumer = new EntregasLiveConsumer({
          enabled: true,
          feed,
          writer,
          state,
          control: new RunControl(),
          now: () => NOW,
        });

        const r = await consumer.tick();
        assert.equal(r.status, "failed");
        assert.match(r.error ?? "", /checkpoint_write_failed/);
        assert.equal(state.value.checkpoint, null);

        assert.equal(
          await contar(
            banco!,
            "platform.event_log",
            "entregas-public:public-pg-e1",
          ),
          1,
        );
        assert.equal(
          await contar(
            banco!,
            "platform.outbox",
            "entregas-public:public-pg-e1",
          ),
          1,
        );
      },
    );

    await testCase(
      "LCPG2 restart relê evento, banco deduplica e checkpoint avança",
      async () => {
        const state = new StateComFalha();
        state.failNextSave = false;
        const feed = new ArrayFeed([evento("pg-e2")]);
        const writer = new PgTransactionalWriter(banco!.cliente);

        // Primeiro processo: commit acontece e checkpoint falha.
        state.failNextSave = true;
        const a = new EntregasLiveConsumer({
          enabled: true,
          feed,
          writer,
          state,
          control: new RunControl(),
          now: () => NOW,
        });
        const ra = await a.tick();
        assert.equal(ra.status, "failed");
        assert.equal(state.value.checkpoint, null);

        // Novo processo, mesmo feed e mesmo banco.
        const b = new EntregasLiveConsumer({
          enabled: true,
          feed,
          writer,
          state,
          control: new RunControl(),
          now: () => NOW,
        });
        const rb = await b.tick();

        assert.equal(rb.status, "worked");
        assert.equal(rb.ingested, 0);
        assert.equal(rb.duplicates, 1);
        assert.equal(state.value.checkpoint, "pg-e2");

        const chave = "entregas-public:public-pg-e2";
        assert.equal(
          await contar(banco!, "platform.event_log", chave),
          1,
        );
        assert.equal(
          await contar(banco!, "platform.outbox", chave),
          1,
        );
      },
    );

    await testCase(
      "LCPG3 replay mantém source_mode SIMULATED no fato e na outbox",
      async () => {
        const fatos = await banco!.cliente.query<{
          source_mode: string;
        }>(
          "SELECT source_mode FROM platform.event_log " +
            "WHERE idempotency_key = $1",
          ["entregas-public:public-pg-e2"],
        );
        assert.equal(fatos[0]?.source_mode, "simulated");

        const msgs = await banco!.cliente.query<{
          source_mode: string | null;
        }>(
          "SELECT payload->>'source_mode' AS source_mode " +
            "FROM platform.outbox WHERE idempotency_key = $1",
          ["entregas-public:public-pg-e2"],
        );
        assert.equal(msgs[0]?.source_mode, "simulated");
      },
    );
  } finally {
    if (banco) await banco.descartar();
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log(
    "\nENTREGAS_LIVE_CONSUMER_PG: " + passed + "/3 PASS",
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
