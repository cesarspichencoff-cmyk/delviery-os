import assert from "node:assert/strict";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import { validatePublicEvent } from "../entregas/contracts/events/validate";
import { checkEvent } from "./contracts/event-catalog";
import { validarPayload } from "./contracts/event-schema";
import {
  adaptarEventoPublicoEntregas,
  adaptarLotePublicoEntregas,
} from "./ingest/entregas-shadow-adapter";

let passed = 0;
function test(nome: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("  ok  " + nome);
}

function ev(
  event_type: EntregasPublicEvent["event_type"],
  extra: Partial<EntregasPublicEvent> = {},
): EntregasPublicEvent {
  return {
    event_id: "pub-" + event_type,
    event_type,
    schema_version: "1.0.0",
    occurred_at: "2026-09-30T17:00:00.000Z",
    recorded_at: "2026-09-30T17:00:01.000Z",
    idempotency_key: "idem-" + event_type,
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

console.log("\n=== ENTREGAS PUBLIC -> PLATFORM SHADOW ADAPTER ===\n");

test("EA1 só lifecycle de Trip semanticamente equivalente é traduzido", () => {
  const casos = [
    ["trip_created", "trip_created"],
    ["trip_started", "trip_started"],
    ["trip_return_started", "trip_return_started"],
    ["trip_closed_automatic", "trip_closed"],
    ["trip_closed_manual", "trip_closed"],
  ] as const;

  for (const [origem, alvo] of casos) {
    const r = adaptarEventoPublicoEntregas(ev(origem));
    assert.equal(r.ok, true, origem);
    if (!r.ok) continue;
    assert.equal(r.evento.event_type, alvo);
    assert.equal(r.evento.trip_id, "T1");
    assert.equal(r.evento.source_mode, "simulated");
    assert.equal(r.evento.origin, "source");
  }
});

test("EA2 fato de uma Delivery NÃO vira estado da Trip inteira", () => {
  for (const tipo of [
    "arrival_detected",
    "delivery_confirmed",
    "delivery_unconfirmed",
  ] as const) {
    const r = adaptarEventoPublicoEntregas(
      ev(tipo, { delivery_id: "D1" }),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.motivo, "tipo_sem_equivalencia_segura");
  }
});

test("EA3 return_detected não é inventado como trip_returned", () => {
  const r = adaptarEventoPublicoEntregas(ev("return_detected"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "tipo_sem_equivalencia_segura");
});

test("EA4 source_mode ausente é recusado, nunca assume real", () => {
  const bruto = ev("trip_started");
  const { source_mode: _removido, ...resto } = bruto;
  const semModo = resto as EntregasPublicEvent;
  assert.equal(validatePublicEvent(semModo).ok, true);

  const r = adaptarEventoPublicoEntregas(semModo);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "source_mode_ausente");
});

test("EA5 trip_id ausente é recusado", () => {
  const r = adaptarEventoPublicoEntregas(
    ev("trip_started", { trip_id: undefined }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "trip_id_ausente");
});

test("EA6 close manual e automático convergem sem apagar procedência", () => {
  for (const tipo of ["trip_closed_manual", "trip_closed_automatic"] as const) {
    const r = adaptarEventoPublicoEntregas(ev(tipo));
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.evento.event_type, "trip_closed");
    assert.equal(r.evento.payload.source_event_type, tipo);
  }
});

test("EA7 saída adaptada passa no contrato da plataforma", () => {
  for (const tipo of [
    "trip_created",
    "trip_started",
    "trip_return_started",
    "trip_closed_manual",
  ] as const) {
    const r = adaptarEventoPublicoEntregas(ev(tipo));
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(checkEvent(r.evento).ok, true);
    assert.equal(
      validarPayload(r.evento.event_type, r.evento.payload).ok,
      true,
    );
  }
});

test("EA8 real, simulated e control permanecem separados", () => {
  for (const modo of ["real", "simulated", "control"] as const) {
    const r = adaptarEventoPublicoEntregas(
      ev("trip_started", { source_mode: modo }),
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.evento.source_mode, modo);
  }
});

test("EA9 lote separa adaptados de não equivalentes sem lançar", () => {
  const r = adaptarLotePublicoEntregas([
    ev("trip_created"),
    ev("delivery_confirmed", { delivery_id: "D1" }),
    ev("trip_started"),
    ev("handoff_transferred", { trip_id: undefined, handoff_id: "H1" }),
  ]);

  assert.deepEqual(
    r.eventos.map((e) => e.event_type),
    ["trip_created", "trip_started"],
  );
  assert.equal(r.recusados.length, 2);
  assert.ok(
    r.recusados.every((x) => x.motivo === "tipo_sem_equivalencia_segura"),
  );
});

console.log("\nENTREGAS_SHADOW_ADAPTER: " + passed + "/9 PASS");
