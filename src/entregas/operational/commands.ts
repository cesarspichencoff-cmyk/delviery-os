import type { InternalRiderActorId, ExternalCourierRef } from "../foundation/brands";
import type { ActorContext } from "./auth";
import type { Channel } from "../foundation/enums";
import type { HandoffVolumes } from "../foundation/types";

/** Commands = intenção autorizada (não são eventos) */
export type Command =
  | CreateTripCmd
  | AddDeliveryToTripCmd
  | RemoveDeliveryFromTripCmd
  | AssignInternalRiderCmd
  | ConfirmTripDepartureCmd
  | RecordArrivalDetectedCmd
  | RecordArrivalReportedCmd
  | ConfirmDeliveryCmd
  | RecordCustomerNotFoundCmd
  | StartTripReturnCmd
  | DetectReturnCmd
  | CloseTripManuallyCmd
  | StartHandoffCmd
  | ConfirmHandoffCmd
  | CreateOccurrenceCmd
  | ResolveOccurrenceCmd
  | SetRiderPauseCmd
  | SetRiderSupportCmd
  | RecordReturnRequestedCmd
  | CancelDeliveryCmd;

interface CmdBase {
  command_id: string;
  occurred_at: string;
  actor: ActorContext;
  unit_id: string;
  idempotency_key?: string;
}

export interface CreateTripCmd extends CmdBase {
  type: "CreateTrip";
  trip_id: string;
  courier_actor_id: InternalRiderActorId;
  deliveries: Array<{ delivery_id: string; order_ref: string; channel?: Channel }>;
}

export interface AddDeliveryToTripCmd extends CmdBase {
  type: "AddDeliveryToTrip";
  trip_id: string;
  delivery_id: string;
  order_ref: string;
  planned_stop_order: number;
  channel?: Channel;
  reason?: string;
}

export interface RemoveDeliveryFromTripCmd extends CmdBase {
  type: "RemoveDeliveryFromTrip";
  trip_id: string;
  delivery_id: string;
  reason: string;
}

export interface AssignInternalRiderCmd extends CmdBase {
  type: "AssignInternalRider";
  trip_id: string;
  courier_actor_id: InternalRiderActorId;
}

export interface ConfirmTripDepartureCmd extends CmdBase {
  type: "ConfirmTripDeparture";
  trip_id: string;
}

/**
 * Chegada observada pelo SISTEMA. `source` existe por compatibilidade com o
 * histórico; toque humano deve usar `RecordArrivalReported`.
 */
export interface RecordArrivalDetectedCmd extends CmdBase {
  type: "RecordArrivalDetected";
  trip_id: string;
  delivery_id: string;
  /** evidência de rota — NÃO confirma entrega */
  source?: "gps" | "manual";
}

/**
 * Chegada RELATADA pelo motoboy (botão "Cheguei"). Ato humano.
 * Também NÃO confirma entrega.
 */
export interface RecordArrivalReportedCmd extends CmdBase {
  type: "RecordArrivalReported";
  trip_id: string;
  delivery_id: string;
}

export interface ConfirmDeliveryCmd extends CmdBase {
  type: "ConfirmDelivery";
  trip_id: string;
  delivery_id: string;
}

export interface RecordCustomerNotFoundCmd extends CmdBase {
  type: "RecordCustomerNotFound";
  trip_id: string;
  delivery_id: string;
}

export interface StartTripReturnCmd extends CmdBase {
  type: "StartTripReturn";
  trip_id: string;
}

export interface DetectReturnCmd extends CmdBase {
  type: "DetectReturn";
  trip_id: string;
  evidence: {
    in_store_geofence: boolean;
    accuracy_error_m: number;
    max_horizontal_accuracy_m: number;
    dwell_s: number;
    min_dwell_s: number;
    speed_mps: number;
    max_speed_mps: number;
    gps_recent: boolean;
  };
}

export interface CloseTripManuallyCmd extends CmdBase {
  type: "CloseTripManually";
  trip_id: string;
  reason: string;
}

export interface StartHandoffCmd extends CmdBase {
  type: "StartHandoff";
  handoff_id: string;
  external_order_ref: string;
}

export interface ConfirmHandoffCmd extends CmdBase {
  type: "ConfirmHandoff";
  handoff_id: string;
  conference_actor: string;
  handoff_actor: string;
  courier_verified: boolean;
  courier_verification_method: string;
  external_courier_ref?: ExternalCourierRef;
  volumes: HandoffVolumes;
  order_identified: boolean;
  /** Campo impresso "Entregador" NÃO deve ser usado como rider */
  printed_entregador_field?: string;
}

export interface CreateOccurrenceCmd extends CmdBase {
  type: "CreateOccurrence";
  occurrence_id: string;
  occurrence_type: string;
  report: string;
  blocks_availability?: boolean;
  related_trip_id?: string;
  related_delivery_id?: string;
}

export interface ResolveOccurrenceCmd extends CmdBase {
  type: "ResolveOccurrence";
  occurrence_id: string;
  state:
    | "resolvida"
    | "fechada_sem_confirmacao"
    | "nao_resolvida"
    | "informacao_insuficiente";
  executed_action?: string;
  evidence?: string;
}

export interface SetRiderPauseCmd extends CmdBase {
  type: "SetRiderPause";
  rider_id: InternalRiderActorId;
  paused: boolean;
}

export interface SetRiderSupportCmd extends CmdBase {
  type: "SetRiderSupport";
  rider_id: InternalRiderActorId;
  support: boolean;
}

export interface RecordReturnRequestedCmd extends CmdBase {
  type: "RecordReturnRequested";
  trip_id: string;
  delivery_id: string;
}

export interface CancelDeliveryCmd extends CmdBase {
  type: "CancelDelivery";
  trip_id: string;
  delivery_id: string;
  reason: string;
}
