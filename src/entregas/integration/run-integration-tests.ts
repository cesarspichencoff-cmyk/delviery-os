/**
 * Testes de integração pública Entregas → (futuro) Copiloto.
 * Sem importar Copiloto real; sem shell.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { asExternalCourierRef, asInternalRiderActorId } from "../foundation/brands";
import { createPilotPolicy } from "../foundation/policy";
import {
  EXAMPLE_ABSENCE_NO_WAIT,
  EXAMPLE_HANDOFF_TRANSFERRED,
  EXAMPLE_TRIP_CREATED,
  validatePublicEvent,
  PUBLIC_EVENTS_SCHEMA_VERSION,
  createMockCopilotoConsumer,
  validateModuleManifest,
  ENTREGAS_MODULE_MANIFEST,
} from "../contracts";
import { EntregasSession } from "./session";
import {
  InMemoryEntregasEventFeed,
  MockCopilotoAdapter,
  UnavailableCopilotoAdapter,
} from "./event-feed";
import { buildSignalEvent, domainEventToPublic } from "./public-event-builder";
import { InMemoryEventLog } from "../foundation/event-log";
import { InMemoryTransactionalOutbox } from "./outbox";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>): void {
  const run = async () => {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}`);
      throw e;
    }
  };
  // queue
  (test as unknown as { queue: Array<() => Promise<void>> }).queue.push(run);
}
(test as unknown as { queue: Array<() => Promise<void>> }).queue = [];

const policy = createPilotPolicy();
const rider = asInternalRiderActorId("rider-int-1");
const now = "2026-07-20T20:00:00.000Z";

console.log("\n=== Entregas ↔ Copiloto integration contracts ===\n");

test("schema_version e idempotency_key obrigatórios no contrato", () => {
  const bad = { ...EXAMPLE_TRIP_CREATED } as Record<string, unknown>;
  delete bad.schema_version;
  const r = validatePublicEvent(bad);
  assert.equal(r.ok, false);

  const bad2 = { ...EXAMPLE_TRIP_CREATED } as Record<string, unknown>;
  delete bad2.idempotency_key;
  assert.equal(validatePublicEvent(bad2).ok, false);

  const ok = validatePublicEvent(EXAMPLE_TRIP_CREATED);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.event.schema_version, PUBLIC_EVENTS_SCHEMA_VERSION);
});

test("exemplos de contrato públicos validam", () => {
  for (const ex of [
    EXAMPLE_TRIP_CREATED,
    EXAMPLE_HANDOFF_TRANSFERRED,
    EXAMPLE_ABSENCE_NO_WAIT,
  ]) {
    const r = validatePublicEvent(ex);
    assert.equal(r.ok, true, JSON.stringify(r));
  }
});

test("evento criado junto da mudança de domínio (session outbox)", () => {
  const session = new EntregasSession("unit-1");
  const r = session.createTripWithEvents({
    trip_id: "trip-int-1",
    unit_id: "unit-1",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: [
      { delivery_id: "d1", order_ref: "O1" },
      { delivery_id: "d2", order_ref: "O2" },
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.public_events.length >= 1);
  assert.ok(r.public_events.some((e) => e.event_type === "trip_created"));
  assert.ok(r.public_events.some((e) => e.event_type === "delivery_added"));
  // domínio e outbox consistentes
  assert.ok(session.outbox.all().length >= r.public_events.length);
  assert.equal(r.state.trip.state, "preparando_saida");
});

test("reprocessamento / duplicata não duplica outbox", () => {
  const session = new EntregasSession("unit-1");
  session.createTripWithEvents({
    trip_id: "trip-dup",
    unit_id: "unit-1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  const n = session.outbox.all().length;
  // re-enqueue mesmo evento
  const first = session.outbox.all()[0].event;
  const again = session.outbox.enqueue(first);
  assert.equal(again.duplicate, true);
  assert.equal(session.outbox.all().length, n);
});

test("evento offline preserva occurred_at", () => {
  const log = new InMemoryEventLog();
  const occurred = "2026-07-19T10:00:00.000Z";
  const { event } = log.append({
    object_type: "trip",
    object_id: "t-off",
    event_type: "trip_created",
    occurred_at: occurred,
    recorded_at: "2026-07-20T12:00:00.000Z",
    origin: "device",
    idempotency_key: "trip_created:t-off",
    payload: { unit_id: "u", courier_actor_id: rider },
  });
  const pub = domainEventToPublic(event, { unit_id: "u" });
  assert.ok(pub);
  assert.equal(pub!.occurred_at, occurred);
  assert.notEqual(pub!.occurred_at, pub!.recorded_at);
});

test("active=false (delivery_removed) não emite pressão indevida", () => {
  const log = new InMemoryEventLog();
  const { event } = log.append({
    object_type: "delivery",
    object_id: "d-rm",
    event_type: "delivery_removed",
    occurred_at: now,
    origin: "ops_console",
    idempotency_key: "delivery_removed:d-rm",
    payload: { trip_id: "t1", reason: "out" },
  });
  const pub = domainEventToPublic(event, { unit_id: "u" });
  assert.ok(pub);
  assert.equal(pub!.payload.active, false);
  assert.equal(pub!.payload.operational_pressure, false);
});

test("ausência de rider_arrived_store não vira espera zero", () => {
  const sig = buildSignalEvent({
    event_type: "source_quality_issue",
    unit_id: "u",
    occurred_at: now,
    idempotency_key: "missing_arrived:t9",
    trip_id: "t9",
    confidence: "unknown",
    source_health: "degraded",
    absence_fields: {
      wait_seconds: null,
      rider_arrived_store_at: null,
    },
    payload: {
      missing_signal: "rider_arrived_store",
      issue: "missing_evidence",
    },
  });
  assert.equal(sig.payload.wait_seconds, null);
  assert.notEqual(sig.payload.wait_seconds, 0);
  assert.equal(validatePublicEvent(sig).ok, true);
});

test("DELIVERYOS/Copiloto indisponível não interrompe Entregas", async () => {
  const session = new EntregasSession("unit-1");
  const r = session.createTripWithEvents({
    trip_id: "trip-up",
    unit_id: "unit-1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const bad = new UnavailableCopilotoAdapter();
  const flush = await session.tryPublish(bad);
  assert.ok(flush.failed >= 1);
  // domínio intacto
  assert.equal(r.state.trip.state, "preparando_saida");
  // outbox ainda tem pendência
  assert.ok(session.outbox.pending().length >= 1);

  // operação seguinte ainda funciona
  const r2 = session.startTripWithEvents(r.state, now, rider);
  assert.equal(r2.ok, true);
});

test("adapter substituível + feed lê publicados", async () => {
  const session = new EntregasSession("unit-1");
  session.createTripWithEvents({
    trip_id: "trip-feed",
    unit_id: "unit-1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  const consumer = createMockCopilotoConsumer(true);
  const adapter = new MockCopilotoAdapter(consumer);
  await session.tryPublish(adapter);
  assert.ok(consumer.received.length >= 1);

  const feed = new InMemoryEntregasEventFeed(session.outbox);
  const list = await feed.list();
  assert.ok(list.length >= 1);
  assert.equal(list[0].source, "entregas");

  // reprocess: duplicate ignored
  await session.tryPublish(adapter);
  const n = consumer.received.length;
  await session.tryPublish(adapter);
  assert.equal(consumer.received.length, n);
});

test("payload sem PII proibida", () => {
  const dirty = {
    ...EXAMPLE_TRIP_CREATED,
    payload: { telefone: "11999999999", delivery_count: 1 },
  };
  const r = validatePublicEvent(dirty);
  assert.equal(r.ok, false);
});

test("manifesto de módulo válido e shell desabilitado", () => {
  const v = validateModuleManifest(ENTREGAS_MODULE_MANIFEST);
  assert.equal(v.ok, true);
  assert.equal(ENTREGAS_MODULE_MANIFEST.enabled_in_shell, false);
  assert.equal(
    ENTREGAS_MODULE_MANIFEST.feature_flags["entregas.copiloto_live_connection"],
    false,
  );
});

test("nenhum import do Copiloto/Capacidade Viva dentro de src/entregas", () => {
  const root = join(__dirname, "..");
  const forbidden = [
    "capacidade-viva",
    "capacidade_viva",
    "cv-cal-tata",
    "copiloto-v33",
    "deliveryos-copiloto",
    "body[data-mode]",
    "from \"../copiloto",
    "from '../../copiloto",
  ];
  const files: string[] = [];
  function walk(d: string) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  }
  walk(root);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const frag of forbidden) {
      assert.equal(
        text.includes(frag),
        false,
        `Import/acoplamento proibido "${frag}" em ${f}`,
      );
    }
  }
});

test("handoff público não cria trip_id", () => {
  const session = new EntregasSession("unit-1");
  let h = session.createHandoffWithEvents({
    handoff_id: "ho-1",
    unit_id: "unit-1",
    external_order_ref: "IF-1",
    occurred_at: now,
    created_by: "exp",
  });
  assert.equal(h.ok, true);
  if (!h.ok) return;
  h = session.confirmHandoffWithEvents(h.state, {
    occurred_at: now,
    conference_actor: "exp1",
    handoff_actor: "exp1",
    courier_verified: true,
    courier_verification_method: "codigo_app",
    external_courier_ref: asExternalCourierRef("plt-xx"),
    volumes: { expected: 1, delivered: 1 },
    order_identified: true,
  });
  assert.equal(h.ok, true);
  if (!h.ok) return;
  const pub = session.outbox
    .all()
    .map((r) => r.event)
    .find((e) => e.event_type === "handoff_transferred");
  assert.ok(pub);
  assert.equal(pub!.trip_id, undefined);
  assert.equal(pub!.payload.creates_trip, false);
});

test("G3 emite delivery_unconfirmed público sem culpa", () => {
  const session = new EntregasSession("unit-1");
  let r = session.createTripWithEvents({
    trip_id: "trip-g3",
    unit_id: "unit-1",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d1", order_ref: "A" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = session.startTripWithEvents(r.state, now, rider);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = session.startReturnWithEvents(r.state, now, rider, policy);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const un = session.outbox
    .all()
    .map((x) => x.event)
    .find((e) => e.event_type === "delivery_unconfirmed");
  assert.ok(un);
  assert.equal(un!.payload.blame, false);
  assert.equal(un!.payload.trigger, "G3_trip_returning");
});

// run queue
(async () => {
  const queue = (test as unknown as { queue: Array<() => Promise<void>> }).queue;
  for (const fn of queue) await fn();
  console.log(`\n=== ${passed} integration tests OK ===\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
