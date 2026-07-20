import type { InternalRiderActorId } from "../foundation/brands";
import type { ActorAvailabilityState } from "../foundation/enums";
import {
  availabilityForTripState,
  resolveAvailabilityAfterTripClose,
} from "../foundation/actor-availability";
import type { Trip } from "../foundation/types";

export interface RiderOperationalState {
  rider_id: InternalRiderActorId;
  unit_id: string;
  availability: ActorAvailabilityState;
  occurrence_blocking_availability: boolean;
  active_trip_id?: string;
  version: number;
  updated_at: string;
}

export function createRiderState(
  rider_id: InternalRiderActorId,
  unit_id: string,
  at: string,
): RiderOperationalState {
  return {
    rider_id,
    unit_id,
    availability: "disponivel",
    occurrence_blocking_availability: false,
    version: 1,
    updated_at: at,
  };
}

export function applyTripStateToRider(
  rider: RiderOperationalState,
  trip: Trip,
  at: string,
): RiderOperationalState {
  if (trip.courier_actor_id !== rider.rider_id) return rider;
  if (trip.state === "encerrada") {
    const next = resolveAvailabilityAfterTripClose(
      {
        actor_id: rider.rider_id,
        availability: rider.availability,
        occurrence_blocking_availability:
          rider.occurrence_blocking_availability,
        active_trip_id: rider.active_trip_id,
      },
      trip,
    );
    return {
      ...rider,
      availability: next,
      active_trip_id: undefined,
      version: rider.version + 1,
      updated_at: at,
    };
  }
  return {
    ...rider,
    availability: availabilityForTripState(trip.state),
    active_trip_id: trip.trip_id,
    version: rider.version + 1,
    updated_at: at,
  };
}

export function setRiderAvailability(
  rider: RiderOperationalState,
  availability: ActorAvailabilityState,
  at: string,
): RiderOperationalState {
  return {
    ...rider,
    availability,
    version: rider.version + 1,
    updated_at: at,
  };
}

export function setOccurrenceBlocking(
  rider: RiderOperationalState,
  blocks: boolean,
  at: string,
): RiderOperationalState {
  return {
    ...rider,
    occurrence_blocking_availability: blocks,
    version: rider.version + 1,
    updated_at: at,
  };
}
