import type { DeviceIdentity } from "./device-identity-client";

export const CAPTURE_ACTIVE_TRIP_STATES = [
  "em_rota",
  "retornando",
  "sem_atualizacao",
] as const;

export const CAPTURE_STOP_TRIP_STATES = [
  "preparando_saida",
  "encerrada",
] as const;

export interface TripCaptureView {
  trip_id: string;
  unit_id: string;
  courier_actor_id: string;
  state: string;
}

export type CaptureControlDecision =
  | { decision: "continue"; trip_id: string; reason: null }
  | { decision: "stop"; trip_id: string; reason: string }
  | { decision: "unknown"; trip_id: string; reason: string };

export function decidirControleDeCaptura(
  identity: DeviceIdentity,
  tripId: string,
  trip: TripCaptureView | null,
): CaptureControlDecision {
  if (!identity.actor_id) return { decision: "unknown", trip_id: tripId, reason: "device_without_actor" };
  if (!trip) return { decision: "stop", trip_id: tripId, reason: "trip_not_found" };
  if (trip.trip_id !== tripId) return { decision: "unknown", trip_id: tripId, reason: "trip_identity_mismatch" };
  if (trip.unit_id !== identity.unit_id || trip.courier_actor_id !== identity.actor_id) {
    return { decision: "stop", trip_id: tripId, reason: "trip_not_bound_to_device" };
  }
  if ((CAPTURE_ACTIVE_TRIP_STATES as readonly string[]).includes(trip.state)) {
    return { decision: "continue", trip_id: tripId, reason: null };
  }
  if ((CAPTURE_STOP_TRIP_STATES as readonly string[]).includes(trip.state)) {
    return { decision: "stop", trip_id: tripId, reason: "trip_not_active" };
  }
  // Estado novo/corrompido não prova término. Privacidade continua protegida
  // pelos estados conhecidos de stop; forward-compatibility não vira perda
  // silenciosa de captura.
  return { decision: "unknown", trip_id: tripId, reason: "trip_state_unknown" };
}
