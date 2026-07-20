import { createHash, randomUUID } from "node:crypto";
import { CONTRACT_VERSION_FULL } from "../foundation/contract";
import type { DomainEvent } from "../foundation/types";
import type { PublicEventType } from "../contracts/events/catalog";
import { isPublicEventType } from "../contracts/events/catalog";
import {
  PUBLIC_EVENTS_SCHEMA_VERSION,
  type EntregasPublicEvent,
  type EventConfidence,
  type SourceHealth,
} from "../contracts/events/types";

/** Anonimiza actor_id interno para o feed público */
export function anonymizeRiderActorId(internalId: string): string {
  const h = createHash("sha256").update(`entregas-rider:${internalId}`).digest("hex");
  return `rid_${h.slice(0, 12)}`;
}

const DOMAIN_TO_PUBLIC: Record<string, PublicEventType | null> = {
  trip_created: "trip_created",
  delivery_added: "delivery_added",
  delivery_removed: "delivery_removed",
  trip_started: "trip_started",
  arrival_detected: "arrival_detected",
  delivery_confirmed: "delivery_confirmed",
  delivery_unconfirmed: "delivery_unconfirmed",
  customer_not_found: "customer_not_found",
  return_requested: "return_requested",
  trip_return_started: "trip_return_started",
  return_detected: "return_detected",
  trip_closed_automatic: "trip_closed_automatic",
  trip_closed_manual: "trip_closed_manual",
  handoff_created: "handoff_created",
  handoff_courier_arrived: "handoff_courier_arrived",
  handoff_conference_done: "handoff_conference_done",
  handoff_transferred: "handoff_transferred",
  handoff_exception: "handoff_exception",
  occurrence_opened: "occurrence_opened",
  occurrence_updated: "occurrence_updated",
  occurrence_closed: "occurrence_closed",
  // domínio interno sem eco público
  delivery_departed: null,
  sync_received: null,
  trip_admin_correction_recorded: null,
  trip_signal_lost: "rider_location_stale",
  trip_signal_recovered: null,
};

function stripPii(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ban = new Set([
    "full_name",
    "nome",
    "nome_completo",
    "telefone",
    "phone",
    "address",
    "endereco",
    "ranking",
    "whatsapp_raw",
    "cpf",
  ]);
  for (const [k, v] of Object.entries(payload)) {
    if (ban.has(k.toLowerCase()) || ban.has(k)) continue;
    if (k === "courier_actor_id" && typeof v === "string") {
      out.rider_actor_id_internal_omitted = true;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export interface BuildPublicOptions {
  unit_id: string;
  correlation_id?: string;
  source_health?: SourceHealth;
  confidence?: EventConfidence;
  /** occurred_at offline preservado do domínio */
  preserve_occurred_at?: boolean;
}

/**
 * Mapeia DomainEvent da fundação → envelope público.
 * Retorna null se o tipo não for público.
 */
export function domainEventToPublic(
  de: DomainEvent,
  opts: BuildPublicOptions,
): EntregasPublicEvent | null {
  const mapped = DOMAIN_TO_PUBLIC[de.event_type];
  if (mapped === null) return null;
  const event_type: PublicEventType | undefined =
    mapped ??
    (isPublicEventType(de.event_type) ? de.event_type : undefined);
  if (!event_type) return null;

  const payload = stripPii({ ...de.payload });
  if (de.event_type === "delivery_removed") {
    payload.active = false;
    payload.operational_pressure = false;
  }
  if (de.event_type === "delivery_unconfirmed") {
    payload.blame = false;
  }

  let rider_actor_id: string | undefined;
  if (typeof de.payload.courier_actor_id === "string") {
    rider_actor_id = anonymizeRiderActorId(de.payload.courier_actor_id);
  } else if (de.actor_id && de.object_type === "trip") {
    rider_actor_id = anonymizeRiderActorId(de.actor_id);
  }

  const trip_id =
    de.object_type === "trip"
      ? de.object_id
      : typeof de.payload.trip_id === "string"
        ? de.payload.trip_id
        : undefined;
  const delivery_id =
    de.object_type === "delivery"
      ? de.object_id
      : typeof de.payload.delivery_id === "string"
        ? de.payload.delivery_id
        : undefined;
  const handoff_id =
    de.object_type === "handoff" ? de.object_id : undefined;
  const occurrence_id =
    de.object_type === "occurrence" ? de.object_id : undefined;

  return {
    event_id: de.event_id,
    event_type,
    schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
    occurred_at: de.occurred_at,
    recorded_at: de.recorded_at,
    synced_at: de.synced_at,
    idempotency_key: de.idempotency_key,
    source: "entregas",
    source_health: opts.source_health ?? "ok",
    confidence: opts.confidence ?? "observed",
    unit_id: opts.unit_id,
    trip_id,
    delivery_id,
    handoff_id,
    occurrence_id,
    rider_actor_id,
    payload,
    correlation_id:
      opts.correlation_id ??
      trip_id ??
      handoff_id ??
      delivery_id ??
      de.event_id,
    causation_id:
      typeof de.payload.causation_id === "string"
        ? de.payload.causation_id
        : undefined,
    contract_version: de.contract_version ?? CONTRACT_VERSION_FULL,
  };
}

/** Sinal explícito (não domain event COR) — ex.: delivery_ready, rider_arrived_store */
export function buildSignalEvent(input: {
  event_type: PublicEventType;
  unit_id: string;
  occurred_at: string;
  recorded_at?: string;
  idempotency_key: string;
  payload?: Record<string, unknown>;
  trip_id?: string;
  delivery_id?: string;
  handoff_id?: string;
  rider_internal_id?: string;
  correlation_id?: string;
  confidence?: EventConfidence;
  source_health?: SourceHealth;
  /** null explícito em campos de tempo ausentes — nunca 0 fabricado */
  absence_fields?: Record<string, null>;
}): EntregasPublicEvent {
  const payload = {
    ...stripPii(input.payload ?? {}),
    ...input.absence_fields,
  };
  return {
    event_id: randomUUID(),
    event_type: input.event_type,
    schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
    occurred_at: input.occurred_at,
    recorded_at: input.recorded_at ?? new Date().toISOString(),
    idempotency_key: input.idempotency_key,
    source: "entregas",
    source_health: input.source_health ?? "ok",
    confidence: input.confidence ?? "observed",
    unit_id: input.unit_id,
    trip_id: input.trip_id,
    delivery_id: input.delivery_id,
    handoff_id: input.handoff_id,
    rider_actor_id: input.rider_internal_id
      ? anonymizeRiderActorId(input.rider_internal_id)
      : undefined,
    payload,
    correlation_id:
      input.correlation_id ?? input.trip_id ?? input.delivery_id ?? randomUUID(),
    contract_version: CONTRACT_VERSION_FULL,
  };
}
