import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  EntregasEventFeed,
} from "../entregas/contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import type { OutboxMessage } from "./contracts/messaging";
import type {
  EscritorTransacional,
  FatoParaGravar,
} from "./ingest/ingest-service";
import {
  EntregasLiveConsumer,
  FileConsumerStateStore,
  FileLiveConsumerControl,
  type ConsumerCheckpointState,
  type ConsumerStateStore,
  type LiveConsumerControl,
} from "./runtime/entregas-live-consumer";

let passed = 0;
const pending: Promise<void>[] = [];

function test(nome: string, fn: () => Promise<void> | void): void {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed += 1;
        console.log("  ok  " + nome);
      }),
  );
}

const NOW = new Date("2026-09-30T21:30:00.000Z");

function ev(
  id: string,
  type: EntregasPublicEvent["event_type"] = "trip_started",
  extra: Partial<EntregasPublicEvent> = {},
): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: type,
    schema_version: "1.0.0",
    occurred_at: "2026-09-30T21:00:00.000Z",
    recorded_at: "2026-09-30T21:00:01.000Z",
    idempotency_key: "public-" + id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: "ITAIM",
    source_mode: "simulated",
    trip_id: "T1",
    payload: {},
    correlation_id: "T1",
    contract_version: "COR-ENTREGAS-V1@1.0.3",
    ...extra,
  };
}

class ArrayFeed implements EntregasEventFeed {
  polls = 0;

  constructor(readonly events: EntregasPublicEvent[]) {}

  async list(o?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    const idx = o?.after_event_id
      ? this.events.findIndex((e) => e.event_id === o.after_event_id) + 1
      : 0;
    const rest = this.events.slice(Math.max(0, idx));
    return o?.limit ? rest.slice(0, o.limit) : rest;
  }

  async poll(cursor: string | null, limit = 50) {
    this.polls += 1;
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

class Writer implements EscritorTransacional {
  readonly fatos: FatoParaGravar[] = [];
  readonly mensagens: OutboxMessage[] = [];
  beforeCommit?: () => Promise<void> | void;

  async commit(
    fatos: readonly FatoParaGravar[],
    mensagens: readonly OutboxMessage[],
  ) {
    await this.beforeCommit?.();

    const existentes = new Set(this.fatos.map((f) => f.idempotency_key));
    const novos = fatos.filter((f) => !existentes.has(f.idempotency_key));
    this.fatos.push(...novos);

    const novasChaves = new Set(novos.map((f) => f.idempotency_key));
    const novasMensagens = mensagens.filter(
      (m) =>
        novasChaves.has(m.idempotency_key) &&
        !this.mensagens.some(
          (x) => x.idempotency_key === m.idempotency_key,
        ),
    );
    this.mensagens.push(...novasMensagens);

    return {
      ok: true as const,
      facts: novos.length,
      messages: novasMensagens.length,
    };
  }
}

class MemoryState implements ConsumerStateStore {
  value: ConsumerCheckpointState = {
    version: 1,
    checkpoint: null,
    isolated_count: 0,
    updated_at: null,
  };
  failNextSave = false;

  async load() {
    return { ...this.value };
  }

  async save(v: ConsumerCheckpointState) {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("injected_state_failure");
    }
    this.value = { ...v };
  }
}

class MemoryControl implements LiveConsumerControl {
  run = true;
  checks = 0;
  afterChecks?: number;

  async canRun() {
    this.checks += 1;
    if (
      this.afterChecks !== undefined &&
      this.checks > this.afterChecks
    ) {
      this.run = false;
    }
    return this.run;
  }
}

function consumer(o: {
  enabled?: boolean;
  feed?: ArrayFeed;
  writer?: Writer;
  state?: ConsumerStateStore;
  control?: LiveConsumerControl;
  batch_size?: number;
}) {
  const feed = o.feed ?? new ArrayFeed([]);
  const writer = o.writer ?? new Writer();
  const state = o.state ?? new MemoryState();
  const control = o.control ?? new MemoryControl();

  return {
    feed,
    writer,
    state,
    control,
    runtime: new EntregasLiveConsumer({
      enabled: o.enabled ?? true,
      feed,
      writer,
      state,
      control,
      batch_size: o.batch_size ?? 50,
      now: () => NOW,
    }),
  };
}

console.log("\n=== ENTREGAS LIVE CONSUMER — PRE-ACTIVATION ===\n");

test("LC1 feature flag OFF não toca feed nem writer", async () => {
  const x = consumer({
    enabled: false,
    feed: new ArrayFeed([ev("e1")]),
  });
  const r = await x.runtime.tick();
  assert.equal(r.status, "disabled");
  assert.equal(x.feed.polls, 0);
  assert.equal(x.writer.fatos.length, 0);
});

test("LC2 kill switch false não toca feed", async () => {
  const control = new MemoryControl();
  control.run = false;
  const x = consumer({
    feed: new ArrayFeed([ev("e1")]),
    control,
  });
  const r = await x.runtime.tick();
  assert.equal(r.status, "killed");
  assert.equal(x.feed.polls, 0);
});

test(
  "LC3 File kill switch é fail-closed: ausente/STOP param, RUN libera",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "entregas-live-control-"));
    try {
      const path = join(dir, "control");
      const c = new FileLiveConsumerControl(path);
      assert.equal(await c.canRun(), false);

      await writeFile(path, "STOP\n");
      assert.equal(await c.canRun(), false);

      await writeFile(path, "RUN\n");
      assert.equal(await c.canRun(), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "LC4 evento seguro passa pela ingestão transacional antes do checkpoint",
  async () => {
    const x = consumer({
      feed: new ArrayFeed([ev("e1")]),
    });
    const r = await x.runtime.tick();

    assert.equal(r.status, "worked");
    assert.equal(r.ingested, 1);
    assert.equal(x.writer.fatos.length, 1);
    assert.equal(x.writer.mensagens.length, 1);
    assert.equal(
      (x.state as MemoryState).value.checkpoint,
      "e1",
    );
  },
);

test(
  "LC5 tipo sem equivalência é isolado, auditado e checkpoint avança",
  async () => {
    const x = consumer({
      feed: new ArrayFeed([
        ev("e1", "delivery_confirmed", { delivery_id: "D1" }),
      ]),
    });
    const r = await x.runtime.tick();

    assert.equal(r.status, "worked");
    assert.equal(r.isolated, 1);
    assert.equal(x.writer.fatos.length, 0);

    const s = (x.state as MemoryState).value;
    assert.equal(s.checkpoint, "e1");
    assert.equal(s.isolated_count, 1);
    assert.equal(
      s.last_isolation?.reason,
      "tipo_sem_equivalencia_segura",
    );
  },
);

test(
  "LC6 estado em arquivo sobrevive restart e retoma do próximo evento",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "entregas-live-state-"));
    try {
      const file = join(dir, "consumer.json");
      const feed = new ArrayFeed([ev("e1"), ev("e2")]);
      const writer = new Writer();
      const control = new MemoryControl();

      const a = new EntregasLiveConsumer({
        enabled: true,
        feed,
        writer,
        state: new FileConsumerStateStore(file),
        control,
        batch_size: 1,
        now: () => NOW,
      });
      const ra = await a.tick();
      assert.equal(ra.checkpoint, "e1");

      const b = new EntregasLiveConsumer({
        enabled: true,
        feed,
        writer,
        state: new FileConsumerStateStore(file),
        control,
        batch_size: 1,
        now: () => NOW,
      });
      const rb = await b.tick();

      assert.equal(rb.checkpoint, "e2");
      assert.equal(writer.fatos.length, 2);

      const raw = JSON.parse(await readFile(file, "utf8"));
      assert.equal(raw.checkpoint, "e2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "LC7 crash após commit e antes do checkpoint replays sem duplicar",
  async () => {
    const feed = new ArrayFeed([ev("e1")]);
    const writer = new Writer();
    const state = new MemoryState();
    state.failNextSave = true;

    const a = consumer({ feed, writer, state });
    const ra = await a.runtime.tick();

    assert.equal(ra.status, "failed");
    assert.match(ra.error ?? "", /checkpoint_write_failed/);
    assert.equal(writer.fatos.length, 1);
    assert.equal(state.value.checkpoint, null);

    const b = consumer({ feed, writer, state });
    const rb = await b.runtime.tick();

    assert.equal(rb.status, "worked");
    assert.equal(rb.duplicates, 1);
    assert.equal(writer.fatos.length, 1);
    assert.equal(state.value.checkpoint, "e1");
  },
);

test(
  "LC8 kill switch acionado entre eventos termina no último checkpoint seguro",
  async () => {
    const control = new MemoryControl();
    // 1 check inicial + 1 antes do primeiro evento; na próxima fronteira para.
    control.afterChecks = 2;

    const x = consumer({
      feed: new ArrayFeed([ev("e1"), ev("e2")]),
      control,
    });
    const r = await x.runtime.tick();

    assert.equal(r.status, "killed");
    assert.equal(x.writer.fatos.length, 1);
    assert.equal(
      (x.state as MemoryState).value.checkpoint,
      "e1",
    );
  },
);

test(
  "LC9 stop durante commit termina evento corrente e não inicia o próximo",
  async () => {
    const feed = new ArrayFeed([ev("e1"), ev("e2")]);
    const writer = new Writer();

    let liberar!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let entrou = false;

    writer.beforeCommit = async () => {
      if (!entrou) {
        entrou = true;
        await bloqueio;
      }
    };

    const x = consumer({ feed, writer });
    const rodada = x.runtime.tick();

    while (!entrou) {
      await new Promise((r) => setTimeout(r, 1));
    }

    x.runtime.stop();
    liberar();

    const r = await rodada;
    assert.equal(r.status, "stopping");
    assert.equal(writer.fatos.length, 1);
    assert.equal(
      (x.state as MemoryState).value.checkpoint,
      "e1",
    );
  },
);

test("LC10 checkpoint corrompido falha fechado antes do poll", async () => {
  const dir = await mkdtemp(join(tmpdir(), "entregas-live-corrupt-"));
  try {
    const file = join(dir, "consumer.json");
    await writeFile(file, "{nao-json");

    const feed = new ArrayFeed([ev("e1")]);
    const x = consumer({
      feed,
      state: new FileConsumerStateStore(file),
    });
    const r = await x.runtime.tick();

    assert.equal(r.status, "failed");
    assert.equal(feed.polls, 0);
    assert.equal(x.writer.fatos.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("LC11 source_mode ausente é isolado; nunca assume real", async () => {
  const base = ev("e1");
  const { source_mode: _removido, ...resto } = base;

  const x = consumer({
    feed: new ArrayFeed([resto as EntregasPublicEvent]),
  });
  const r = await x.runtime.tick();

  assert.equal(r.status, "worked");
  assert.equal(r.isolated, 1);
  assert.equal(x.writer.fatos.length, 0);
  assert.equal(
    (x.state as MemoryState).value.last_isolation?.reason,
    "source_mode_ausente",
  );
});

test(
  "LC12 live consumer permanece fora do async-runtime e flag canônica segue false",
  async () => {
    const asyncSrc = await readFile(
      "src/platform/bin/async-runtime.ts",
      "utf8",
    );
    const manifestSrc = await readFile(
      "src/entregas/contracts/module-manifest.ts",
      "utf8",
    );

    assert.doesNotMatch(
      asyncSrc,
      /entregas-live-consumer|EntregasLiveConsumer/,
      "consumer já foi ligado ao processo sem autorização",
    );
    assert.match(
      manifestSrc,
      /"entregas\.copiloto_live_connection": false/,
      "feature flag canônica deixou de estar false",
    );
  },
);

void Promise.all(pending).then(
  () => {
    console.log("\nENTREGAS_LIVE_CONSUMER: " + passed + "/12 PASS");
  },
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
