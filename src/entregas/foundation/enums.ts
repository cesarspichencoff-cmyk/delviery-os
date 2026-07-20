/** Enumerações fechadas — COR-ENTREGAS-V1 @ 1.0.3 */

export const TRIP_STATES = [
  "preparando_saida",
  "em_rota",
  "retornando",
  "encerrada",
  "sem_atualizacao",
] as const;
export type TripState = (typeof TRIP_STATES)[number];

export const DELIVERY_STATES = [
  "aguardando_saida",
  "em_rota",
  "chegada_detectada",
  "entregue_confirmado",
  "entrega_sem_confirmacao",
  "cliente_nao_encontrado",
  "retorno_solicitado",
  "cancelada",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/** Desfechos que resolvem a parada para require_all_active_stops_resolved (simplificado F0) */
export const DELIVERY_RESOLVED_STATES: DeliveryState[] = [
  "entregue_confirmado",
  "entrega_sem_confirmacao",
  "cliente_nao_encontrado",
  "retorno_solicitado",
  "cancelada",
];

export const ACTOR_AVAILABILITY_STATES = [
  "disponivel",
  "preparando_saida",
  "em_rota",
  "retornando",
  "apoio_expedicao",
  "pausa",
  "indisponivel",
  "sem_atualizacao",
] as const;
export type ActorAvailabilityState = (typeof ACTOR_AVAILABILITY_STATES)[number];

export const HANDOFF_STATES = [
  "aguardando_courier",
  "em_conferencia",
  "repassado",
  "excecao",
  "cancelado",
] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export const OCCURRENCE_STATES = [
  "aberta",
  "aguardando_cliente",
  "aguardando_operacao",
  "em_tratamento",
  "reenvio_em_andamento",
  "retorno_solicitado",
  "resolvida",
  "fechada_sem_confirmacao",
  "nao_resolvida",
  "informacao_insuficiente",
] as const;
export type OccurrenceState = (typeof OCCURRENCE_STATES)[number];

export const OBJECT_TYPES = [
  "trip",
  "delivery",
  "handoff",
  "occurrence",
  "actor",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const EVENT_ORIGINS = ["device", "ops_console", "system"] as const;
export type EventOrigin = (typeof EVENT_ORIGINS)[number];

export const CLOCK_TRUST = ["trusted", "suspect", "unknown"] as const;
export type ClockTrust = (typeof CLOCK_TRUST)[number];

export const CLOSE_MODES = ["automatic", "manual"] as const;
export type CloseMode = (typeof CLOSE_MODES)[number];

/** Gatilhos G1–G5 — COR §14.2 */
export const UNCONFIRMED_TRIGGERS = [
  "G1_left_destination_area",
  "G2_next_stop_started",
  "G3_trip_returning",
  "G4_trip_closed",
  "G5_timeout_after_arrival",
] as const;
export type UnconfirmedTrigger = (typeof UNCONFIRMED_TRIGGERS)[number];

export const TRIP_EVENT_TYPES = [
  "trip_created",
  "delivery_added",
  "delivery_removed",
  "stop_reordered",
  "trip_started",
  "trip_return_started",
  "return_detected",
  "trip_closed_automatic",
  "trip_closed_manual",
  "trip_signal_lost",
  "trip_signal_recovered",
  "trip_admin_correction_recorded",
  "sync_received",
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export const DELIVERY_EVENT_TYPES = [
  "delivery_departed",
  "arrival_detected",
  "delivery_confirmed",
  "delivery_unconfirmed",
  "customer_not_found",
  "return_requested",
  "delivery_cancelled",
] as const;
export type DeliveryEventType = (typeof DELIVERY_EVENT_TYPES)[number];

export const HANDOFF_EVENT_TYPES = [
  "handoff_created",
  "handoff_courier_arrived",
  "handoff_conference_done",
  "handoff_transferred",
  "handoff_exception",
] as const;
export type HandoffEventType = (typeof HANDOFF_EVENT_TYPES)[number];

export type Channel = "proprio" | "ifood" | "app" | "desconhecido";
