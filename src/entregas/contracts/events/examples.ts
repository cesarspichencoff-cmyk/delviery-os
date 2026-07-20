import { PUBLIC_EVENTS_SCHEMA_VERSION } from "./types";
import type { EntregasPublicEvent } from "./types";

/** Exemplos anonimizados para testes de contrato e documentação */
export const EXAMPLE_TRIP_CREATED: EntregasPublicEvent = {
  event_id: "ex-evt-001",
  event_type: "trip_created",
  schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
  occurred_at: "2026-07-20T18:00:00.000Z",
  recorded_at: "2026-07-20T18:00:00.100Z",
  idempotency_key: "trip_created:trip-anon-1",
  source: "entregas",
  source_health: "ok",
  confidence: "observed",
  unit_id: "unit-demo",
  trip_id: "trip-anon-1",
  rider_actor_id: "rid_opaque_a1b2",
  payload: {
    delivery_count: 2,
    // sem nomes, telefones, endereços completos
  },
  correlation_id: "corr-trip-anon-1",
  contract_version: "COR-ENTREGAS-V1@1.0.3",
};

export const EXAMPLE_DELIVERY_UNCONFIRMED: EntregasPublicEvent = {
  event_id: "ex-evt-002",
  event_type: "delivery_unconfirmed",
  schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
  occurred_at: "2026-07-20T18:30:00.000Z",
  recorded_at: "2026-07-20T18:30:00.050Z",
  idempotency_key: "delivery_unconfirmed:G3:del-anon-1:trip-anon-1",
  source: "entregas",
  source_health: "ok",
  confidence: "observed",
  unit_id: "unit-demo",
  trip_id: "trip-anon-1",
  delivery_id: "del-anon-1",
  rider_actor_id: "rid_opaque_a1b2",
  payload: {
    trigger: "G3_trip_returning",
    active: true,
    blame: false,
  },
  correlation_id: "corr-trip-anon-1",
  causation_id: "ex-evt-return-started",
  contract_version: "COR-ENTREGAS-V1@1.0.3",
};

export const EXAMPLE_HANDOFF_TRANSFERRED: EntregasPublicEvent = {
  event_id: "ex-evt-003",
  event_type: "handoff_transferred",
  schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
  occurred_at: "2026-07-20T19:00:00.000Z",
  recorded_at: "2026-07-20T19:00:00.080Z",
  idempotency_key: "handoff_transferred:ho-anon-1",
  source: "entregas",
  source_health: "ok",
  confidence: "observed",
  unit_id: "unit-demo",
  handoff_id: "ho-anon-1",
  payload: {
    courier_verified: true,
    courier_verification_method: "codigo_plataforma",
    volumes_expected: 2,
    volumes_delivered: 2,
    creates_trip: false,
    store_physical_responsibility: "ended",
    // sem nome/doc do courier externo
  },
  correlation_id: "corr-ho-anon-1",
  contract_version: "COR-ENTREGAS-V1@1.0.3",
};

export const EXAMPLE_ABSENCE_NO_WAIT: EntregasPublicEvent = {
  event_id: "ex-evt-004",
  event_type: "source_quality_issue",
  schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
  occurred_at: "2026-07-20T19:10:00.000Z",
  recorded_at: "2026-07-20T19:10:00.020Z",
  idempotency_key: "source_quality:missing_rider_arrived:trip-anon-2",
  source: "entregas",
  source_health: "degraded",
  confidence: "unknown",
  unit_id: "unit-demo",
  trip_id: "trip-anon-2",
  payload: {
    issue: "missing_evidence",
    missing_signal: "rider_arrived_store",
    // ausência de evidência — NÃO wait_seconds: 0
    wait_seconds: null,
  },
  correlation_id: "corr-trip-anon-2",
};
