/**
 * Fundação da plataforma híbrida — testes.
 *
 * Cobre os quatro grupos que o contrato exige: isolamento, transações, jobs e
 * degradação. Cada teste responde a uma pergunta operacional concreta, não a
 * uma propriedade abstrata.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  composeHealth,
  worstOf,
  shutdown,
  FORBIDDEN_IN_CRITICAL,
  type DependencyHealth,
  type RuntimeIdentity,
} from "./contracts/runtime";
import {
  DEFAULT_RETRY,
  nextDelayMs,
  decideAfterFailure,
  type Job,
  type OutboxMessage,
} from "./contracts/messaging";
import {
  MemoryInboxRepository,
  MemoryOutboxRepository,
  MemoryJobRepository,
} from "./messaging/memory-queues";
import { PlatformUnitOfWork, MemoryFactSink, type PlatformFact } from "./persistence/platform-uow";
import { CriticalRuntime, CRITICAL_MODULES } from "./runtime/critical";
import { AsyncRuntime } from "./runtime/async-worker";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const T0 = new Date("2026-07-26T12:00:00.000Z");
const clock = (offsetMs = 0) => () => new Date(T0.getTime() + offsetMs);

const IDENT: Omit<RuntimeIdentity, "kind" | "started_at"> = {
  version: "1.0.0",
  commit: "d67f041",
  instance_id: "inst-teste",
};

function fact(over: Partial<PlatformFact> = {}): PlatformFact {
  return {
    event_id: "ev-1",
    unit_id: "ITAIM",
    object_type: "trip",
    object_id: "trip-1",
    event_type: "trip_created",
    payload: {},
    occurred_at: T0.toISOString(),
    idempotency_key: "trip_created:trip-1",
    origin: "device",
    contract_version: "COR-ENTREGAS-V1@1.0.3",
    ...over,
  };
}

function msg(over: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    outbox_id: "obx-1",
    stream: "entregas",
    kind: "trip_created",
    payload: {},
    idempotency_key: "trip_created:trip-1",
    correlation_id: "corr-1",
    created_at: T0.toISOString(),
    state: "pending",
    attempts: 0,
    available_at: T0.toISOString(),
    ...over,
  };
}

function job(over: Partial<Job> = {}): Job {
  return {
    job_id: "job-1",
    kind: "reprojetar",
    payload: {},
    idempotency_key: "reprojetar:trip-1",
    state: "pending",
    attempts: 0,
    max_attempts: DEFAULT_RETRY.max_attempts,
    available_at: T0.toISOString(),
    created_at: T0.toISOString(),
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * 1. Isolamento entre runtimes
 * ------------------------------------------------------------------ */

async function isolamento(): Promise<void> {
  await test("crítico sobe e reporta saudável SEM consumidor assíncrono", async () => {
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox: new MemoryOutboxRepository(),
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => true,
      // Nenhum probe de assíncrono: ele simplesmente não existe.
      now: clock(),
    });
    const h = await rt.health();
    assert.equal(h.state, "healthy", h.summary);
    assert.equal(rt.accepting, true);
  });

  await test("consumidor assíncrono fora do ar DEGRADA, não bloqueia", async () => {
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox,
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => true,
      probeAsyncConsumer: async () => false,
      now: clock(),
    });
    const h = await rt.health();
    assert.equal(h.state, "degraded", "a rua precisa continuar");
    assert.notEqual(h.state, "blocked");
    assert.match(h.summary, /consumidor fora do ar/);
  });

  await test("armazenamento indisponível BLOQUEIA — nunca reporta saudável", async () => {
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox: new MemoryOutboxRepository(),
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => false,
      probeAsyncConsumer: async () => true,
      now: clock(),
    });
    const h = await rt.health();
    assert.equal(h.state, "blocked");
    assert.notEqual(h.state, "healthy", "falso verde no health é perda de dado");
  });

  await test("probe que lança é tratado como falha, não como sucesso", async () => {
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox: new MemoryOutboxRepository(),
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => {
        throw new Error("conexão recusada");
      },
      now: clock(),
    });
    assert.equal((await rt.health()).state, "blocked");
  });

  await test("falha do consumidor NÃO elimina a mensagem da outbox", async () => {
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox,
      jobs: new MemoryJobRepository(),
      outboxHandlers: {
        trip_created: () => {
          throw new Error("consumidor quebrou");
        },
      },
      jobHandlers: {},
      worker_id: "w1",
      now: clock(),
    });
    const r = await rt.tick();
    assert.equal(r.outbox_failed, 1);
    assert.equal(await outbox.pendingCount(), 1, "a mensagem sumiu ao falhar");
  });

  await test("runtime crítico declara módulos sem CRM, Copiloto ou IA", () => {
    for (const proibido of FORBIDDEN_IN_CRITICAL) {
      assert.equal(
        (CRITICAL_MODULES as readonly string[]).includes(proibido),
        false,
        `${proibido} no runtime crítico`,
      );
    }
  });

  await test("composição de saúde: essencial ruim vence opcional bom", () => {
    const at = T0.toISOString();
    const deps: DependencyHealth[] = [
      { name: "storage", state: "blocked", essential: true, checked_at: at },
      { name: "async", state: "healthy", essential: false, checked_at: at },
    ];
    const h = composeHealth({
      identity: { ...IDENT, kind: "critical", started_at: at },
      dependencies: deps,
      now: T0,
    });
    assert.equal(h.state, "blocked");
    assert.equal(worstOf(["healthy", "degraded", "blocked"]), "blocked");
  });
}

/* ------------------------------------------------------------------ *
 * 2. Transações — fato e outbox juntos
 * ------------------------------------------------------------------ */

async function transacoes(): Promise<void> {
  await test("fato e mensagem confirmam JUNTOS", async () => {
    const sink = new MemoryFactSink();
    const outbox = new MemoryOutboxRepository();
    const uow = new PlatformUnitOfWork(sink, outbox, clock());
    uow.addFact(fact());
    uow.addMessage(msg());
    const r = await uow.commit();
    assert.equal(r.ok, true);
    assert.equal(sink.count(), 1);
    assert.equal(await outbox.pendingCount(), 1);
  });

  await test("falha ao gravar o fato NÃO deixa mensagem na outbox", async () => {
    // É a metade perigosa do problema: o aviso sai, o fato não existe.
    const sink = new MemoryFactSink();
    sink.failNext = true;
    const outbox = new MemoryOutboxRepository();
    const uow = new PlatformUnitOfWork(sink, outbox, clock());
    uow.addFact(fact());
    uow.addMessage(msg());
    const r = await uow.commit();
    assert.equal(r.ok, false);
    assert.equal(sink.count(), 0);
    assert.equal(await outbox.pendingCount(), 0, "mensagem órfã enfileirada");
  });

  await test("falha devolve erro — nunca sucesso falso", async () => {
    const sink = new MemoryFactSink();
    sink.failNext = true;
    const uow = new PlatformUnitOfWork(sink, new MemoryOutboxRepository(), clock());
    uow.addFact(fact());
    const r = await uow.commit();
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "storage");
  });

  await test("rollback desfaz fato e mensagem", async () => {
    const sink = new MemoryFactSink();
    const outbox = new MemoryOutboxRepository();
    const uow = new PlatformUnitOfWork(sink, outbox, clock());
    uow.addFact(fact());
    uow.addMessage(msg());
    uow.rollback();
    assert.deepEqual(uow.pending, { facts: 0, messages: 0 });
    assert.equal(sink.count(), 0);
    assert.equal(await outbox.pendingCount(), 0);
  });

  await test("fato repetido não duplica — e não reenvia o aviso", async () => {
    const sink = new MemoryFactSink();
    const outbox = new MemoryOutboxRepository();

    const uow1 = new PlatformUnitOfWork(sink, outbox, clock());
    uow1.addFact(fact());
    uow1.addMessage(msg());
    await uow1.commit();

    const uow2 = new PlatformUnitOfWork(sink, outbox, clock());
    uow2.addFact(fact()); // mesma idempotency_key
    uow2.addMessage(msg({ outbox_id: "obx-2" }));
    const r2 = await uow2.commit();

    assert.equal(r2.ok, true);
    if (r2.ok) assert.equal(r2.duplicates, 1);
    assert.equal(sink.count(), 1, "fato duplicado gravado");
    assert.equal(await outbox.pendingCount(), 1, "aviso duplicado enfileirado");
  });

  await test("transação encerrada não aceita mais nada", async () => {
    const uow = new PlatformUnitOfWork(new MemoryFactSink(), new MemoryOutboxRepository(), clock());
    await uow.commit();
    assert.throws(() => uow.addFact(fact()));
    const r = await uow.commit();
    assert.equal(r.ok, false);
  });

  await test("inbox recusa duplicata sem lançar", async () => {
    const inbox = new MemoryInboxRepository();
    const rec = {
      idempotency_key: "gps:dev-1:trip-1:2026-07-26T12:00:00.000Z",
      source: "android",
      kind: "gps_point",
      payload: {},
      occurred_at: T0.toISOString(),
      received_at: T0.toISOString(),
      unit_id: "ITAIM",
      device_id: "dev-1",
    };
    assert.equal((await inbox.accept(rec)).accepted, true);
    const dup = await inbox.accept(rec);
    assert.equal(dup.accepted, false);
    if (!dup.accepted) assert.equal(dup.reason, "duplicate");
    assert.equal(inbox.size(), 1);
  });

  await test("inbox recusa registro sem chave ou sem unidade", async () => {
    const inbox = new MemoryInboxRepository();
    const base = {
      source: "android",
      kind: "gps_point",
      payload: {},
      occurred_at: T0.toISOString(),
      received_at: T0.toISOString(),
    };
    const semChave = await inbox.accept({ ...base, idempotency_key: "", unit_id: "ITAIM" });
    assert.equal(semChave.accepted, false);
    const semUnidade = await inbox.accept({ ...base, idempotency_key: "k", unit_id: "" });
    assert.equal(semUnidade.accepted, false);
  });

  await test("lote de GPS repetido não duplica na inbox", async () => {
    const inbox = new MemoryInboxRepository();
    const lote = ["p1", "p2", "p3"].map((p) => ({
      idempotency_key: `gps:dev-1:trip-1:${p}`,
      source: "android",
      kind: "gps_point",
      payload: {},
      occurred_at: T0.toISOString(),
      received_at: T0.toISOString(),
      unit_id: "ITAIM",
    }));
    for (const r of lote) await inbox.accept(r);
    for (const r of lote) await inbox.accept(r); // reenvio integral
    assert.equal(inbox.size(), 3);
  });
}

/* ------------------------------------------------------------------ *
 * 3. Jobs — lease, retry, dead-letter
 * ------------------------------------------------------------------ */

async function jobs(): Promise<void> {
  await test("claim é exclusivo: dois workers não pegam o mesmo item", async () => {
    const outbox = new MemoryOutboxRepository();
    for (let i = 0; i < 4; i += 1) {
      await outbox.enqueue(msg({ outbox_id: `obx-${i}`, idempotency_key: `k-${i}` }));
    }
    const a = await outbox.claim("w1", 10, T0);
    const b = await outbox.claim("w2", 10, T0);
    assert.equal(a.length, 4);
    assert.equal(b.length, 0, "segundo worker pegou item já reservado");
  });

  await test("backoff cresce, respeita o teto e tem jitter estável", () => {
    const d1 = nextDelayMs(1, DEFAULT_RETRY, "k");
    const d3 = nextDelayMs(3, DEFAULT_RETRY, "k");
    const d20 = nextDelayMs(20, DEFAULT_RETRY, "k");
    assert.ok(d3 > d1, "backoff não cresce");
    assert.ok(d20 <= DEFAULT_RETRY.max_delay_ms, "teto ignorado");
    assert.equal(nextDelayMs(3, DEFAULT_RETRY, "k"), d3, "jitter não é determinístico");
    assert.notEqual(nextDelayMs(3, DEFAULT_RETRY, "outra"), d3, "sem jitter por chave");
  });

  await test("retry respeita a espera: item não volta antes da hora", async () => {
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    await outbox.claim("w1", 10, T0);
    await outbox.markFailed("obx-1", "erro", DEFAULT_RETRY, T0);

    const agora = await outbox.claim("w1", 10, T0);
    assert.equal(agora.length, 0, "voltou antes do backoff");

    const depois = await outbox.claim("w1", 10, new Date(T0.getTime() + 60_000));
    assert.equal(depois.length, 1);
  });

  await test("esgotadas as tentativas, vai para dead-letter — e é preservado", async () => {
    const politica = { ...DEFAULT_RETRY, max_attempts: 2 };
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    let decisao: "retry" | "dead" = "retry";
    for (let i = 0; i < 2; i += 1) {
      decisao = await outbox.markFailed("obx-1", `falha ${i}`, politica, T0);
    }
    assert.equal(decisao, "dead");
    const mortas = await outbox.deadLetters(10);
    assert.equal(mortas.length, 1);
    assert.match(String(mortas[0].last_error), /falha 1/, "o erro foi perdido");
  });

  await test("reprocessamento manual é auditável e volta à fila", async () => {
    const politica = { ...DEFAULT_RETRY, max_attempts: 1 };
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    await outbox.markFailed("obx-1", "erro", politica, T0);
    assert.equal((await outbox.deadLetters(10)).length, 1);

    const ok = await outbox.requeue("obx-1", "ger-1", T0);
    assert.equal(ok, true);
    assert.equal(await outbox.pendingCount(), 1);
    const [m] = await outbox.claim("w1", 10, T0);
    assert.match(String(m.last_error), /reprocessado por ger-1/, "sem trilha de quem reprocessou");
  });

  await test("requeue só vale para dead-letter", async () => {
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    assert.equal(await outbox.requeue("obx-1", "ger-1", T0), false);
  });

  await test("lease expira e o job abandonado volta à fila", async () => {
    const repo = new MemoryJobRepository();
    await repo.schedule(job());
    const pegos = await repo.claim("w-morto", 10, DEFAULT_RETRY, T0);
    assert.equal(pegos.length, 1);
    assert.equal(await repo.pendingCount(), 0);

    // Worker morre. Ninguém marca nada. O lease vence.
    const depois = new Date(T0.getTime() + DEFAULT_RETRY.lease_ms + 1000);
    assert.equal(await repo.reclaimExpired(depois), 1);
    assert.equal(await repo.pendingCount(), 1);

    const outro = await repo.claim("w-vivo", 10, DEFAULT_RETRY, depois);
    assert.equal(outro.length, 1);
  });

  await test("lease recuperado NÃO gasta tentativa — o job não falhou", async () => {
    const repo = new MemoryJobRepository();
    await repo.schedule(job());
    await repo.claim("w-morto", 10, DEFAULT_RETRY, T0);
    await repo.reclaimExpired(new Date(T0.getTime() + DEFAULT_RETRY.lease_ms + 1000));
    assert.equal(repo.get("job-1")?.attempts, 0, "reinício de contêiner gastaria as tentativas");
  });

  await test("lease ainda válido não é recuperado", async () => {
    const repo = new MemoryJobRepository();
    await repo.schedule(job());
    await repo.claim("w1", 10, DEFAULT_RETRY, T0);
    assert.equal(await repo.reclaimExpired(new Date(T0.getTime() + 1000)), 0);
  });

  await test("job agendado duas vezes com a mesma chave roda uma vez", async () => {
    const repo = new MemoryJobRepository();
    await repo.schedule(job());
    await repo.schedule(job({ job_id: "job-2" }));
    assert.equal(await repo.pendingCount(), 1);
  });

  await test("kind sem handler vai para dead-letter com motivo legível", async () => {
    const politica = { ...DEFAULT_RETRY, max_attempts: 1 };
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg({ kind: "kind_desconhecido" }));
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox,
      jobs: new MemoryJobRepository(),
      outboxHandlers: {},
      jobHandlers: {},
      policy: politica,
      worker_id: "w1",
      now: clock(),
    });
    const r = await rt.tick();
    assert.equal(r.outbox_dead, 1);
    const [m] = await outbox.deadLetters(1);
    assert.match(String(m.last_error), /sem handler/);
  });

  await test("decideAfterFailure respeita o limite", () => {
    const p = { ...DEFAULT_RETRY, max_attempts: 3 };
    assert.equal(decideAfterFailure(1, p), "retry");
    assert.equal(decideAfterFailure(3, p), "dead");
  });
}

/* ------------------------------------------------------------------ *
 * 4. Degradação e ciclo de vida
 * ------------------------------------------------------------------ */

async function degradacao(): Promise<void> {
  await test("assíncrono desligado gera backlog RECUPERÁVEL", async () => {
    const outbox = new MemoryOutboxRepository();
    // Crítico continua gravando enquanto o consumidor não existe.
    const sink = new MemoryFactSink();
    for (let i = 0; i < 5; i += 1) {
      const uow = new PlatformUnitOfWork(sink, outbox, clock());
      uow.addFact(fact({ idempotency_key: `k-${i}`, event_id: `ev-${i}` }));
      uow.addMessage(msg({ outbox_id: `obx-${i}`, idempotency_key: `k-${i}` }));
      assert.equal((await uow.commit()).ok, true);
    }
    assert.equal(await outbox.pendingCount(), 5);

    // Consumidor volta e drena tudo.
    const processados: string[] = [];
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox,
      jobs: new MemoryJobRepository(),
      outboxHandlers: { trip_created: (m) => void processados.push(m.outbox_id) },
      jobHandlers: {},
      worker_id: "w1",
      now: clock(),
    });
    const r = await rt.tick();
    assert.equal(r.outbox_processed, 5);
    assert.equal(await outbox.pendingCount(), 0);
    assert.equal(processados.length, 5);
  });

  await test("assíncrono sem trabalho continua saudável", async () => {
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox: new MemoryOutboxRepository(),
      jobs: new MemoryJobRepository(),
      outboxHandlers: {},
      jobHandlers: {},
      worker_id: "w1",
      now: clock(),
    });
    assert.equal((await rt.health()).state, "healthy");
  });

  await test("dead-letter existindo degrada o assíncrono, sem bloquear", async () => {
    const politica = { ...DEFAULT_RETRY, max_attempts: 1 };
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    await outbox.markFailed("obx-1", "erro", politica, T0);
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox,
      jobs: new MemoryJobRepository(),
      outboxHandlers: {},
      jobHandlers: {},
      worker_id: "w1",
      now: clock(),
    });
    const h = await rt.health();
    assert.equal(h.state, "degraded");
    assert.match(h.summary, /dead-letter/);
  });

  await test("shutdown gracioso: drena antes de fechar", async () => {
    const ordem: string[] = [];
    const r = await shutdown(
      { drain: () => void ordem.push("drain"), close: () => void ordem.push("close") },
      1000,
    );
    assert.equal(r.graceful, true);
    assert.deepEqual(ordem, ["drain", "close"]);
  });

  await test("shutdown que estoura o prazo é reportado como NÃO gracioso", async () => {
    const r = await shutdown(
      { drain: () => undefined, close: () => new Promise(() => {}) },
      120,
    );
    assert.equal(r.graceful, false);
    assert.match(String(r.reason), /tempo esgotado/);
  });

  await test("crítico em encerramento para de aceitar e fica read_only", async () => {
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox: new MemoryOutboxRepository(),
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => true,
      now: clock(),
    });
    assert.equal(rt.accepting, true);
    const r = await rt.stop(1000);
    assert.equal(r.graceful, true);
    assert.equal(rt.accepting, false);
    const h = await rt.health();
    assert.notEqual(h.state, "healthy", "encerrando não pode parecer saudável");
  });

  await test("assíncrono em encerramento não processa mais nada", async () => {
    const outbox = new MemoryOutboxRepository();
    await outbox.enqueue(msg());
    const rt = new AsyncRuntime({
      identity: IDENT,
      outbox,
      jobs: new MemoryJobRepository(),
      outboxHandlers: { trip_created: () => undefined },
      jobHandlers: {},
      worker_id: "w1",
      now: clock(),
    });
    await rt.stop(500);
    const r = await rt.tick();
    assert.equal(r.outbox_processed, 0);
    assert.equal(await outbox.pendingCount(), 1, "backlog precisa sobreviver ao shutdown");
  });

  await test("identidade traz versão e commit — 'qual código está no ar?'", async () => {
    const rt = new CriticalRuntime({
      identity: IDENT,
      facts: new MemoryFactSink(),
      outbox: new MemoryOutboxRepository(),
      inbox: new MemoryInboxRepository(),
      probeStorage: async () => true,
      now: clock(),
    });
    const h = await rt.health();
    assert.equal(h.identity.kind, "critical");
    assert.equal(h.identity.commit, "d67f041");
    assert.ok(h.identity.instance_id);
  });
}

/* ------------------------------------------------------------------ *
 * 5. Fronteiras modulares — provadas sobre o código real
 * ------------------------------------------------------------------ */

function arquivosTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) arquivosTs(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

async function fronteiras(): Promise<void> {
  const ROOT = process.cwd();

  await test("Entregas não importa CRM, Copiloto, Conference Brain nem IA", () => {
    const arquivos = arquivosTs(join(ROOT, "src", "entregas"));
    assert.ok(arquivos.length > 20, `poucos arquivos varridos: ${arquivos.length}`);
    for (const f of arquivos) {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/^\s*import[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const imp of imports) {
        for (const proibido of FORBIDDEN_IN_CRITICAL) {
          assert.equal(
            imp.includes(proibido),
            false,
            `${f.replace(ROOT, "")} importa "${imp}" (proibido: ${proibido})`,
          );
        }
      }
    }
  });

  await test("a plataforma não importa Entregas — a dependência é ao contrário", () => {
    // `platform` é a fundação; se ela conhecer o domínio, deixa de ser
    // fundação e vira mais um módulo acoplado.
    for (const f of arquivosTs(join(ROOT, "src", "platform"))) {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/^\s*import[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const imp of imports) {
        assert.equal(
          /\/entregas\/|\.\.\/entregas/.test(imp),
          false,
          `${f.replace(ROOT, "")} importa Entregas: ${imp}`,
        );
      }
    }
  });

  await test("runtime crítico não importa o runtime assíncrono", () => {
    const critical = readFileSync(join(ROOT, "src/platform/runtime/critical.ts"), "utf8");
    assert.equal(
      /async-worker/.test(critical),
      false,
      "o crítico não pode depender do consumidor",
    );
  });

  await test("as migrations existem e trazem o essencial", () => {
    const p = join(ROOT, "src/platform/migrations/0001_platform_foundation.sql");
    assert.ok(existsSync(p), "migration ausente");
    const sql = readFileSync(p, "utf8");
    for (const schema of ["platform", "identity", "entregas", "sources", "orders", "crm", "copiloto"]) {
      assert.match(sql, new RegExp(`CREATE SCHEMA IF NOT EXISTS ${schema}`), `schema ${schema}`);
    }
    for (const tabela of ["platform.inbox", "platform.event_log", "platform.outbox", "platform.job"]) {
      assert.match(sql, new RegExp(tabela.replace(".", "\\.")), `tabela ${tabela}`);
    }
  });

  await test("event log é append-only por trigger, não por disciplina", () => {
    const sql = readFileSync(
      join(ROOT, "src/platform/migrations/0001_platform_foundation.sql"),
      "utf8",
    );
    assert.match(sql, /BEFORE UPDATE OR DELETE ON platform\.event_log/);
    assert.match(sql, /RAISE EXCEPTION/);
  });

  await test("todo timestamp da migration é TIMESTAMPTZ", () => {
    const sql = readFileSync(
      join(ROOT, "src/platform/migrations/0001_platform_foundation.sql"),
      "utf8",
    );
    // Comentários fora antes de medir: o próprio arquivo EXPLICA a regra
    // citando "TIMESTAMP", e um teste que lê prosa acusa o texto que o
    // defende. O que importa é o que o Postgres vai executar.
    const codigo = sql.replace(/--[^\n]*/g, " ");
    // `TIMESTAMP` sem TZ perde a hora do fato quando servidor e aparelho
    // estão em fusos diferentes.
    const semTz = [...codigo.matchAll(/\bTIMESTAMP\b(?!TZ)/g)];
    assert.deepEqual(semTz.map((m) => m[0]), [], "TIMESTAMP sem TZ na migration");
  });

  await test("idempotência é imposta pelo banco, não pelo código", () => {
    const sql = readFileSync(
      join(ROOT, "src/platform/migrations/0001_platform_foundation.sql"),
      "utf8",
    );
    assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/, "event_log sem UNIQUE");
    assert.match(sql, /idempotency_key TEXT PRIMARY KEY/, "inbox sem chave");
  });

  await test("as filas têm índice parcial — a consulta não degrada com o histórico", () => {
    const sql = readFileSync(
      join(ROOT, "src/platform/migrations/0001_platform_foundation.sql"),
      "utf8",
    );
    assert.match(sql, /outbox_fila_idx[\s\S]*WHERE state = 'pending'/);
    assert.match(sql, /job_lease_idx[\s\S]*WHERE state = 'running'/);
  });
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("=== Fundação da plataforma híbrida ===");
  await isolamento();
  await transacoes();
  await jobs();
  await degradacao();
  await fronteiras();

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} platform tests OK ===`);
}

void main();
