/**
 * Bateria mínima COR — fundação F0.
 * Executar: npm run test:entregas
 */
import assert from "node:assert/strict";
import { asExternalCourierRef, asInternalRiderActorId } from "./brands";
import { CONTRACT_VERSION_FULL } from "./contract";
import {
  applyDeliveryConfirmed,
  applyUnconfirmed,
  canApplyUnconfirmedTrigger,
} from "./delivery-rules";
import { InMemoryEventLog } from "./event-log";
import {
  confirmHandoff,
  createHandoff,
  markCourierArrived,
} from "./handoff-machine";
import { createPilotPolicy } from "./policy";
import {
  closeTripAutomatic,
  createTrip,
  startReturn,
  startTrip,
  removeDeliveryFromTrip,
} from "./trip-machine";
import { DomainError } from "./types";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    throw e;
  }
}

const policy = createPilotPolicy();
const rider = asInternalRiderActorId("rider-paulo");
const now = "2026-07-20T18:00:00.000Z";

console.log("\n=== Entregas foundation tests (COR 1.0.3) ===\n");

test("contract_version em trip_created", () => {
  const log = new InMemoryEventLog();
  const r = createTrip(log, {
    trip_id: "t1",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d1", order_ref: "ORD-1" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.state.trip.contract_version, CONTRACT_VERSION_FULL);
  assert.equal(r.state.trip.state, "preparando_saida");
  assert.equal(r.state.trip.courier_actor_id, rider);
});

test("max_stops configurável (5) — rejeita 6", () => {
  const log = new InMemoryEventLog();
  const dels = Array.from({ length: 6 }, (_, i) => ({
    delivery_id: `d${i}`,
    order_ref: `O${i}`,
  }));
  const r = createTrip(log, {
    trip_id: "t-max",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: dels,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "MAX_STOPS_EXCEEDED");
});

test("max_stops policy=3 permite reconfigurar domínio", () => {
  const log = new InMemoryEventLog();
  const p = createPilotPolicy({ max_stops: 3 });
  const r = createTrip(log, {
    trip_id: "t3",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy: p,
    initial_deliveries: [
      { delivery_id: "a", order_ref: "1" },
      { delivery_id: "b", order_ref: "2" },
      { delivery_id: "c", order_ref: "3" },
    ],
  });
  assert.equal(r.ok, true);
});

test("trip_return_started sem exigir todos stops resolvidos + G3", () => {
  const log = new InMemoryEventLog();
  let r = createTrip(log, {
    trip_id: "t-ret",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: [
      { delivery_id: "d1", order_ref: "A" },
      { delivery_id: "d2", order_ref: "B" },
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = startTrip(log, r.state, now, rider);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // d1 e d2 em_rota — sem confirmação
  r = startReturn(log, r.state, now, rider, policy);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.state.trip.state, "retornando");
  const d1 = r.state.deliveries.get("d1")!;
  const d2 = r.state.deliveries.get("d2")!;
  assert.equal(d1.state, "entrega_sem_confirmacao");
  assert.equal(d1.unconfirmed_trigger, "G3_trip_returning");
  assert.equal(d2.unconfirmed_trigger, "G3_trip_returning");
  // pendência não impede estado retornando
  assert.equal(r.state.trip.state, "retornando");
});

test("active=false fora de G1–G5 (G3 não aplica)", () => {
  const log = new InMemoryEventLog();
  let r = createTrip(log, {
    trip_id: "t-rm",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: [
      { delivery_id: "keep", order_ref: "K" },
      { delivery_id: "drop", order_ref: "X" },
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = startTrip(log, r.state, now, rider);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = removeDeliveryFromTrip(
    log,
    r.state,
    "drop",
    now,
    "cliente cancelou rota",
    "ops-1",
    policy,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.state.deliveries.get("drop")!.active, false);
  assert.equal(canApplyUnconfirmedTrigger(r.state.deliveries.get("drop")!), false);

  r = startReturn(log, r.state, now, rider, policy);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // drop permanece sem G3
  assert.notEqual(
    r.state.deliveries.get("drop")!.state,
    "entrega_sem_confirmacao",
  );
  assert.equal(
    r.state.deliveries.get("keep")!.state,
    "entrega_sem_confirmacao",
  );
});

test("GPS não confirma entrega", () => {
  const d = {
    delivery_id: "d",
    trip_id: "t",
    order_ref: "o",
    channel: "proprio" as const,
    planned_stop_order: 1,
    state: "chegada_detectada" as const,
    active: true,
  };
  assert.throws(
    () =>
      applyDeliveryConfirmed(d, {
        origin: "system",
        actor_id: undefined,
        payload: { source: "gps" },
        occurred_at: now,
      }),
    (e: unknown) =>
      e instanceof DomainError && e.code === "GPS_CANNOT_CONFIRM_DELIVERY",
  );
});

test("confirmação humana de entrega", () => {
  const d = {
    delivery_id: "d",
    trip_id: "t",
    order_ref: "o",
    channel: "proprio" as const,
    planned_stop_order: 1,
    state: "chegada_detectada" as const,
    active: true,
  };
  const out = applyDeliveryConfirmed(d, {
    origin: "device",
    actor_id: rider,
    payload: {},
    occurred_at: now,
  });
  assert.equal(out.state, "entregue_confirmado");
});

test("close automático: unconfirmed não bloqueia (após G3 desfecho válido)", () => {
  const log = new InMemoryEventLog();
  let r = createTrip(log, {
    trip_id: "t-close",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops-1",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d1", order_ref: "A" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = startTrip(log, r.state, now, rider);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  r = startReturn(log, r.state, now, rider, policy);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // G3 já deixou entrega_sem_confirmacao — desfecho válido para require_all
  r = closeTripAutomatic(log, r.state, now, policy, {
    geofence: true,
    note: "F0 stub evidence",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.state.trip.state, "encerrada");
  assert.equal(r.state.trip.close_mode, "automatic");
  assert.equal(
    r.state.deliveries.get("d1")!.state,
    "entrega_sem_confirmacao",
  );
});

test("Handoff: sem verificação falha; com verificação conclui sem Trip", () => {
  const log = new InMemoryEventLog();
  let r = createHandoff(log, {
    handoff_id: "h1",
    unit_id: "itaim",
    external_order_ref: "IFOOD-0724",
    occurred_at: now,
    created_by: "exp-1",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  r = markCourierArrived(
    log,
    r.state,
    now,
    "exp-1",
    asExternalCourierRef("plt-***89"),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const fail = confirmHandoff(log, r.state, {
    occurred_at: now,
    conference_actor: "exp-1",
    handoff_actor: "exp-1",
    courier_verified: false,
    courier_verification_method: "",
    volumes: { expected: 2, delivered: 2 },
    order_identified: true,
  });
  assert.equal(fail.ok, false);

  const ok = confirmHandoff(log, r.state, {
    occurred_at: now,
    conference_actor: "exp-1",
    handoff_actor: "exp-2",
    courier_verified: true,
    courier_verification_method: "codigo_app_plataforma",
    external_courier_ref: asExternalCourierRef("plt-***89"),
    volumes: { expected: 2, delivered: 2 },
    order_identified: true,
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.state.confirmed, true);
  assert.equal(ok.state.state, "repassado");
  assert.equal(ok.state.courier_verified, true);
  // nenhum trip_id no handoff
  assert.equal("trip_id" in ok.state, false);
  const transfer = log
    .all()
    .find((e) => e.event_type === "handoff_transferred");
  assert.equal(transfer?.payload.creates_trip, false);
  assert.equal(transfer?.payload.store_physical_responsibility, "ended");
});

test("brands: rider e external_courier são campos distintos", () => {
  const log = new InMemoryEventLog();
  const r = createTrip(log, {
    trip_id: "t-brand",
    unit_id: "itaim",
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: now,
    policy,
    initial_deliveries: [{ delivery_id: "d", order_ref: "1" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Handoff usa outro tipo de id
  const ext = asExternalCourierRef("ext-1");
  assert.notEqual(String(r.state.trip.courier_actor_id), "");
  assert.notEqual(String(ext), String(rider));
  // Documentação: trip field is courier_actor_id (internal)
  assert.ok(r.state.trip.courier_actor_id);
});

test("G1–G5 applyUnconfirmed respeita active", () => {
  const inactive = {
    delivery_id: "x",
    trip_id: "t",
    order_ref: "o",
    channel: "proprio" as const,
    planned_stop_order: 1,
    state: "em_rota" as const,
    active: false,
  };
  const out = applyUnconfirmed(inactive, "G4_trip_closed", now);
  assert.equal(out.state, "em_rota"); // unchanged
});

console.log(`\n=== ${passed} foundation tests OK ===\n`);
// Integration suite is separate: npm run test:entregas runs both via package script
