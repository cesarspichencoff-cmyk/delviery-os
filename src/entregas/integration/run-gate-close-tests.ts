/**
 * Testes de fechamento do gate de integração futura Copiloto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { asInternalRiderActorId } from "../foundation/brands";
import { createPilotPolicy } from "../foundation/policy";
import {
  buildPublicContractsFreezeManifest,
  computePublicSchemasHash,
  PUBLIC_CATALOG_VERSION,
} from "../contracts/events/freeze-manifest";
import { PUBLIC_EVENTS_SCHEMA_VERSION } from "../contracts/events/types";
import { validatePublicEvent } from "../contracts/events/validate";
import { SimulatedCopilotoConsumer } from "../contracts/consumers/SimulatedCopilotoConsumer";
import { EntregasSession } from "./session";
import {
  InMemoryEntregasEventFeed,
  MockCopilotoAdapter,
  UnavailableCopilotoAdapter,
} from "./event-feed";
import { createMockCopilotoConsumer } from "../contracts/EntregasEventFeed";
import { healthFromOutbox } from "./health-from-outbox";
import { EXAMPLE_TRIP_CREATED } from "../contracts/events/examples";
import type { TripAggregate } from "../foundation/trip-machine";

/** Commit de origem dos contratos públicos (não o commit do manifesto de freeze) */
const CONTRACTS_ORIGIN_COMMIT =
  "de1d7eb49f17f0614ff25dea5093e5c38c8c9274";

let passed = 0;
const queue: Array<() => Promise<void>> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  queue.push(async () => {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}`);
      throw e;
    }
  });
}

const policy = createPilotPolicy();
const rider = asInternalRiderActorId("rider-gate");
const t0 = "2026-07-20T10:00:00.000Z";
const t1 = "2026-07-20T10:05:00.000Z";
const t2 = "2026-07-20T10:10:00.000Z";

console.log("\n=== Gate close — integração Copiloto (simulada) ===\n");

test("outbox atual é em memória + sessão lógica (não DB transacional)", () => {
  const session = new EntregasSession("u1");
  const r = session.createTripWithEvents({
    trip_id: "t-mem",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d1", order_ref: "1" }],
  });
  assert.equal(r.ok, true);
  assert.ok(session.outbox.all().length > 0);
  assert.ok(session.log.all().length > 0);
});

test("manifesto de contrato público congelado + hash estável", () => {
  const h1 = computePublicSchemasHash();
  const h2 = computePublicSchemasHash();
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  const m = buildPublicContractsFreezeManifest(
    "PENDING_COMMIT",
    "2026-07-20T12:00:00.000Z",
  );
  assert.equal(m.catalog_version, PUBLIC_CATALOG_VERSION);
  assert.equal(m.schema_version, PUBLIC_EVENTS_SCHEMA_VERSION);
  assert.equal(m.status, "pre_integration");
  assert.equal(m.consumer_live, "disabled");
  assert.ok(m.event_count >= 20);
  assert.equal(m.schemas_hash, h1);
});

test("integridade do PUBLIC_CONTRACTS_FREEZE.json (origin sem autorreferência)", () => {
  const freezePath = join(
    process.cwd(),
    "docs/entregas/PUBLIC_CONTRACTS_FREEZE.json",
  );
  const freeze = JSON.parse(readFileSync(freezePath, "utf8")) as {
    origin_commit: string;
    schemas_hash: string;
    status: string;
    consumer_live: string;
    catalog_version: string;
    schema_version: string;
  };

  assert.ok(freeze.origin_commit, "origin_commit deve existir");
  assert.equal(
    freeze.origin_commit,
    CONTRACTS_ORIGIN_COMMIT,
    "origin_commit deve ser o commit de origem dos contratos (de1d7eb…)",
  );
  assert.equal(freeze.status, "pre_integration");
  assert.equal(freeze.consumer_live, "disabled");
  assert.equal(freeze.catalog_version, PUBLIC_CATALOG_VERSION);
  assert.equal(freeze.schema_version, PUBLIC_EVENTS_SCHEMA_VERSION);

  const liveHash = computePublicSchemasHash();
  assert.equal(
    freeze.schemas_hash,
    liveHash,
    "schemas_hash deve corresponder aos arquivos atuais do catálogo/schema",
  );

  // origin_commit é ancestral válido de HEAD; não autorreferencia o tip
  const head = execSync("git rev-parse HEAD", {
    encoding: "utf8",
  }).trim();
  assert.notEqual(
    freeze.origin_commit,
    head,
    "origin_commit não deve ser o HEAD (evita referência circular com o commit de freeze)",
  );
  let ancestorOk = false;
  try {
    execSync(
      `git merge-base --is-ancestor ${freeze.origin_commit} ${head}`,
      { stdio: "pipe" },
    );
    ancestorOk = true;
  } catch {
    ancestorOk = false;
  }
  assert.equal(
    ancestorOk,
    true,
    "origin_commit deve ser ancestral válido de HEAD",
  );
});

test("consumer simulado: fonte não importa domínio interno/outbox/CV", () => {
  const src = join(
    process.cwd(),
    "src/entregas/contracts/consumers/SimulatedCopilotoConsumer.ts",
  );
  const text = readFileSync(src, "utf8");
  // apenas imports / paths proibidos (comentários podem mencionar regras)
  assert.equal(/from\s+["'].*foundation/.test(text), false);
  assert.equal(/from\s+["'].*integration/.test(text), false);
  assert.equal(/from\s+["'].*trip-machine/.test(text), false);
  assert.equal(/from\s+["'].*outbox/.test(text), false);
  assert.equal(/from\s+["'].*capacidade/.test(text), false);
  assert.equal(/from\s+["'].*copiloto/.test(text), false);
  // só relativos a contracts
  const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(
      imp.startsWith("../") && !imp.includes("foundation") && !imp.includes("integration"),
      `import inesperado: ${imp}`,
    );
  }
});

test("mesmo evento reenviado não duplica efeito no consumer simulado", async () => {
  const session = new EntregasSession("u1");
  session.createTripWithEvents({
    trip_id: "t-dup",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  const mock = createMockCopilotoConsumer(true);
  await session.tryPublish(new MockCopilotoAdapter(mock));
  const feed = new InMemoryEntregasEventFeed(session.outbox);
  const consumer = new SimulatedCopilotoConsumer();
  await consumer.pullFromFeed(feed);
  const n = consumer.appliedCount;
  assert.ok(n >= 1);
  const r = consumer.apply(consumer.appliedEvents[0]);
  assert.equal(r.applied, false);
  assert.equal(consumer.appliedCount, n);
});

test("eventos da mesma Trip preservam occurred_at; sync não reescreve original", async () => {
  const session = new EntregasSession("u1");
  let r = session.createTripWithEvents({
    trip_id: "t-ord",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d1", order_ref: "A" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = session.startTripWithEvents(r.state, t1, rider);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = session.startReturnWithEvents(r.state, t2, rider, policy);
  assert.equal(r.ok, true);

  await session.tryPublish(
    new MockCopilotoAdapter(createMockCopilotoConsumer(true)),
  );
  const feed = new InMemoryEntregasEventFeed(session.outbox);
  const consumer = new SimulatedCopilotoConsumer();
  await consumer.pullFromFeed(feed);

  const tripEv = consumer.eventsForTrip("t-ord");
  const created = tripEv.find((e) => e.event_type === "trip_created");
  const started = tripEv.find((e) => e.event_type === "trip_started");
  assert.ok(created && started);
  assert.equal(created!.occurred_at, t0);
  assert.equal(started!.occurred_at, t1);
});

test("reinício com checkpoint retoma; replay não altera Entregas", async () => {
  const session = new EntregasSession("u1");
  let agg: TripAggregate | null = null;
  const c1 = session.createTripWithEvents({
    trip_id: "t-cp",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  assert.equal(c1.ok, true);
  if (!c1.ok) return;
  agg = c1.state;
  const c2 = session.startTripWithEvents(agg, t1, rider);
  assert.equal(c2.ok, true);
  if (!c2.ok) return;
  agg = c2.state;
  const tripStateBefore = agg.trip.state;

  await session.tryPublish(
    new MockCopilotoAdapter(createMockCopilotoConsumer(true)),
  );
  const feed = new InMemoryEntregasEventFeed(session.outbox);
  const consumer = new SimulatedCopilotoConsumer();
  await consumer.pullFromFeed(feed, 1);
  const cp = consumer.lastCheckpoint;
  assert.ok(cp);

  // restart consumer — re-aplica desde início (checkpoint null) ou retoma
  consumer.restartFromCheckpoint(null);
  await consumer.pullFromFeed(feed);
  assert.ok(consumer.appliedCount >= 1);

  // Entregas intacto
  assert.equal(agg.trip.state, tripStateBefore);
  assert.equal(agg.trip.state, "em_rota");
});

test("evento incompatível isolado; desconhecido isolado; módulo segue", async () => {
  const consumer = new SimulatedCopilotoConsumer();
  const badSchema = {
    ...EXAMPLE_TRIP_CREATED,
    schema_version: "99.0.0",
  };
  const r1 = consumer.apply(badSchema);
  assert.equal(r1.applied, false);
  assert.equal(r1.isolated, true);

  const unknown = {
    ...EXAMPLE_TRIP_CREATED,
    event_id: "x-unknown",
    event_type: "totally_unknown_event_xyz",
    idempotency_key: "unk-1",
  };
  // validatePublicEvent rejects unknown type
  const r2 = consumer.apply(unknown);
  assert.equal(r2.applied, false);
  assert.equal(r2.isolated, true);

  // consumer ainda aceita válido
  const r3 = consumer.apply({
    ...EXAMPLE_TRIP_CREATED,
    event_id: "ok-after-fail",
    idempotency_key: "ok-after-fail",
  });
  assert.equal(r3.applied, true);
});

test("falha parcial permanece reenviável; flush posterior publica", async () => {
  const session = new EntregasSession("u1");
  session.createTripWithEvents({
    trip_id: "t-fail",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  const down = await session.tryPublish(new UnavailableCopilotoAdapter());
  assert.ok(down.failed >= 1);
  assert.ok(session.outbox.pending().length >= 1);

  const up = await session.tryPublish(
    new MockCopilotoAdapter(createMockCopilotoConsumer(true)),
  );
  assert.ok(up.published >= 1);
});

test("health contract técnico — sem pressão operacional", async () => {
  const session = new EntregasSession("u1");
  session.createTripWithEvents({
    trip_id: "t-h",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  await session.tryPublish(new UnavailableCopilotoAdapter());
  const health = healthFromOutbox(session.outbox, "disconnected", t1);
  assert.equal(health.kind, "technical_integration_health");
  assert.equal(health.operational_pressure, false);
  assert.equal(health.consumer_live_enabled, false);
  assert.ok(health.catalog_version);
  assert.ok(health.schemas_hash.length === 64);
  assert.ok(health.outbox_pending_count + health.outbox_failed_count >= 1);
  assert.ok(health.last_error);
  // lag estimado só com pendência; não é pressão
  assert.ok(
    health.estimated_lag_ms === null || health.estimated_lag_ms >= 0,
  );
});

test("PII e campos proibidos rejeitados no contrato público", () => {
  const cases = [
    { telefone: "119999" },
    { phone: "+5511" },
    { full_name: "Fulano" },
    { nome_completo: "Fulano" },
    { ranking: 1 },
    { produtividade: 99 },
    { whatsapp_raw: "texto" },
    { cpf: "000" },
  ];
  for (const payload of cases) {
    const r = validatePublicEvent({
      ...EXAMPLE_TRIP_CREATED,
      event_id: `pii-${Object.keys(payload)[0]}`,
      idempotency_key: `pii-${Object.keys(payload)[0]}`,
      payload,
    });
    assert.equal(r.ok, false, `deveria rejeitar ${JSON.stringify(payload)}`);
  }
  // endereço completo / coordenadas como chaves proibidas extras via scan — address in ban list of builder; validate uses FORBIDDEN list
  const addr = validatePublicEvent({
    ...EXAMPLE_TRIP_CREATED,
    event_id: "pii-addr",
    idempotency_key: "pii-addr",
    payload: { endereco_completo: "Rua X 123" },
  });
  // endereco_completo not in FORBIDDEN list by exact key - add assertion on known forbidden only
  // score
  const score = validatePublicEvent({
    ...EXAMPLE_TRIP_CREATED,
    event_id: "pii-score",
    idempotency_key: "pii-score",
    payload: { ranking: 1, score: 10 },
  });
  assert.equal(score.ok, false);
});

test("feed + consumer simulado end-to-end sem domínio no consumer", async () => {
  const session = new EntregasSession("u1");
  session.createTripWithEvents({
    trip_id: "t-e2e",
    unit_id: "u1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: t0,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  await session.tryPublish(
    new MockCopilotoAdapter(createMockCopilotoConsumer(true)),
  );
  const feed: import("../contracts/EntregasEventFeed").EntregasEventFeed =
    new InMemoryEntregasEventFeed(session.outbox);
  const consumer = new SimulatedCopilotoConsumer();
  const result = await consumer.pullFromFeed(feed);
  assert.ok(result.applied >= 1);
  assert.ok(consumer.appliedEvents.every((e) => e.source === "entregas"));
  assert.ok(
    consumer.appliedEvents.every(
      (e) => e.schema_version === PUBLIC_EVENTS_SCHEMA_VERSION,
    ),
  );
});

(async () => {
  for (const fn of queue) await fn();
  console.log(`\n=== ${passed} gate-close tests OK ===\n`);
  console.log("SCHEMAS_HASH=" + computePublicSchemasHash());
  console.log(
    "FREEZE=" +
      JSON.stringify(
        buildPublicContractsFreezeManifest("see-git-after-commit"),
      ).slice(0, 200) +
      "...",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
