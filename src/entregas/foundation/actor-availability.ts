import type { InternalRiderActorId } from "./brands";
import type { ActorAvailabilityState } from "./enums";
import type { ActorSnapshot, Trip } from "./types";

/**
 * Precedência COR §15 — maior bloqueio vence auto-disponivel após retorno.
 */
export function resolveAvailabilityAfterTripClose(
  actor: ActorSnapshot,
  closedTrip: Trip,
): ActorAvailabilityState {
  if (closedTrip.courier_actor_id !== actor.actor_id) {
    return actor.availability;
  }
  if (actor.availability === "indisponivel") return "indisponivel";
  if (actor.availability === "pausa") return "pausa";
  if (actor.availability === "apoio_expedicao") return "apoio_expedicao";
  if (actor.occurrence_blocking_availability) {
    // flag blocks_availability — não auto-disponivel
    return actor.availability === "sem_atualizacao"
      ? "sem_atualizacao"
      : actor.availability;
  }
  if (actor.availability === "sem_atualizacao") return "sem_atualizacao";
  return "disponivel";
}

export function availabilityForTripState(
  tripState: Trip["state"],
): ActorAvailabilityState {
  switch (tripState) {
    case "preparando_saida":
      return "preparando_saida";
    case "em_rota":
      return "em_rota";
    case "retornando":
      return "retornando";
    case "sem_atualizacao":
      return "sem_atualizacao";
    case "encerrada":
      return "disponivel";
    default:
      return "sem_atualizacao";
  }
}

export function createActorSnapshot(
  actor_id: InternalRiderActorId,
  availability: ActorAvailabilityState = "disponivel",
): ActorSnapshot {
  return {
    actor_id,
    availability,
    occurrence_blocking_availability: false,
  };
}
