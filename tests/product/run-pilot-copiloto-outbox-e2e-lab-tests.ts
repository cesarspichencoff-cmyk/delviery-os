/**
 * LAB ONLY — proves the real PgEntregasUnitOfWork public outbox can be read by
 * CommittedOutboxEntregasEventFeed, ingested transactionally into platform
 * event_log and projected to Entregas + Copiloto in ONE disposable PostgreSQL.
 *
 * NOT wired to any runtime, Android, TATA source, real producer or live mode.
 * Test explicitly fails closed when not executed on a private GitHub runner PG.
 * Does not prove producer attestation, production RLS or real operation.
 */
import assert from "node:assert/strict";
import type { Delivery, DomainEvent, Trip } from "../../src/entregas/foundation/types";
import { asInternalRiderActorId } from "../../src/entregas/foundation/brands";
import { CONTRACT_VERSION_FULL } from "../../src/entregas/foundation/contract";
import { domainEventToPublic, buildSignalEvent } from "../../src/entregas/integration/public-event-builder";
import { CommittedOutboxEntregasEventFeed } from "../../src/entregas/integration/durable-event-feed";
import { PgEntregasUnitOfWork } from "../../src/entregas/persistence/pg-uow";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { PgTransactionalWriter } from "../../src/platform/persistence/pg-repositories";
import {
  EntregasLiveConsumer,
  type ConsumerCheckpointState,
} from "../../src/platform/runtime/entregas-live-consumer";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { copilotoEntregasLeitura } from "../../src/product/viewmodels/copiloto-entregas-leitura";

const ROOT = process.env.DELIVERYOS_PG_URL ?? "";
function safeRunnerUrl(): boolean {
  if (process.env.GITHUB_ACTIONS !== "true") return false;
  try {
    const u = new URL(ROOT);
    const socket = u.searchParams.get("host") ?? "";
    return ["postgres:", "postgresql:"].includes(u.protocol)
      && u.hostname === "localhost"
      && u.port === "55434"
      && socket.includes("deliveryos-sock-")
      && socket.startsWith("/home/runner/work/_temp/")
      && u.pathname === "/postgres";
  } catch { return false; }
}
if (!safeRunnerUrl()) {
  console.error("LAB_REFUSED: requires owned ephemeral GitHub Actions PG socket; never operational DB");
  process.exit(78);
}

const NOW = new Date("2026-10-20T02:20:00.000Z");
const OCCURRED = "2026-10-20T02:19:00.000Z";
const UNIT = "ITAIM";
const TRIP = "LAB_E2E_TRIP_20261020";
const DELIVERY = "LAB_E2E_DELIVERY_20261020";
const events = ["LAB_E2E_CREATED_20261020", "LAB_E2E_STARTED_20261020"] as const;
let passed = 0;
function ok(cond: unknown, label: string) {
  assert.ok(cond, label);
  passed++;
  console.log("ok PILOT-COPILOTO-E2E-" + passed + " " + label);
}
function domain(id: string, event_type: "trip_created" | "trip_started"): DomainEvent {
  return {
    event_id: id,
    object_type: "trip",
    object_id: TRIP,
    event_type,
    occurred_at: OCCURRED,
    recorded_at: OCCURRED,
    origin: "device",
    actor_id: "LAB_RIDER_ITAIM",
    idempotency_key: "LAB_DOMAIN_" + id,
    payload: { lab_only: true },
    clock_trust: "trusted",
    contract_version: CONTRACT_VERSION_FULL,
  };
}
async function main() {
  const db = await bancoIsolado(ROOT, undefined, "lab_pilot_copiloto");
  try {
    await db.cliente.query(
      "INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Lab Itaim'),('VILA-LAB','Lab Vila')"
    );
    await db.cliente.query(
      "INSERT INTO identity.actor(actor_id,unit_id,role,label) VALUES ('LAB_RIDER_ITAIM','ITAIM','motoboy_interno','Rider Ficticio')"
    );
    const unit = new PgEntregasUnitOfWork(db.cliente, UNIT);
    const first = domain(events[0], "trip_created");
    const second = domain(events[1], "trip_started");
    const trip: Trip = {
      trip_id: TRIP,
      unit_id: UNIT,
      courier_actor_id: asInternalRiderActorId("LAB_RIDER_ITAIM"),
      created_by: "LAB_COORDINATOR_ITAIM",
      state: "em_rota",
      delivery_ids: [DELIVERY],
      created_at: OCCURRED,
      started_at: OCCURRED,
      last_event_id: second.event_id,
      contract_version: CONTRACT_VERSION_FULL,
      policy_bundle_id: "LAB_POLICY_ONLY",
    };
    const delivery: Delivery = {
      delivery_id: DELIVERY,
      trip_id: TRIP,
      order_ref: "LAB_FAKE_ORDER_20261020",
      channel: "proprio",
      planned_stop_order: 1,
      state: "em_rota",
      active: true,
    };
    await unit.trips.save({ trip, deliveries: [delivery], version: 1 }, null);
    await unit.events.append([first, second]);
    for (const e of [first, second]) {
      const pub = domainEventToPublic(e, { unit_id: UNIT, source_mode: "simulated" });
      assert.ok(pub);
      await unit.outbox.enqueue({
        outbox_id: "LAB_OUTBOX_" + e.event_id,
        event: pub,
        status: "pending",
        attempts: 0,
        created_at: OCCURRED,
      });
    }
    const signal = buildSignalEvent({
      event_type: "delivery_ready",
      unit_id: UNIT,
      trip_id: TRIP,
      occurred_at: OCCURRED,
      recorded_at: OCCURRED,
      idempotency_key: "LAB_SIGNAL_INDEPENDENT",
      source_mode: "simulated",
      payload: { lab_only: true },
    });
    await unit.outbox.enqueue({
      outbox_id: "LAB_OUTBOX_INDEPENDENT",
      event: signal,
      status: "pending",
      attempts: 0,
      created_at: OCCURRED,
    });
    await unit.commit();
    const rows = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.domain_event WHERE unit_id=$1", [UNIT]
    );
    ok(rows[0]?.n === 2, "actual PgUnitOfWork committed two synthetic domain events");
    const trips = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.trip WHERE trip_id=$1", [TRIP]
    );
    ok(trips[0]?.n === 1, "synthetic Trip exists in Entregas database");
    const stops = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.delivery WHERE trip_id=$1 AND order_ref=$2",
      [TRIP, "LAB_FAKE_ORDER_20261020"]
    );
    ok(stops[0]?.n === 1, "Trip has one normalized fictitious order stop, not an empty route");
    const feed = new CommittedOutboxEntregasEventFeed(
      () => new PgEntregasUnitOfWork(db.cliente, UNIT).outbox
    );
    const sample = await feed.poll(null);
    ok(sample.events.length === 3 &&
       sample.events.every(e => e.unit_id === UNIT && e.source_mode === "simulated"),
       "real committed-outbox feed contains three synthetic events with same unit and mode");
    ok(sample.events.some(e => e.event_type === "delivery_ready"),
      "independent signal is durable without fabricated domain_event");

    let checkpoint: ConsumerCheckpointState = {
      version: 1, checkpoint: null, isolated_count: 0, updated_at: null,
    };
    const state = {
      async load() { return structuredClone(checkpoint); },
      async save(v: ConsumerCheckpointState) { checkpoint = structuredClone(v); },
    };
    const consumer = new EntregasLiveConsumer({
      enabled: true, feed,
      writer: new PgTransactionalWriter(db.cliente),
      control: { async canRun() { return true; } },
      state, now: () => NOW,
    });
    const result = await consumer.tick();
    ok(result.status === "worked" && result.ingested === 2 && result.isolated === 1,
      "actual consumer+adapter+ingest commits two Trip events and isolates non-Trip signal");
    ok(checkpoint.checkpoint === signal.event_id && checkpoint.isolated_count === 1 &&
       checkpoint.last_isolation?.reason === "tipo_sem_equivalencia_segura",
       "checkpoint and independent-signal isolation explicit");
    const saved = await db.cliente.query<{ source_mode: string; n: number }>(
      "SELECT source_mode, count(*)::int AS n FROM platform.event_log WHERE unit_id=$1 GROUP BY source_mode", [UNIT]
    );
    ok(saved.length === 1 && saved[0].source_mode === "simulated" && saved[0].n === 2,
      "platform.event_log persisted only simulated Trip events");
    const outbox = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM platform.outbox WHERE idempotency_key LIKE 'entregas-public:LAB_DOMAIN_%'"
    );
    ok(outbox[0]?.n === 2, "same platform transaction produced corresponding outbox messages");

    const reality = await lerRealidadeDeEntregas(db.cliente, { agora: NOW, unit_id: UNIT });
    const original = reality.projecoes.find(x => x.unit_id === UNIT && x.source_mode === "simulated");
    ok(!!original && original.viagens.some(v => v.trip_id === TRIP),
      "actual operational projection contains same synthetic Trip");
    const visible = copilotoEntregasLeitura({
      disponivel: true,
      realidade: {
        ...reality,
        projecoes: reality.projecoes.map(g => ({
          ...g, viagens: g.viagens.map(v => ({
            ...v, eventos: { length: v.eventos.length },
          })),
        })),
      },
    }, UNIT);
    ok(visible.estado === "observado" && visible.grupos.length === 1 &&
       visible.grupos[0].source_mode === "simulated" && visible.grupos[0].viagens_na_projecao === 1 &&
       visible.nenhuma_acao_executada,
       "Copiloto read-only shows same Trip strictly as simulated, no action");
    const foreign = copilotoEntregasLeitura({
      disponivel: true,
      realidade: { ...reality, projecoes: reality.projecoes.map(g => ({
        ...g, viagens: g.viagens.map(v => ({ ...v, eventos: { length: v.eventos.length } })),
      })) },
    }, "VILA-LAB");
    ok(foreign.estado === "sem_evidencia" && foreign.grupos.length === 0,
      "second unit sees no fictitious Itaim Trip in UI view-model");
    const secondTick = await consumer.tick();
    ok(secondTick.status === "idle" && secondTick.ingested === 0,
      "same durable cursor is idle on retry; no duplicated ingest");
    console.log("PILOT_COPILOTO_OUTBOX_E2E_LAB: " + passed + "/" + passed +
      " PASS (ACTUAL PG UOW, FEED, PLATFORM, COPILOTO / SIMULATED ONLY / NO OPERATION)");
  } finally {
    await db.descartar();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
