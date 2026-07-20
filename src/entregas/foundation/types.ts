import type { InternalRiderActorId, ExternalCourierRef } from "./brands";
import type { ContractVersion } from "./contract";
import type {
  ActorAvailabilityState,
  Channel,
  ClockTrust,
  CloseMode,
  DeliveryState,
  EventOrigin,
  HandoffState,
  ObjectType,
  TripState,
  UnconfirmedTrigger,
} from "./enums";

export interface DomainEvent {
  event_id: string;
  object_type: ObjectType;
  object_id: string;
  event_type: string;
  occurred_at: string;
  recorded_at: string;
  synced_at?: string;
  origin: EventOrigin;
  device_id?: string;
  actor_id?: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  clock_trust: ClockTrust;
  contract_version: ContractVersion;
}

export interface Delivery {
  delivery_id: string;
  trip_id: string;
  order_ref: string;
  channel: Channel;
  planned_stop_order: number;
  actual_stop_order?: number;
  state: DeliveryState;
  arrival_detected_at?: string;
  confirmed_at?: string;
  unconfirmed_at?: string;
  unconfirmed_trigger?: UnconfirmedTrigger;
  occurrence_id?: string;
  cancelled_reason?: string;
  active: boolean;
  removed_at?: string;
  removed_reason?: string;
  removed_by?: string;
}

/**
 * Trip — viagem própria.
 * courier_actor_id: SEMPRE InternalRiderActorId (motoboy da casa).
 * Nunca ExternalCourierRef.
 */
export interface Trip {
  trip_id: string;
  unit_id: string;
  /** Motoboy da casa — COR nome courier_actor_id; tipado como rider interno */
  courier_actor_id: InternalRiderActorId;
  created_by: string;
  state: TripState;
  delivery_ids: string[];
  created_at: string;
  started_at?: string;
  closed_at?: string;
  close_mode?: CloseMode;
  last_event_id: string;
  contract_version: ContractVersion;
  policy_bundle_id: string;
  return_evidence?: Record<string, unknown>;
  manual_close_reason?: string;
  manual_close_actor?: string;
  /** Estado antes de sem_atualizacao, para recovery */
  state_before_signal_loss?: TripState;
}

export interface HandoffVolumes {
  expected: number;
  delivered: number;
}

/**
 * Handoff / Expedição iFood.
 * external_courier_ref: mínimo, opcional se só verified+method.
 * Courier NÃO é usuário do módulo.
 */
export interface Handoff {
  handoff_id: string;
  unit_id: string;
  external_order_ref: string;
  /** Ref. mascarada/código plataforma — NUNCA InternalRiderActorId */
  external_courier_ref?: ExternalCourierRef;
  state: HandoffState;
  arrived_at?: string;
  conference_actor?: string;
  handoff_actor?: string;
  volumes?: HandoffVolumes;
  integrity_ok?: boolean;
  courier_verified: boolean;
  courier_verification_method?: string;
  handoff_at?: string;
  confirmed: boolean;
  exception?: string;
  contract_version: ContractVersion;
}

export interface ActorSnapshot {
  actor_id: InternalRiderActorId;
  availability: ActorAvailabilityState;
  occurrence_blocking_availability: boolean;
  active_trip_id?: string;
}

export type DomainErrorCode =
  | "INVALID_TRANSITION"
  | "PRECONDITION_FAILED"
  | "IDEMPOTENT_REPLAY"
  | "MAX_STOPS_EXCEEDED"
  | "HANDOFF_NOT_VERIFIED"
  | "HANDOFF_VOLUMES_MISMATCH"
  | "GPS_CANNOT_CONFIRM_DELIVERY"
  | "FORBIDDEN_ACTOR_MIX"
  | "TRIP_TERMINAL"
  | "NO_ACTIVE_DELIVERIES";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type ApplyResult<T> =
  | { ok: true; state: T; events: DomainEvent[]; replayed?: boolean }
  | { ok: false; error: DomainError };
